const express = require('express');
const router = express.Router();
const Film = require('../models/Film');
const User = require('../models/User');
const Report = require('../models/Report');
const FilmmakerProfile = require('../models/FilmmakerProfile');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// GET /api/admin/overview
router.get('/overview', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalFilms = await Film.countDocuments();
    const pending = await Film.countDocuments({ status: 'pending_review' });
    const totalViews = await Film.aggregate([{ $group: { _id: null, total: { $sum: '$views' } } }]);
    res.json({
      success: true,
      overview: {
        totalUsers,
        totalFilms,
        pendingSubmissions: pending,
        totalViews: totalViews[0]?.total || 0
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/pending-films
router.get('/pending-films', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const films = await Film.find({ status: 'pending_review' }).populate('filmmaker', 'name email');
    res.json({ success: true, films });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/admin/films/:id/status
router.put('/films/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status, statusMessage } = req.body;
    const film = await Film.findByIdAndUpdate(req.params.id, { status, statusMessage }, { new: true });
    if (!film) return res.status(404).json({ success: false, error: 'Film not found' });
    res.json({ success: true, film });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/users
router.get('/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/admin/users/:id/role
router.put('/users/:id/role', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { role } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select('-password');
    if (role === 'filmmaker') {
      await FilmmakerProfile.findOneAndUpdate({ user: req.params.id }, {}, { upsert: true, new: true });
    }
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/reports
router.get('/reports', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const reports = await Report.find().populate('reporter', 'name').populate('film', 'title').sort({ createdAt: -1 });
    res.json({ success: true, reports });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
