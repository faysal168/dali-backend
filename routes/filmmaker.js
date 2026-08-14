const express = require('express');
const router = express.Router();
const FilmmakerProfile = require('../models/FilmmakerProfile');
const Film = require('../models/Film');
const User = require('../models/User');
const { authMiddleware, filmmakerMiddleware } = require('../middleware/auth');

// GET /api/filmmaker/profile/:userId - public
router.get('/profile/:userId', async (req, res) => {
  try {
    const profile = await FilmmakerProfile.findOne({ user: req.params.userId })
      .populate('user', 'name profileImage role');
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
    const films = await Film.find({ filmmaker: req.params.userId, status: { $in: ['approved','published'] } });
    res.json({ success: true, profile, films });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/filmmaker/profile - update own profile
router.put('/profile', authMiddleware, filmmakerMiddleware, async (req, res) => {
  try {
    const { bio, country, socialLinks } = req.body;
    const profile = await FilmmakerProfile.findOneAndUpdate(
      { user: req.user.id },
      { bio, country, socialLinks, updatedAt: Date.now() },
      { new: true, upsert: true }
    );
    res.json({ success: true, profile });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/filmmaker/my-films
router.get('/my-films', authMiddleware, filmmakerMiddleware, async (req, res) => {
  try {
    const films = await Film.find({ filmmaker: req.user.id }).sort({ createdAt: -1 });
    res.json({ success: true, films });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/filmmaker/dashboard
router.get('/dashboard', authMiddleware, filmmakerMiddleware, async (req, res) => {
  try {
    const films = await Film.find({ filmmaker: req.user.id });
    const totalViews = films.reduce((sum, f) => sum + (f.views || 0), 0);
    const totalFilms = films.length;
    const pending = films.filter(f => f.status === 'pending_review').length;
    const published = films.filter(f => f.status === 'published' || f.status === 'approved').length;
    res.json({ success: true, stats: { totalFilms, totalViews, pending, published } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
