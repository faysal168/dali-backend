const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const stream = require('stream');

const app = express();
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '50mb' }));

// Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
const upload = multer({ storage: multer.memoryStorage() });

// MongoDB
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/dali';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// ========== INLINE MODELS FOR ADMIN FEATURES ==========

const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', new mongoose.Schema({
  action: { type: String, required: true },
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  adminName: { type: String, default: '' },
  target: { type: String, default: '' },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  ip: { type: String, default: '' }
}, { timestamps: true }));

const Category = mongoose.models.Category || mongoose.model('Category', new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  slug: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 }
}, { timestamps: true }));

const BlockedIP = mongoose.models.BlockedIP || mongoose.model('BlockedIP', new mongoose.Schema({
  ip: { type: String, required: true, unique: true },
  reason: { type: String, default: '' },
  blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true }));

const FilmmakerProfile = mongoose.models.FilmmakerProfile || mongoose.model('FilmmakerProfile', new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  revenueShare: { type: Number, default: 70 },
  totalEarnings: { type: Number, default: 0 },
  pendingPayout: { type: Number, default: 0 },
  paidOut: { type: Number, default: 0 },
  paypalEmail: { type: String, default: '' },
  bankDetails: { type: String, default: '' }
}, { timestamps: true }));

// ========== EXISTING MODELS ==========

const User = mongoose.model('User', new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['viewer', 'filmmaker', 'admin'], default: 'viewer' },
  status: { type: String, enum: ['active', 'suspended', 'banned'], default: 'active' },
  phone: { type: String, default: '' },
  bio: { type: String, default: '' },
  profilePic: { type: String, default: '' }
}, { timestamps: true }));

const filmSchema = new mongoose.Schema({
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
  likes: { type: Number, default: 0 },
  watchTime: { type: Number, default: 0 },
  earnings: { type: Number, default: 0 },
  payoutStatus: { type: String, enum: ['unpaid', 'requested', 'paid'], default: 'unpaid' },
  payoutAmount: { type: Number, default: 0 },
  featured: { type: Boolean, default: false },
  hidden: { type: Boolean, default: false },
  shadowbanned: { type: Boolean, default: false }
}, { timestamps: true });

const Film = mongoose.model('Film', filmSchema);

const Notification = mongoose.model('Notification', new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, required: true },
  message: { type: String, required: true },
  film: { type: mongoose.Schema.Types.ObjectId, ref: 'Film' },
  read: { type: Boolean, default: false }
}, { timestamps: true }));

const Watchlist = mongoose.model('Watchlist', new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  film: { type: mongoose.Schema.Types.ObjectId, ref: 'Film', required: true }
}, { timestamps: true }));

const Comment = mongoose.model('Comment', new mongoose.Schema({
  film: { type: mongoose.Schema.Types.ObjectId, ref: 'Film', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, default: '' },
  text: { type: String, required: true }
}, { timestamps: true }));

const Report = mongoose.model('Report', new mongoose.Schema({
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reporterName: { type: String, default: '' },
  targetType: { type: String, enum: ['film', 'comment', 'user'], required: true },
  targetId: { type: String, required: true },
  reason: { type: String, required: true },
  details: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'dismissed', 'resolved'], default: 'pending' },
  actionTaken: { type: String, default: '' }
}, { timestamps: true }));

// ========== AUTH MIDDLEWARE ==========

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'dali_secret');
    next();
  } catch { res.status(401).json({ message: 'Invalid token' }); }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  next();
};

// ========== HELPERS ==========

const uploadToCloudinary = (buffer, folder, resourceType = 'auto') => {
  return new Promise((resolve, reject) => {
    const pt = new stream.PassThrough();
    const streamUpload = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (err, result) => { err ? reject(err) : resolve(result.secure_url); }
    );
    pt.pipe(streamUpload);
    pt.end(buffer);
  });
};

const logAudit = async (action, adminId, adminName, target, details = {}, ip = '') => {
  try {
    await AuditLog.create({ action, admin: adminId, adminName, target, details, ip });
  } catch (e) { console.error('Audit log error:', e.message); }
};

// ========== AUTH ROUTES ==========

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (await User.findOne({ email })) return res.status(400).json({ message: 'Email exists' });
    const user = await User.create({ name, email, password: await bcrypt.hash(password, 10), role: role || 'viewer' });
    res.json({ token: jwt.sign({ id: user._id, role: user.role, name: user.name }, process.env.JWT_SECRET || 'dali_secret'), user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ message: 'Invalid credentials' });
    res.json({ token: jwt.sign({ id: user._id, role: user.role, name: user.name }, process.env.JWT_SECRET || 'dali_secret'), user: { id: user._id, name: user.name, email: user.email, role: user.role, profilePic: user.profilePic } });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/auth/me', auth, async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  res.json(user);
});

// ========== FILM ROUTES ==========

app.get('/api/films', async (req, res) => {
  try {
    const { status, genre, search } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (genre) filter.genre = new RegExp(genre, 'i');
    if (search) filter.$or = [{ title: new RegExp(search, 'i') }, { director: new RegExp(search, 'i') }];
    const films = await Film.find(filter).sort({ createdAt: -1 }).populate('filmmaker', 'name');
    res.json(films);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/films/stats', async (req, res) => {
  try {
    const [totalFilms, totalFilmmakers, totalViews, recentFilms] = await Promise.all([
      Film.countDocuments({ status: 'approved' }),
      Film.distinct('filmmaker', { status: 'approved' }).then(arr => arr.length),
      Film.aggregate([{ $match: { status: 'approved' } }, { $group: { _id: null, total: { $sum: '$views' } } }]).then(r => r[0]?.total || 0),
      Film.countDocuments({ status: 'approved', createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } })
    ]);
    res.json({ totalFilms, totalFilmmakers, totalViews, recentFilms });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/films/featured', async (req, res) => {
  try {
    const film = await Film.findOne({ status: 'approved', trailerUrl: { $ne: '' } }).sort({ views: -1 }).populate('filmmaker', 'name');
    if (!film) {
      const fallback = await Film.findOne({ status: 'approved' }).sort({ views: -1 }).populate('filmmaker', 'name');
      return res.json(fallback || null);
    }
    res.json(film);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/films/trending', async (req, res) => {
  try {
    const films = await Film.find({ status: 'approved' }).sort({ views: -1 }).limit(12).populate('filmmaker', 'name');
    res.json(films);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/films/recent', async (req, res) => {
  try {
    const films = await Film.find({ status: 'approved' }).sort({ createdAt: -1 }).limit(12).populate('filmmaker', 'name');
    res.json(films);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/films/genre/:genre', async (req, res) => {
  try {
    const films = await Film.find({ status: 'approved', genre: new RegExp(req.params.genre, 'i') }).sort({ views: -1 }).limit(12).populate('filmmaker', 'name');
    res.json(films);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/films/:id', async (req, res) => {
  try {
    const film = await Film.findById(req.params.id).populate('filmmaker', 'name email phone');
    if (!film) return res.status(404).json({ message: 'Not found' });
    res.json(film);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/films/:id/view', async (req, res) => {
  try {
    await Film.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/films/:id/like', auth, async (req, res) => {
  try {
    await Film.findByIdAndUpdate(req.params.id, { $inc: { likes: 1 } });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/films/:id/comments', async (req, res) => {
  try {
    const comments = await Comment.find({ film: req.params.id }).sort({ createdAt: -1 }).populate('user', 'name');
    res.json(comments);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/films/:id/comments', auth, async (req, res) => {
  try {
    const comment = await Comment.create({ film: req.params.id, user: req.user.id, userName: req.user.name, text: req.body.text });
    res.json(comment);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ========== FILMMAKER ROUTES ==========

app.post('/api/films', auth, upload.single('poster'), async (req, res) => {
  try {
    console.log('=== SUBMIT HIT ===', req.body.title);
    let posterUrl = '';
    if (req.file) {
      posterUrl = await uploadToCloudinary(req.file.buffer, 'dali/posters', 'image');
      console.log('Poster uploaded:', posterUrl);
    }
    const film = await Film.create({
      ...req.body,
      poster: posterUrl || req.body.poster || '',
      filmmaker: req.user.id,
      filmmakerName: req.user.name,
      status: 'pending_review'
    });
    const admins = await User.find({ role: 'admin' });
    await Promise.all(admins.map(a => Notification.create({ user: a._id, type: 'submission', message: `New film submitted: "${film.title}"`, film: film._id })));
    res.json(film);
  } catch (e) { console.error('Submit error:', e); res.status(500).json({ message: e.message }); }
});

app.get('/api/my-films', auth, async (req, res) => {
  try {
    const films = await Film.find({ filmmaker: req.user.id }).sort({ createdAt: -1 });
    res.json(films);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ========== WATCHLIST ==========

app.get('/api/watchlist', auth, async (req, res) => {
  try {
    const list = await Watchlist.find({ user: req.user.id }).populate('film');
    res.json(list.map(w => w.film));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/watchlist/check/:filmId', auth, async (req, res) => {
  try {
    const exists = await Watchlist.findOne({ user: req.user.id, film: req.params.filmId });
    res.json({ inWatchlist: !!exists });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/watchlist/:filmId', auth, async (req, res) => {
  try {
    await Watchlist.findOneAndUpdate({ user: req.user.id, film: req.params.filmId }, {}, { upsert: true });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/watchlist/:filmId', auth, async (req, res) => {
  try {
    await Watchlist.deleteOne({ user: req.user.id, film: req.params.filmId });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ========== NOTIFICATIONS ==========

app.get('/api/notifications', auth, async (req, res) => {
  try {
    const notifs = await Notification.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(50).populate('film', 'title poster');
    res.json(notifs);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.patch('/api/notifications/:id/read', auth, async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { read: true });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.patch('/api/notifications/read-all', auth, async (req, res) => {
  try {
    await Notification.updateMany({ user: req.user.id }, { read: true });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ========== ADMIN ROUTES ==========

// --- Overview ---
app.get('/api/admin/stats', auth, adminOnly, async (req, res) => {
  try {
    const [totalUsers, totalFilms, pending, approved, rejected, totalViews, totalEarnings] = await Promise.all([
      User.countDocuments(),
      Film.countDocuments(),
      Film.countDocuments({ status: 'pending_review' }),
      Film.countDocuments({ status: 'approved' }),
      Film.countDocuments({ status: 'rejected' }),
      Film.aggregate([{ $group: { _id: null, total: { $sum: '$views' } } }]).then(r => r[0]?.total || 0),
      Film.aggregate([{ $group: { _id: null, total: { $sum: '$earnings' } } }]).then(r => r[0]?.total || 0)
    ]);
    res.json({ totalUsers, totalFilms, pending, approved, rejected, totalViews, totalEarnings });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/admin/activities', auth, adminOnly, async (req, res) => {
  try {
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(20).populate('admin', 'name');
    res.json(logs);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- Users ---
app.get('/api/admin/users', auth, adminOnly, async (req, res) => {
  try {
    const { search, role, status } = req.query;
    const filter = {};
    if (search) {
      filter.$or = [
        { name: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') }
      ];
    }
    if (role && role !== 'all') filter.role = role;
    if (status && status !== 'all') filter.status = status;
    const users = await User.find(filter).select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.patch('/api/admin/users/:id', auth, adminOnly, async (req, res) => {
  try {
    const { role, status, name, email, phone, bio } = req.body;
    const update = {};
    if (role) update.role = role;
    if (status) update.status = status;
    if (name !== undefined) update.name = name;
    if (email !== undefined) update.email = email;
    if (phone !== undefined) update.phone = phone;
    if (bio !== undefined) update.bio = bio;
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password');
    await logAudit('UPDATE_USER', req.user.id, req.user.name, `User ${user.email}`, update);
    res.json(user);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/admin/users/:id', auth, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') return res.status(403).json({ message: 'Cannot delete admin accounts' });
    await User.findByIdAndDelete(req.params.id);
    await Watchlist.deleteMany({ user: req.params.id });
    await Notification.deleteMany({ user: req.params.id });
    await Comment.deleteMany({ user: req.params.id });
    await logAudit('DELETE_USER', req.user.id, req.user.name, `User ${user.email}`, {});
    res.json({ success: true, message: 'User terminated' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/admin/users/:id/reset-password', auth, adminOnly, async (req, res) => {
  try {
    const tempPassword = Math.random().toString(36).slice(-8);
    await User.findByIdAndUpdate(req.params.id, { password: await bcrypt.hash(tempPassword, 10) });
    res.json({ success: true, tempPassword });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/admin/users/export', auth, adminOnly, async (req, res) => {
  try {
    const users = await User.find().select('name email role status createdAt phone');
    const csv = ['Name,Email,Role,Status,Joined,Phone'].concat(
      users.map(u => `"${u.name}","${u.email}","${u.role}","${u.status}","${u.createdAt}","${u.phone || ''}"`)
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=users.csv');
    res.send(csv);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- Content / Films ---
app.get('/api/admin/films', auth, adminOnly, async (req, res) => {
  try {
    const films = await Film.find().sort({ createdAt: -1 }).populate('filmmaker', 'name email');
    res.json(films);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/admin/submissions', auth, adminOnly, async (req, res) => {
  try {
    const films = await Film.find({ status: 'pending_review' }).sort({ createdAt: -1 }).populate('filmmaker', 'name email');
    res.json(films);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.patch('/api/admin/films/:id/approve', auth, adminOnly, async (req, res) => {
  try {
    const film = await Film.findByIdAndUpdate(req.params.id, { status: 'approved' }, { new: true });
    await Notification.create({ user: film.filmmaker, type: 'approved', message: `Your film "${film.title}" has been approved!`, film: film._id });
    await logAudit('APPROVE_FILM', req.user.id, req.user.name, film.title, {});
    res.json(film);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.patch('/api/admin/films/:id/reject', auth, adminOnly, async (req, res) => {
  try {
    const film = await Film.findByIdAndUpdate(req.params.id, { status: 'rejected', rejectionReason: req.body.reason || '' }, { new: true });
    await Notification.create({ user: film.filmmaker, type: 'rejected', message: `Your film "${film.title}" was rejected.`, film: film._id });
    await logAudit('REJECT_FILM', req.user.id, req.user.name, film.title, { reason: req.body.reason });
    res.json(film);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/admin/films/:id/publish', auth, adminOnly, upload.fields([{ name: 'poster' }, { name: 'trailer' }, { name: 'video' }]), async (req, res) => {
  try {
    console.log('=== PUBLISH HIT === for film:', req.params.id);
    const film = await Film.findById(req.params.id);
    if (!film) return res.status(404).json({ message: 'Film not found' });

    let posterUrl = req.body.posterUrl || film.poster;
    let trailerUrl = req.body.trailerUrl || film.trailerUrl;
    let videoUrl = req.body.videoUrl || film.videoUrl;

    const files = req.files || {};
    console.log('Files received:', Object.keys(files));

    if (files.poster?.[0]) {
      console.log('Uploading poster...');
      posterUrl = await uploadToCloudinary(files.poster[0].buffer, 'dali/posters', 'image');
      console.log('Poster uploaded:', posterUrl);
    }
    if (files.trailer?.[0]) {
      console.log('Uploading trailer...');
      trailerUrl = await uploadToCloudinary(files.trailer[0].buffer, 'dali/trailers', 'video');
      console.log('Trailer uploaded:', trailerUrl);
    }
    if (files.video?.[0]) {
      console.log('Uploading video...');
      videoUrl = await uploadToCloudinary(files.video[0].buffer, 'dali/films', 'video');
      console.log('Video uploaded:', videoUrl);
    }

    film.poster = posterUrl;
    film.trailerUrl = trailerUrl;
    film.videoUrl = videoUrl;
    film.status = 'approved';
    await film.save();

    await Notification.create({ user: film.filmmaker, type: 'published', message: `Your film "${film.title}" is now live!`, film: film._id });
    await logAudit('PUBLISH_FILM', req.user.id, req.user.name, film.title, {});
    res.json(film);
  } catch (e) { console.error('Publish error:', e); res.status(500).json({ message: e.message, error: e.toString() }); }
});

app.patch('/api/admin/films/:id', auth, adminOnly, async (req, res) => {
  try {
    const film = await Film.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(film);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.patch('/api/admin/films/:id/feature', auth, adminOnly, async (req, res) => {
  try {
    const film = await Film.findByIdAndUpdate(req.params.id, { featured: req.body.featured }, { new: true });
    res.json(film);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.patch('/api/admin/films/:id/hide', auth, adminOnly, async (req, res) => {
  try {
    const film = await Film.findByIdAndUpdate(req.params.id, { hidden: req.body.hidden }, { new: true });
    res.json(film);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/admin/films/:id', auth, adminOnly, async (req, res) => {
  try {
    const film = await Film.findById(req.params.id);
    if (!film) return res.status(404).json({ message: 'Not found' });
    await Film.findByIdAndDelete(req.params.id);
    await Notification.create({ user: film.filmmaker, type: 'deleted', message: `Your film "${film.title}" has been removed by admin.` });
    await logAudit('DELETE_FILM', req.user.id, req.user.name, film.title, {});
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/admin/films/:id/analytics', auth, adminOnly, async (req, res) => {
  try {
    const film = await Film.findById(req.params.id).populate('filmmaker', 'name email phone');
    if (!film) return res.status(404).json({ message: 'Not found' });
    const commentsCount = await Comment.countDocuments({ film: req.params.id });
    res.json({ film, commentsCount });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- Categories ---
app.get('/api/admin/categories', auth, adminOnly, async (req, res) => {
  try {
    const cats = await Category.find().sort({ name: 1 });
    res.json(cats);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/admin/categories', auth, adminOnly, async (req, res) => {
  try {
    const cat = await Category.create({ name: req.body.name, slug: req.body.name.toLowerCase().replace(/\s+/g, '-') });
    res.json(cat);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/admin/categories/:id', auth, adminOnly, async (req, res) => {
  try {
    await Category.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- Moderation ---
app.get('/api/admin/reports', auth, adminOnly, async (req, res) => {
  try {
    const reports = await Report.find().sort({ createdAt: -1 }).populate('reporter', 'name email');
    res.json(reports);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.patch('/api/admin/reports/:id/resolve', auth, adminOnly, async (req, res) => {
  try {
    const report = await Report.findByIdAndUpdate(req.params.id, { status: 'resolved', actionTaken: req.body.action || 'resolved' }, { new: true });
    await logAudit('RESOLVE_REPORT', req.user.id, req.user.name, `Report ${req.params.id}`, { action: req.body.action });
    res.json(report);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.patch('/api/admin/reports/:id/dismiss', auth, adminOnly, async (req, res) => {
  try {
    const report = await Report.findByIdAndUpdate(req.params.id, { status: 'dismissed' }, { new: true });
    res.json(report);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/admin/audit-logs', auth, adminOnly, async (req, res) => {
  try {
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(100).populate('admin', 'name email');
    res.json(logs);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/admin/blocked-ips', auth, adminOnly, async (req, res) => {
  try {
    const ips = await BlockedIP.find().sort({ createdAt: -1 }).populate('blockedBy', 'name');
    res.json(ips);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/admin/block-ip', auth, adminOnly, async (req, res) => {
  try {
    const ip = await BlockedIP.create({ ip: req.body.ip, reason: req.body.reason, blockedBy: req.user.id });
    await logAudit('BLOCK_IP', req.user.id, req.user.name, req.body.ip, { reason: req.body.reason });
    res.json(ip);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/admin/unblock-ip/:ip', auth, adminOnly, async (req, res) => {
  try {
    await BlockedIP.deleteOne({ ip: req.params.ip });
    await logAudit('UNBLOCK_IP', req.user.id, req.user.name, req.params.ip, {});
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- Communications ---
app.post('/api/admin/notifications/send', auth, adminOnly, async (req, res) => {
  try {
    const { segment, message, title } = req.body;
    let users = [];
    if (segment === 'all') users = await User.find();
    else if (segment === 'filmmakers') users = await User.find({ role: 'filmmaker' });
    else if (segment === 'viewers') users = await User.find({ role: 'viewer' });
    else if (segment === 'admins') users = await User.find({ role: 'admin' });
    await Promise.all(users.map(u => Notification.create({ user: u._id, type: 'admin_broadcast', message: title ? `${title}: ${message}` : message })));
    await logAudit('SEND_NOTIFICATION', req.user.id, req.user.name, segment, { count: users.length });
    res.json({ success: true, sent: users.length });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/admin/email-campaign', auth, adminOnly, async (req, res) => {
  try {
    await logAudit('EMAIL_CAMPAIGN', req.user.id, req.user.name, req.body.subject, { recipients: req.body.segment });
    res.json({ success: true, message: 'Email campaign queued' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/admin/announcement', auth, adminOnly, async (req, res) => {
  try {
    await logAudit('SET_ANNOUNCEMENT', req.user.id, req.user.name, req.body.message, {});
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- Filmmakers ---
app.get('/api/admin/filmmakers', auth, adminOnly, async (req, res) => {
  try {
    const filmmakers = await User.find({ role: 'filmmaker' }).select('-password').sort({ createdAt: -1 });
    const profiles = await FilmmakerProfile.find();
    const films = await Film.find({ status: 'approved' });
    const result = filmmakers.map(f => {
      const profile = profiles.find(p => p.user.toString() === f._id.toString()) || {};
      const userFilms = films.filter(film => film.filmmaker.toString() === f._id.toString());
      return {
        ...f.toObject(),
        revenueShare: profile.revenueShare || 70,
        totalEarnings: profile.totalEarnings || 0,
        pendingPayout: profile.pendingPayout || 0,
        paidOut: profile.paidOut || 0,
        filmCount: userFilms.length,
        totalViews: userFilms.reduce((sum, film) => sum + (film.views || 0), 0)
      };
    });
    res.json(result);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.patch('/api/admin/filmmakers/:id/revenue', auth, adminOnly, async (req, res) => {
  try {
    await FilmmakerProfile.findOneAndUpdate(
      { user: req.params.id },
      { revenueShare: req.body.revenueShare },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- Analytics ---
app.get('/api/admin/analytics', auth, adminOnly, async (req, res) => {
  try {
    const [totalUsers, activeToday, totalViews, avgWatchTime, completionRate, topFilms, deviceBreakdown, searchQueries] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
      Film.aggregate([{ $group: { _id: null, total: { $sum: '$views' } } }]).then(r => r[0]?.total || 0),
      Film.aggregate([{ $group: { _id: null, avg: { $avg: '$watchTime' } } }]).then(r => Math.round(r[0]?.avg || 0)),
      68, // mock completion rate
      Film.find({ status: 'approved' }).sort({ views: -1 }).limit(10).select('title views likes'),
      { mobile: 55, desktop: 35, tablet: 10 }, // mock
      ['drama', 'action', 'comedy', 'horror', 'documentary'] // mock
    ]);
    res.json({ totalUsers, activeToday, totalViews, avgWatchTime, completionRate, topFilms, deviceBreakdown, searchQueries });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- God Mode ---
app.post('/api/admin/god-mode/manipulate', auth, adminOnly, async (req, res) => {
  try {
    const { filmId, metric, amount } = req.body;
    const inc = {};
    inc[metric] = amount;
    await Film.findByIdAndUpdate(filmId, { $inc: inc });
    await logAudit('GOD_MODE_MANIPULATE', req.user.id, req.user.name, filmId, { metric, amount });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/admin/god-mode/boost', auth, adminOnly, async (req, res) => {
  try {
    await Film.findByIdAndUpdate(req.body.filmId, { featured: true });
    await logAudit('GOD_MODE_BOOST', req.user.id, req.user.name, req.body.filmId, {});
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/admin/god-mode/shadowban', auth, adminOnly, async (req, res) => {
  try {
    await Film.findByIdAndUpdate(req.body.filmId, { shadowbanned: req.body.shadowbanned });
    await logAudit('GOD_MODE_SHADOWBAN', req.user.id, req.user.name, req.body.filmId, { shadowbanned: req.body.shadowbanned });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/admin/god-mode/ab-test', auth, adminOnly, async (req, res) => {
  try {
    await logAudit('GOD_MODE_AB_TEST', req.user.id, req.user.name, 'A/B Test', req.body);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ========== GLOBAL ERROR HANDLER ==========

app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({ message: err.message || 'Server error' });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
server.timeout = 300000;
server.keepAliveTimeout = 300000;
server.headersTimeout = 300000;
