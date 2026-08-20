const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { PassThrough } = require('stream');

const app = express();

// CORS - allow Vercel frontend
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer - memory storage
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }
});

// Helper: upload buffer to Cloudinary using built-in PassThrough
const uploadToCloudinary = (buffer, folder, resourceType = 'auto') => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: folder || 'dali-films', resource_type: resourceType },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    const passthrough = new PassThrough();
    passthrough.pipe(stream);
    passthrough.end(buffer);
  });
};

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/dali';
let dbConnected = false;

mongoose.connect(MONGODB_URI)
  .then(() => { dbConnected = true; console.log('MongoDB Connected'); })
  .catch(err => console.error('MongoDB Error:', err.message));

// ========== MODELS ==========

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['viewer', 'filmmaker', 'admin'], default: 'viewer' },
  phone: { type: String, default: '' },
  bio: { type: String, default: '' },
  avatar: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

const FilmSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  synopsis: { type: String, default: '' },
  genre: { type: String, required: true },
  duration: { type: String, default: '' },
  year: { type: String, default: '' },
  country: { type: String, default: '' },
  language: { type: String, default: '' },
  director: { type: String, default: '' },
  cast: { type: String, default: '' },
  poster: { type: String, default: '' },
  trailerUrl: { type: String, default: '' },
  videoUrl: { type: String, default: '' },
  filmmaker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  filmmakerName: { type: String, default: '' },
  status: { type: String, enum: ['pending_review', 'processing', 'approved', 'rejected'], default: 'pending_review' },
  rejectionReason: { type: String, default: '' },
  adminNotes: { type: String, default: '' },
  views: { type: Number, default: 0 },
  uniqueViewers: [{ type: String }],
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  likesCount: { type: Number, default: 0 },
  earnings: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 },
  payoutRequested: { type: Boolean, default: false },
  payoutStatus: { type: String, enum: ['none', 'pending', 'paid', 'rejected'], default: 'none' },
  payoutAmount: { type: Number, default: 0 },
  payoutDate: { type: Date },
  payoutMethod: { type: String, default: '' },
  payoutPhone: { type: String, default: '' },
  featured: { type: Boolean, default: false },
  trending: { type: Boolean, default: false },
  tags: [{ type: String }],
  submittedAt: { type: Date, default: Date.now },
  publishedAt: { type: Date },
  filmmakerLinks: {
    filmUrl: { type: String, default: '' },
    trailerUrl: { type: String, default: '' },
    posterUrl: { type: String, default: '' }
  }
}, { timestamps: true });

FilmSchema.methods.calculateEarnings = function() {
  const uniqueViewCount = this.uniqueViewers ? this.uniqueViewers.length : 0;
  const rateUSD = 2;
  const exchangeRate = 3700;
  const earningsUSD = (uniqueViewCount / 500) * rateUSD;
  return Math.floor(earningsUSD * exchangeRate);
};

const NotificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, enum: ['submission', 'approval', 'rejection', 'payout', 'system'], default: 'system' },
  read: { type: Boolean, default: false },
  link: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const CommentSchema = new mongoose.Schema({
  film: { type: mongoose.Schema.Types.ObjectId, ref: 'Film', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const WatchlistSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  film: { type: mongoose.Schema.Types.ObjectId, ref: 'Film', required: true },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Film = mongoose.model('Film', FilmSchema);
const Notification = mongoose.model('Notification', NotificationSchema);
const Comment = mongoose.model('Comment', CommentSchema);
const Watchlist = mongoose.model('Watchlist', WatchlistSchema);

// ========== MIDDLEWARE ==========

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'No token' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dali_secret');
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) return res.status(401).json({ message: 'User not found' });
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token invalid' });
  }
};

const requireRole = (role) => (req, res, next) => {
  if (req.user.role !== role && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  next();
};

// ========== AUTH ROUTES ==========

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role, phone } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'All fields required' });
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already registered' });
    const user = new User({ name, email, password, role: role || 'viewer', phone: phone || '' });
    await user.save();
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'dali_secret', { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error('REGISTER ERROR:', err);
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'dali_secret', { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role, phone: user.phone || '' } });
  } catch (err) {
    console.error('LOGIN ERROR:', err);
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/auth/me', auth, async (req, res) => {
  res.json(req.user);
});

// ========== FILM ROUTES (PUBLIC) ==========

app.get('/api/films', async (req, res) => {
  try {
    const { genre, search, page = 1, limit = 20 } = req.query;
    let query = { status: 'approved' };
    if (genre && genre !== 'All') query.genre = genre;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    const films = await Film.find(query).populate('filmmaker', 'name').sort({ publishedAt: -1 }).limit(limit * 1).skip((page - 1) * limit);
    const count = await Film.countDocuments(query);
    res.json({ films, totalPages: Math.ceil(count / limit), currentPage: page });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/films/featured', async (req, res) => {
  try {
    const films = await Film.find({ status: 'approved', featured: true }).populate('filmmaker', 'name').limit(5);
    res.json(films);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/films/trending', async (req, res) => {
  try {
    const films = await Film.find({ status: 'approved' }).populate('filmmaker', 'name').sort({ views: -1 }).limit(10);
    res.json(films);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/films/:id', async (req, res) => {
  try {
    const film = await Film.findById(req.params.id).populate('filmmaker', 'name email');
    if (!film) return res.status(404).json({ message: 'Film not found' });
    res.json(film);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/films/:id/view', auth, async (req, res) => {
  try {
    const film = await Film.findById(req.params.id);
    if (!film) return res.status(404).json({ message: 'Film not found' });
    const viewerEmail = req.user.email;
    if (!film.uniqueViewers.includes(viewerEmail)) {
      film.uniqueViewers.push(viewerEmail);
      film.views = film.uniqueViewers.length;
      await film.save();
    }
    res.json({ views: film.views, uniqueViews: film.uniqueViewers.length, earnings: film.calculateEarnings() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/films/:id/like', auth, async (req, res) => {
  try {
    const film = await Film.findById(req.params.id);
    if (!film) return res.status(404).json({ message: 'Film not found' });
    const userId = req.user._id.toString();
    const liked = film.likes.map(id => id.toString()).includes(userId);
    if (liked) {
      film.likes = film.likes.filter(id => id.toString() !== userId);
      film.likesCount = Math.max(0, film.likesCount - 1);
    } else {
      film.likes.push(req.user._id);
      film.likesCount += 1;
    }
    await film.save();
    res.json({ liked: !liked, likesCount: film.likesCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/films/:id/comments', async (req, res) => {
  try {
    const comments = await Comment.find({ film: req.params.id }).populate('user', 'name').sort({ createdAt: -1 });
    res.json(comments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/films/:id/comments', auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: 'Comment text required' });
    const comment = new Comment({ film: req.params.id, user: req.user._id, userName: req.user.name, text });
    await comment.save();
    res.json(comment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ========== FILMMAKER ROUTES ==========

app.post('/api/filmmaker/submit', auth, requireRole('filmmaker'), async (req, res) => {
  try {
    const { title, description, synopsis, genre, duration, year, country, language, director, cast, filmmakerLinks } = req.body;
    const film = new Film({
      title, description, synopsis, genre, duration, year, country, language, director, cast,
      filmmaker: req.user._id, filmmakerName: req.user.name,
      filmmakerLinks: filmmakerLinks || {}, status: 'pending_review'
    });
    await film.save();
    const admins = await User.find({ role: 'admin' });
    for (const admin of admins) {
      await Notification.create({ user: admin._id, title: 'New Film Submission', message: `${req.user.name} submitted "${title}" for review`, type: 'submission', link: '/admin' });
    }
    res.json({ message: 'Film submitted successfully', film });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/filmmaker/my-films', auth, requireRole('filmmaker'), async (req, res) => {
  try {
    const films = await Film.find({ filmmaker: req.user._id, status: 'approved' }).sort({ publishedAt: -1 });
    res.json(films);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/filmmaker/submissions', auth, requireRole('filmmaker'), async (req, res) => {
  try {
    const films = await Film.find({ filmmaker: req.user._id }).sort({ submittedAt: -1 });
    res.json(films);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ========== EARNINGS ROUTES ==========

const MIN_PAYOUT_UGX = 20000;

app.get('/api/earnings/creator', auth, requireRole('filmmaker'), async (req, res) => {
  try {
    const films = await Film.find({ filmmaker: req.user._id });
    const totalUniqueViews = films.reduce((sum, f) => sum + (f.uniqueViewers?.length || 0), 0);
    const totalEarnings = films.reduce((sum, f) => sum + f.calculateEarnings(), 0);
    const paidOut = films.reduce((sum, f) => sum + (f.payoutStatus === 'paid' ? f.payoutAmount : 0), 0);
    const available = totalEarnings - paidOut;
    const canRequest = available >= MIN_PAYOUT_UGX;
    const filmStats = films.map(f => ({
      _id: f._id, title: f.title, uniqueViews: f.uniqueViewers?.length || 0,
      totalViews: f.views, earnings: f.calculateEarnings(), status: f.status,
      payoutStatus: f.payoutStatus, poster: f.poster
    }));
    res.json({ totalUniqueViews, totalEarnings, paidOut, available, canRequest, minPayout: MIN_PAYOUT_UGX, rate: '$2 per 500 unique views', films: filmStats });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/earnings/request', auth, requireRole('filmmaker'), async (req, res) => {
  try {
    const { method, phone } = req.body;
    const films = await Film.find({ filmmaker: req.user._id });
    const totalEarnings = films.reduce((sum, f) => sum + f.calculateEarnings(), 0);
    const paidOut = films.reduce((sum, f) => sum + (f.payoutStatus === 'paid' ? f.payoutAmount : 0), 0);
    const available = totalEarnings - paidOut;
    if (available < MIN_PAYOUT_UGX) {
      return res.status(400).json({ message: `Minimum payout is UGX ${MIN_PAYOUT_UGX.toLocaleString()}` });
    }
    await Film.updateMany(
      { filmmaker: req.user._id, payoutStatus: 'none', status: 'approved' },
      { $set: { payoutRequested: true, payoutStatus: 'pending', payoutAmount: available, payoutMethod: method || 'MTN Mobile Money', payoutPhone: phone || req.user.phone || '' } }
    );
    const admins = await User.find({ role: 'admin' });
    for (const admin of admins) {
      await Notification.create({ user: admin._id, title: 'Payout Requested', message: `${req.user.name} requested UGX ${available.toLocaleString()} payout`, type: 'payout', link: '/admin' });
    }
    res.json({ message: 'Payout requested successfully', amount: available, status: 'pending' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ========== ADMIN ROUTES ==========

app.get('/api/admin/submissions', auth, requireRole('admin'), async (req, res) => {
  try {
    const films = await Film.find({ status: { $in: ['pending_review', 'processing'] } }).populate('filmmaker', 'name email phone').sort({ submittedAt: -1 });
    res.json(films);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/admin/films', auth, requireRole('admin'), async (req, res) => {
  try {
    const films = await Film.find({ status: 'approved' }).populate('filmmaker', 'name email phone').sort({ publishedAt: -1 });
    res.json(films);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/admin/films/:id/analytics', auth, requireRole('admin'), async (req, res) => {
  try {
    const film = await Film.findById(req.params.id).populate('filmmaker', 'name email phone');
    if (!film) return res.status(404).json({ message: 'Film not found' });
    const comments = await Comment.countDocuments({ film: req.params.id });
    res.json({
      film: { _id: film._id, title: film.title, poster: film.poster, filmmaker: film.filmmaker, status: film.status, publishedAt: film.publishedAt },
      analytics: { totalViews: film.views, uniqueViews: film.uniqueViewers?.length || 0, likes: film.likesCount, comments, earnings: film.calculateEarnings(), payoutStatus: film.payoutStatus, payoutAmount: film.payoutAmount }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.delete('/api/admin/films/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    const film = await Film.findById(req.params.id);
    if (!film) return res.status(404).json({ message: 'Film not found' });
    if (film.poster && film.poster.includes('cloudinary')) {
      try { const publicId = film.poster.split('/upload/')[1]?.split('.')[0]; if (publicId) cloudinary.uploader.destroy(publicId); } catch(e) {}
    }
    await Film.findByIdAndDelete(req.params.id);
    await Comment.deleteMany({ film: req.params.id });
    await Notification.create({ user: film.filmmaker, title: 'Film Removed', message: `Your film "${film.title}" has been removed from the platform`, type: 'system' });
    res.json({ message: 'Film deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUBLISH - poster/trailer uploaded to Cloudinary, video URL pasted by admin
app.post('/api/admin/films/:id/publish', auth, requireRole('admin'), upload.fields([
  { name: 'poster', maxCount: 1 },
  { name: 'trailer', maxCount: 1 }
]), async (req, res) => {
  try {
    console.log('=== PUBLISH HIT ===');
    console.log('Film ID:', req.params.id);
    console.log('Files keys:', req.files ? Object.keys(req.files) : 'none');
    console.log('Body videoUrl:', req.body.videoUrl);

    const film = await Film.findById(req.params.id);
    if (!film) return res.status(404).json({ message: 'Film not found' });

    const updates = { status: 'approved', publishedAt: new Date() };

    if (req.files && req.files.poster && req.files.poster[0]) {
      try {
        console.log('Uploading poster, size:', req.files.poster[0].size);
        updates.poster = await uploadToCloudinary(req.files.poster[0].buffer, 'dali-films/posters', 'image');
        console.log('Poster OK:', updates.poster);
      } catch (uploadErr) {
        console.error('Poster upload error:', uploadErr);
        return res.status(500).json({ message: 'Poster upload failed: ' + uploadErr.message });
      }
    }

    if (req.files && req.files.trailer && req.files.trailer[0]) {
      try {
        console.log('Uploading trailer, size:', req.files.trailer[0].size);
        updates.trailerUrl = await uploadToCloudinary(req.files.trailer[0].buffer, 'dali-films/trailers', 'video');
        console.log('Trailer OK:', updates.trailerUrl);
      } catch (uploadErr) {
        console.error('Trailer upload error:', uploadErr);
        return res.status(500).json({ message: 'Trailer upload failed: ' + uploadErr.message });
      }
    }

    // Video URL pasted by admin (uploaded directly to Cloudinary)
    if (req.body.videoUrl) {
      updates.videoUrl = req.body.videoUrl;
      console.log('Video URL set:', updates.videoUrl);
    }

    if (req.body.adminNotes) updates.adminNotes = req.body.adminNotes;
    if (req.body.featured === 'true') updates.featured = true;

    Object.assign(film, updates);
    await film.save();

    await Notification.create({
      user: film.filmmaker,
      title: 'Film Approved',
      message: `Congratulations! Your film "${film.title}" is now live on DALI`,
      type: 'approval',
      link: `/film/${film._id}`
    });

    console.log('=== PUBLISH SUCCESS ===');
    res.json({ message: 'Film published successfully', film });
  } catch (err) {
    console.error('=== PUBLISH ERROR ===', err);
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/admin/films/:id/reject', auth, requireRole('admin'), async (req, res) => {
  try {
    const { reason } = req.body;
    const film = await Film.findById(req.params.id);
    if (!film) return res.status(404).json({ message: 'Film not found' });
    film.status = 'rejected';
    film.rejectionReason = reason || 'Not specified';
    await film.save();
    await Notification.create({ user: film.filmmaker, title: 'Film Rejected', message: `Your film "${film.title}" was not approved. Reason: ${film.rejectionReason}`, type: 'rejection', link: '/dashboard' });
    res.json({ message: 'Film rejected', film });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/admin/films/:id/processing', auth, requireRole('admin'), async (req, res) => {
  try {
    const film = await Film.findById(req.params.id);
    if (!film) return res.status(404).json({ message: 'Film not found' });
    film.status = 'processing';
    await film.save();
    res.json({ message: 'Film marked as processing', film });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/admin/payouts', auth, requireRole('admin'), async (req, res) => {
  try {
    const films = await Film.find({ payoutStatus: 'pending' }).populate('filmmaker', 'name email phone');
    const payouts = films.map(f => ({ _id: f._id, filmmaker: f.filmmaker, title: f.title, amount: f.payoutAmount, method: f.payoutMethod, phone: f.payoutPhone, requestedAt: f.updatedAt, uniqueViews: f.uniqueViewers?.length || 0 }));
    res.json(payouts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/admin/payouts/:id/pay', auth, requireRole('admin'), async (req, res) => {
  try {
    const film = await Film.findById(req.params.id);
    if (!film) return res.status(404).json({ message: 'Film not found' });
    if (film.payoutStatus !== 'pending') return res.status(400).json({ message: 'No pending payout' });
    film.payoutStatus = 'paid';
    film.payoutDate = new Date();
    film.totalEarnings += film.payoutAmount;
    await film.save();
    await Notification.create({ user: film.filmmaker, title: 'Payout Sent', message: `UGX ${film.payoutAmount.toLocaleString()} has been sent for "${film.title}"`, type: 'payout' });
    res.json({ message: 'Payout marked as paid', film });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/admin/payouts/:id/reject', auth, requireRole('admin'), async (req, res) => {
  try {
    const film = await Film.findById(req.params.id);
    if (!film) return res.status(404).json({ message: 'Film not found' });
    film.payoutStatus = 'rejected';
    film.payoutRequested = false;
    await film.save();
    res.json({ message: 'Payout rejected', film });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ========== NOTIFICATION ROUTES ==========

app.get('/api/notifications', auth, async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50);
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/notifications/unread-count', auth, async (req, res) => {
  try {
    const count = await Notification.countDocuments({ user: req.user._id, read: false });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.put('/api/notifications/:id/read', auth, async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { read: true });
    res.json({ message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.put('/api/notifications/read-all', auth, async (req, res) => {
  try {
    await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
    res.json({ message: 'All marked as read' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ========== WATCHLIST ROUTES ==========

app.get('/api/watchlist', auth, async (req, res) => {
  try {
    const items = await Watchlist.find({ user: req.user._id }).populate('film').sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/watchlist/:filmId', auth, async (req, res) => {
  try {
    const existing = await Watchlist.findOne({ user: req.user._id, film: req.params.filmId });
    if (existing) {
      await Watchlist.findByIdAndDelete(existing._id);
      return res.json({ message: 'Removed from watchlist', inWatchlist: false });
    }
    await Watchlist.create({ user: req.user._id, film: req.params.filmId });
    res.json({ message: 'Added to watchlist', inWatchlist: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/watchlist/check/:filmId', auth, async (req, res) => {
  try {
    const existing = await Watchlist.findOne({ user: req.user._id, film: req.params.filmId });
    res.json({ inWatchlist: !!existing });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ========== HEALTH CHECK ==========

app.get('/', (req, res) => {
  res.json({ status: 'DALI Backend Running', dbConnected, timestamp: new Date().toISOString() });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', dbConnected, timestamp: new Date().toISOString() });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('GLOBAL ERROR:', err.stack);
  res.status(500).json({ message: 'Something went wrong!', error: err.message });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// CRITICAL: Increase timeout for large file uploads to Cloudinary
// Render kills connections after 100s by default - we need 5 minutes for videos
server.timeout = 300000;           // 5 minutes
server.keepAliveTimeout = 300000;  // 5 minutes
server.headersTimeout = 300000;    // 5 minutes
