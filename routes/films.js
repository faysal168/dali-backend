const express = require('express');
const router = express.Router();
const Film = require('../models/Film');
const WatchProgress = require('../models/WatchProgress');
const VideoSession = require('../models/VideoSession');
const { authMiddleware, adminMiddleware, filmmakerMiddleware } = require('../middleware/auth');

// GET /api/films - public
router.get('/', async (req, res) => {
  try {
    const { search, country, genre, status, filmmaker, sort } = req.query;
    const filter = {};
    if (status) filter.status = status;
    else filter.status = { $in: ['approved','published'] };
    if (country) filter.country = country;
    if (genre) filter.genre = genre;
    if (filmmaker) filter.filmmaker = filmmaker;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { director: { $regex: search, $options: 'i' } }
      ];
    }

    let query = Film.find(filter);
    if (sort === 'newest') query = query.sort({ createdAt: -1 });
    else if (sort === 'popular') query = query.sort({ views: -1 });
    else if (sort === 'rating') query = query.sort({ avgRating: -1 });
    else query = query.sort({ createdAt: -1 });

    const films = await query.limit(50);
    res.json({ success: true, films });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/films/featured
router.get('/featured/all', async (req, res) => {
  try {
    const films = await Film.find({ status: { $in: ['approved','published'] }, featured: true }).limit(5);
    res.json({ success: true, films });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/films/stats/all - admin
router.get('/stats/all', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const total = await Film.countDocuments();
    const pending = await Film.countDocuments({ status: 'pending_review' });
    const published = await Film.countDocuments({ status: 'published' });
    res.json({ success: true, stats: { total, pending, published } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/films/search/all
router.get('/search/all', async (req, res) => {
  try {
    const { q } = req.query;
    const films = await Film.find({
      status: { $in: ['approved','published'] },
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { director: { $regex: q, $options: 'i' } }
      ]
    }).limit(20);
    res.json({ success: true, films });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/films/:id
router.get('/:id', async (req, res) => {
  try {
    const film = await Film.findById(req.params.id);
    if (!film) return res.status(404).json({ success: false, error: 'Film not found' });
    res.json({ success: true, film });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/films - filmmaker/admin
router.post('/', authMiddleware, filmmakerMiddleware, async (req, res) => {
  try {
    const film = new Film({ ...req.body, filmmaker: req.user.id, filmmakerName: req.user.name, status: 'pending_review' });
    await film.save();
    res.status(201).json({ success: true, film });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/films/:id
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const film = await Film.findById(req.params.id);
    if (!film) return res.status(404).json({ success: false, error: 'Film not found' });
    if (req.user.role !== 'admin' && film.filmmaker?.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    Object.assign(film, req.body);
    await film.save();
    res.json({ success: true, film });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/films/:id - admin
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await Film.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Film deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/films/:id/view
router.post('/:id/view', async (req, res) => {
  try {
    await Film.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/films/:id/session - track watch session
router.post('/:id/session', authMiddleware, async (req, res) => {
  try {
    const { position, duration, completed } = req.body;
    await VideoSession.create({
      user: req.user.id,
      film: req.params.id,
      lastPosition: position,
      watchDuration: duration,
      completed: completed || false
    });
    // Update watch progress
    const percent = duration > 0 ? Math.round((position / duration) * 100) : 0;
    await WatchProgress.findOneAndUpdate(
      { user: req.user.id, film: req.params.id },
      { position, duration, percentWatched: percent, completed: completed || false, lastWatched: Date.now() },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/films/:id/progress
router.get('/:id/progress', authMiddleware, async (req, res) => {
  try {
    const progress = await WatchProgress.findOne({ user: req.user.id, film: req.params.id });
    res.json({ success: true, progress });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
