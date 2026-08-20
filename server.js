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

// ========== MODELS ==========

const User = mongoose.model('User', new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['viewer', 'filmmaker', 'admin'], default: 'viewer' },
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
  earnings: { type: Number, default: 0 },
  payoutStatus: { type: String, enum: ['unpaid', 'requested', 'paid'], default: 'unpaid' },
  payoutAmount: { type: Number, default: 0 }
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

app.get('/api/admin/films', auth, adminOnly, async (req, res) => {
  try {
    const films = await Film.find().sort({ createdAt: -1 }).populate('filmmaker', 'name email');
    res.json(films);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

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

app.patch('/api/admin/films/:id/approve', auth, adminOnly, async (req, res) => {
  try {
    const film = await Film.findByIdAndUpdate(req.params.id, { status: 'approved' }, { new: true });
    await Notification.create({ user: film.filmmaker, type: 'approved', message: `Your film "${film.title}" has been approved!`, film: film._id });
    res.json(film);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.patch('/api/admin/films/:id/reject', auth, adminOnly, async (req, res) => {
  try {
    const film = await Film.findByIdAndUpdate(req.params.id, { status: 'rejected', rejectionReason: req.body.reason || '' }, { new: true });
    await Notification.create({ user: film.filmmaker, type: 'rejected', message: `Your film "${film.title}" was rejected.`, film: film._id });
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
    res.json(film);
  } catch (e) { console.error('Publish error:', e); res.status(500).json({ message: e.message, error: e.toString() }); }
});

app.delete('/api/admin/films/:id', auth, adminOnly, async (req, res) => {
  try {
    const film = await Film.findById(req.params.id);
    if (!film) return res.status(404).json({ message: 'Not found' });
    await Film.findByIdAndDelete(req.params.id);
    await Notification.create({ user: film.filmmaker, type: 'deleted', message: `Your film "${film.title}" has been removed by admin.` });
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
