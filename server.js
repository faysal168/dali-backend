const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

const app = express();
app.use(cors());
app.use(express.json());

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer (memory storage)
const upload = multer({ storage: multer.memoryStorage() });

// MongoDB
const MONGO_URI = process.env.MONGODB_URI || '';
mongoose.connect(MONGO_URI).then(() => console.log('MongoDB connected')).catch(e => console.error('MongoDB error:', e.message));

const JWT_SECRET = process.env.JWT_SECRET || 'dali_secret';

// ========== MODELS ==========
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String },
  role: { type: String, enum: ['viewer', 'filmmaker', 'admin'], default: 'viewer' },
  phone: { type: String, default: '' },
  bio: { type: String, default: '' },
  avatar: { type: String, default: '' },
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  watchlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Film' }],
  verified: { type: Boolean, default: false }
}, { timestamps: true });
const User = mongoose.model('User', userSchema);

const filmSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  synopsis: { type: String },
  genre: { type: String, required: true },
  duration: { type: String },
  year: { type: String },
  country: { type: String },
  language: { type: String },
  director: { type: String },
  cast: { type: String },
  poster: { type: String, default: '' },
  trailerUrl: { type: String, default: '' },
  videoUrl: { type: String, default: '' },
  filmmaker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  filmmakerName: { type: String },
  status: { type: String, enum: ['pending_review', 'processing', 'approved', 'rejected'], default: 'pending_review' },
  rejectionReason: { type: String, default: '' },
  adminNotes: { type: String, default: '' },
  views: { type: Number, default: 0 },
  uniqueViewers: [{ type: String }],
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  likesCount: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 },
  paidOut: { type: Number, default: 0 },
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

filmSchema.methods.calculateEarnings = function() {
  const uniqueViewCount = this.uniqueViewers ? this.uniqueViewers.length : 0;
  const blocksOf500 = Math.floor(uniqueViewCount / 500);
  const earningsUSD = blocksOf500 * 2;
  return Math.floor(earningsUSD * 3700);
};
const Film = mongoose.model('Film', filmSchema);

const commentSchema = new mongoose.Schema({
  film: { type: mongoose.Schema.Types.ObjectId, ref: 'Film', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true }
}, { timestamps: true });
const Comment = mongoose.model('Comment', commentSchema);

const watchlistSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  film: { type: mongoose.Schema.Types.ObjectId, ref: 'Film', required: true }
}, { timestamps: true });
const Watchlist = mongoose.model('Watchlist', watchlistSchema);

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true },
  read: { type: Boolean, default: false },
  type: { type: String, default: 'general' },
  link: { type: String, default: '' }
}, { timestamps: true });
const Notification = mongoose.model('Notification', notificationSchema);

// ========== AUTH MIDDLEWARE ==========
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'No token' });
    const decoded = jwt.verify(token, JWT_SECRET);
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
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Name, email, and password required' });
    let user = await User.findOne({ email });
    if (user && user.password) return res.status(400).json({ message: 'User already exists' });
    const hashed = await bcrypt.hash(password, 10);
    if (user && !user.password) {
      user.name = name; user.password = hashed; user.role = role || user.role || 'viewer';
      await user.save();
      const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ token, user: { _id: user._id, name: user.name, email: user.email, role: user.role } });
    }
    user = new User({ name, email, password: hashed, role: role || 'viewer' });
    await user.save();
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { _id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });
    if (!user.password) return res.status(400).json({ message: 'Account password missing. Please sign up again' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { _id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/auth/me', auth, async (req, res) => {
  try { res.json(req.user); } catch (err) { res.status(500).json({ message: err.message }); }
});

app.put('/api/auth/profile', auth, async (req, res) => {
  try {
    const { name, phone, bio } = req.body;
    const user = await User.findByIdAndUpdate(req.user._id, { name, phone, bio }, { new: true }).select('-password');
    res.json(user);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'User not found' });
    res.json({ message: 'Password reset link sent to your email' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ========== FILM ROUTES ==========
app.get('/api/films', async (req, res) => {
  try {
    const films = await Film.find({ status: 'approved' }).populate('filmmaker', 'name').sort({ publishedAt: -1 });
    res.json(films);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/films/featured', async (req, res) => {
  try {
    const films = await Film.find({ status: 'approved', featured: true }).populate('filmmaker', 'name').limit(6);
    res.json(films);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/films/trending', async (req, res) => {
  try {
    const films = await Film.find({ status: 'approved' }).populate('filmmaker', 'name').sort({ views: -1 }).limit(10);
    res.json(films);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/films/:id', async (req, res) => {
  try {
    const film = await Film.findById(req.params.id).populate('filmmaker', 'name email');
    if (!film) return res.status(404).json({ message: 'Film not found' });
    res.json(film);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/films/:id/view', auth, async (req, res) => {
  try {
    const film = await Film.findById(req.params.id);
    if (!film) return res.status(404).json({ message: 'Film not found' });
    const viewerEmail = req.user.email;
    const alreadyViewed = film.uniqueViewers.includes(viewerEmail);
    if (!alreadyViewed) {
      film.uniqueViewers.push(viewerEmail);
      film.views += 1;
      await film.save();
    }
    res.json({ views: film.views, uniqueViews: film.uniqueViewers.length, counted: !alreadyViewed });
  } catch (err) { res.status(500).json({ message: err.message }); }
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
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/films/:id/comments', async (req, res) => {
  try {
    const comments = await Comment.find({ film: req.params.id }).populate('user', 'name').sort({ createdAt: -1 });
    res.json(comments);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/films/:id/comments', auth, async (req, res) => {
  try {
    const comment = new Comment({ film: req.params.id, user: req.user._id, text: req.body.text });
    await comment.save();
    await comment.populate('user', 'name');
    res.json(comment);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ========== FILMMAKER ROUTES ==========
app.post('/api/filmmaker/submit', auth, requireRole('filmmaker'), async (req, res) => {
  try {
    const { title, description, genre, synopsis, duration, year, country, language, director, cast, filmUrl, trailerUrl, posterUrl } = req.body;
    const film = new Film({
      title, description, genre, synopsis, duration, year, country, language, director, cast,
      filmmaker: req.user._id,
      filmmakerName: req.user.name,
      filmmakerLinks: { filmUrl, trailerUrl, posterUrl }
    });
    await film.save();

    // Notify all admins
    const admins = await User.find({ role: 'admin' });
    for (const admin of admins) {
      await new Notification({
        user: admin._id,
        message: `New film "${title}" submitted by ${req.user.name} for review`,
        type: 'submission',
        link: `/admin`
      }).save();
    }

    res.json({ message: 'Film submitted for review', film });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/filmmaker/my-films', auth, requireRole('filmmaker'), async (req, res) => {
  try {
    const films = await Film.find({ filmmaker: req.user._id }).sort({ submittedAt: -1 });
    res.json({ films });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/filmmaker/stats', auth, requireRole('filmmaker'), async (req, res) => {
  try {
    const films = await Film.find({ filmmaker: req.user._id });
    const totalFilms = films.length;
    const approved = films.filter(f => f.status === 'approved').length;
    const pending = films.filter(f => f.status === 'pending_review').length;
    const totalViews = films.reduce((sum, f) => sum + f.views, 0);
    res.json({ totalFilms, approved, pending, totalViews });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ========== CLOUDINARY UPLOAD (ADMIN) ==========
app.post('/api/admin/upload/:id', auth, requireRole('admin'), upload.fields([
  { name: 'poster', maxCount: 1 },
  { name: 'trailer', maxCount: 1 },
  { name: 'video', maxCount: 1 }
]), async (req, res) => {
  try {
    const film = await Film.findById(req.params.id).populate('filmmaker', 'name email _id');
    if (!film) return res.status(404).json({ message: 'Film not found' });

    const uploads = {};

    // Upload poster (image)
    if (req.files?.poster?.[0]) {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'dali/posters', resource_type: 'image' },
          (err, result) => { if (err) reject(err); else resolve(result); }
        );
        stream.end(req.files.poster[0].buffer);
      });
      uploads.poster = result.secure_url;
    }

    // Upload trailer (video)
    if (req.files?.trailer?.[0]) {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'dali/trailers', resource_type: 'video' },
          (err, result) => { if (err) reject(err); else resolve(result); }
        );
        stream.end(req.files.trailer[0].buffer);
      });
      uploads.trailerUrl = result.secure_url;
    }

    // Upload film video
    if (req.files?.video?.[0]) {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'dali/films', resource_type: 'video' },
          (err, result) => { if (err) reject(err); else resolve(result); }
        );
        stream.end(req.files.video[0].buffer);
      });
      uploads.videoUrl = result.secure_url;
    }

    // Update film
    if (uploads.poster) film.poster = uploads.poster;
    if (uploads.trailerUrl) film.trailerUrl = uploads.trailerUrl;
    if (uploads.videoUrl) film.videoUrl = uploads.videoUrl;
    film.status = 'approved';
    film.publishedAt = new Date();
    await film.save();

    // Notify filmmaker
    await new Notification({
      user: film.filmmaker._id,
      message: `Your film "${film.title}" has been approved and published!`,
      type: 'approval',
      link: `/film/${film._id}`
    }).save();

    res.json({ message: 'Film published with Cloudinary assets', film, uploads });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ========== ADMIN ROUTES ==========
app.get('/api/admin/overview', auth, requireRole('admin'), async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const filmmakers = await User.countDocuments({ role: 'filmmaker' });
    const totalFilms = await Film.countDocuments();
    const pendingSubmissions = await Film.countDocuments({ status: 'pending_review' });
    const totalViews = await Film.aggregate([{ $group: { _id: null, total: { $sum: '$views' } } }]);
    res.json({ totalUsers, filmmakers, totalFilms, pendingSubmissions, totalViews: totalViews[0]?.total || 0 });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/admin/submissions', auth, requireRole('admin'), async (req, res) => {
  try {
    const submissions = await Film.find({ status: { $in: ['pending_review', 'processing'] } }).populate('filmmaker', 'name email').sort({ submittedAt: -1 });
    res.json({ submissions });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/admin/users', auth, requireRole('admin'), async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json({ users });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/admin/reports', auth, requireRole('admin'), async (req, res) => {
  try {
    res.json({ reports: [] });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/admin/approve/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    const { videoUrl, poster, trailerUrl, status } = req.body;
    const film = await Film.findById(req.params.id).populate('filmmaker', '_id name');
    if (!film) return res.status(404).json({ message: 'Film not found' });
    if (videoUrl) film.videoUrl = videoUrl;
    if (poster) film.poster = poster;
    if (trailerUrl) film.trailerUrl = trailerUrl;
    film.status = status || 'approved';
    film.publishedAt = new Date();
    await film.save();

    await new Notification({
      user: film.filmmaker._id,
      message: `Your film "${film.title}" has been approved and published!`,
      type: 'approval',
      link: `/film/${film._id}`
    }).save();

    res.json({ message: 'Film approved', film });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/admin/reject/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    const { reason } = req.body;
    const film = await Film.findByIdAndUpdate(req.params.id, { status: 'rejected', rejectionReason: reason }, { new: true }).populate('filmmaker', '_id name');

    await new Notification({
      user: film.filmmaker._id,
      message: `Your film "${film.title}" was rejected. Reason: ${reason || 'No reason provided'}`,
      type: 'rejection',
      link: `/dashboard`
    }).save();

    res.json({ message: 'Film rejected', film });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ========== EARNINGS ROUTES ==========
const MIN_PAYOUT_UGX = 20000;

app.get('/api/earnings/creator', auth, requireRole('filmmaker'), async (req, res) => {
  try {
    const films = await Film.find({ filmmaker: req.user._id });
    let totalUniqueViews = 0, totalEarnings = 0, paidOut = 0;
    const filmStats = films.map(f => {
      const uniqueViews = f.uniqueViewers?.length || 0;
      const earnings = f.calculateEarnings();
      totalUniqueViews += uniqueViews; totalEarnings += earnings; paidOut += f.paidOut || 0;
      return { _id: f._id, title: f.title, uniqueViews, totalViews: f.views, earnings, status: f.status, payoutStatus: f.payoutStatus };
    });
    const available = totalEarnings - paidOut;
    res.json({ totalUniqueViews, totalEarnings, paidOut, available, canRequest: available >= MIN_PAYOUT_UGX, minPayout: MIN_PAYOUT_UGX, rate: '$2 per 500 unique views', films: filmStats });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/earnings/request', auth, requireRole('filmmaker'), async (req, res) => {
  try {
    const { method, phone } = req.body;
    if (!method || !phone) return res.status(400).json({ message: 'Payout method and phone number required' });
    const films = await Film.find({ filmmaker: req.user._id });
    let totalEarnings = 0, paidOut = 0;
    films.forEach(f => { totalEarnings += f.calculateEarnings(); paidOut += f.paidOut || 0; });
    const available = totalEarnings - paidOut;
    if (available < MIN_PAYOUT_UGX) return res.status(400).json({ message: `Minimum payout is UGX ${MIN_PAYOUT_UGX.toLocaleString()}` });
    await Film.updateMany({ filmmaker: req.user._id }, { payoutRequested: true, payoutStatus: 'pending', payoutAmount: available, payoutMethod: method, payoutPhone: phone });
    res.json({ message: 'Payout request submitted', amount: available, method, phone });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/earnings/admin/pending', auth, requireRole('admin'), async (req, res) => {
  try {
    const films = await Film.find({ payoutStatus: 'pending' }).populate('filmmaker', 'name email phone');
    const grouped = {};
    films.forEach(f => {
      const key = f.filmmaker._id.toString();
      if (!grouped[key]) grouped[key] = { filmmaker: f.filmmaker, films: [], totalAmount: 0 };
      grouped[key].films.push({ _id: f._id, title: f.title, uniqueViews: f.uniqueViewers?.length || 0, earnings: f.calculateEarnings(), payoutAmount: f.payoutAmount, payoutPhone: f.payoutPhone, payoutMethod: f.payoutMethod });
      grouped[key].totalAmount += f.payoutAmount || 0;
    });
    res.json(Object.values(grouped));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/earnings/admin/pay/:filmmakerId', auth, requireRole('admin'), async (req, res) => {
  try {
    const { transactionId } = req.body;
    const films = await Film.find({ filmmaker: req.params.filmmakerId, payoutStatus: 'pending' });
    let totalPaid = 0;
    for (const film of films) {
      const earnings = film.calculateEarnings();
      totalPaid += earnings;
      film.paidOut = (film.paidOut || 0) + earnings;
      film.payoutStatus = 'paid'; film.payoutDate = new Date(); film.payoutRequested = false;
      if (transactionId) film.adminNotes = `Paid: ${transactionId}`;
      await film.save();
    }
    res.json({ message: 'Payout marked as paid', totalPaid, filmsUpdated: films.length });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/earnings/admin/reject/:filmmakerId', auth, requireRole('admin'), async (req, res) => {
  try {
    const { reason } = req.body;
    await Film.updateMany({ filmmaker: req.params.filmmakerId, payoutStatus: 'pending' }, { payoutStatus: 'rejected', payoutRequested: false, rejectionReason: reason || '' });
    res.json({ message: 'Payout rejected' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ========== WATCHLIST ROUTES ==========
app.get('/api/watchlist', auth, async (req, res) => {
  try {
    const items = await Watchlist.find({ user: req.user._id }).populate('film');
    res.json(items.map(i => i.film));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/watchlist', auth, async (req, res) => {
  try {
    const { filmId } = req.body;
    const exists = await Watchlist.findOne({ user: req.user._id, film: filmId });
    if (exists) return res.json({ message: 'Already in watchlist' });
    await new Watchlist({ user: req.user._id, film: filmId }).save();
    res.json({ message: 'Added to watchlist' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.delete('/api/watchlist/:filmId', auth, async (req, res) => {
  try {
    await Watchlist.findOneAndDelete({ user: req.user._id, film: req.params.filmId });
    res.json({ message: 'Removed from watchlist' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ========== NOTIFICATION ROUTES ==========
app.get('/api/notifications', auth, async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50);
    res.json(notifications);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.put('/api/notifications/:id/read', auth, async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { read: true });
    res.json({ message: 'Marked as read' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/notifications/unread-count', auth, async (req, res) => {
  try {
    const count = await Notification.countDocuments({ user: req.user._id, read: false });
    res.json({ count });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ========== USER ROUTES ==========
app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/users/:id/follow', auth, async (req, res) => {
  try {
    const userToFollow = await User.findById(req.params.id);
    if (!userToFollow) return res.status(404).json({ message: 'User not found' });
    const alreadyFollowing = req.user.following.includes(req.params.id);
    if (alreadyFollowing) {
      req.user.following = req.user.following.filter(id => id.toString() !== req.params.id);
      userToFollow.followers = userToFollow.followers.filter(id => id.toString() !== req.user._id.toString());
    } else {
      req.user.following.push(req.params.id);
      userToFollow.followers.push(req.user._id);
    }
    await req.user.save();
    await userToFollow.save();
    res.json({ following: !alreadyFollowing });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Health check
app.get('/', (req, res) => res.json({ status: 'DALI Backend Running', timestamp: new Date().toISOString() }));

// Error handler
app.use((err, req, res, next) => {
  console.error('SERVER ERROR:', err.stack);
  res.status(500).json({ message: err.message || 'Server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
