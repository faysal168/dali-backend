const express = require('express');
const jwt = require('jsonwebtoken');
const Film = require('../models/Film');
const User = require('../models/User');

const router = express.Router();

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'No token' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'Access denied' });
    next();
  };
};

router.get('/overview', auth, requireRole('admin'), async (req, res) => {
  try {
    const [users, films, pending, processing, published, viewsAgg] = await Promise.all([
      User.countDocuments(),
      Film.countDocuments(),
      Film.countDocuments({ status: 'pending_review' }),
      Film.countDocuments({ status: 'processing' }),
      Film.countDocuments({ status: 'published' }),
      Film.aggregate([{ $group: { _id: null, total: { $sum: '$views' } } }])
    ]);
    res.json({ users, films, pending, processing, published, views: viewsAgg[0]?.total || 0 });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/submissions', auth, requireRole('admin'), async (req, res) => {
  try {
    const films = await Film.find({ status: { $in: ['pending_review', 'processing', 'rejected'] } })
      .populate('creator', 'name email')
      .sort({ createdAt: -1 });
    res.json(films);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/published', auth, requireRole('admin'), async (req, res) => {
  try {
    const films = await Film.find({ status: 'published' })
      .populate('creator', 'name email')
      .sort({ createdAt: -1 });
    res.json(films);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/film/:id/publish', auth, requireRole('admin'), async (req, res) => {
  try {
    const { videoUrl, trailerUrl, posterUrl, adminNote } = req.body;
    const film = await Film.findById(req.params.id);
    if (!film) return res.status(404).json({ message: 'Film not found' });
    if (videoUrl) film.videoUrl = videoUrl;
    if (trailerUrl) film.trailerUrl = trailerUrl;
    if (posterUrl) film.posterUrl = posterUrl;
    if (adminNote) film.adminNote = adminNote;
    film.status = 'published';
    await film.save();
    res.json({ message: 'Film published', film });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/film/:id/process', auth, requireRole('admin'), async (req, res) => {
  try {
    const film = await Film.findById(req.params.id);
    if (!film) return res.status(404).json({ message: 'Film not found' });
    film.status = 'processing';
    await film.save();
    res.json({ message: 'Film marked as processing', film });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/film/:id/reject', auth, requireRole('admin'), async (req, res) => {
  try {
    const { note } = req.body;
    const film = await Film.findById(req.params.id);
    if (!film) return res.status(404).json({ message: 'Film not found' });
    film.status = 'rejected';
    film.adminNote = note || '';
    await film.save();
    res.json({ message: 'Film rejected', film });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/users', auth, requireRole('admin'), async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/users/:id/role', auth, requireRole('admin'), async (req, res) => {
  try {
    const { role } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/reports', auth, requireRole('admin'), async (req, res) => {
  try {
    const Report = require('../models/Report');
    const reports = await Report.find().populate('film', 'title').populate('reporter', 'name').sort({ createdAt: -1 });
    res.json(reports);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
