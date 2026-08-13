const express = require('express');
const router = express.Router();
const Film = require('../models/Film');
const { authMiddleware, adminMiddleware, filmmakerMiddleware } = require('../middleware/auth');

// GET /api/films - public, only approved/published
router.get('/', async (req, res) => {
  try {
    const { search, country, genre, status } = req.query;
    const filter = {};
    if (status) filter.status = status;
    else filter.status = { $in: ['approved','published'] };
    if (country) filter.country = country;
    if (genre) filter.genre = genre;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    const films = await Film.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, films });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/films/stats/all - admin only
router.get('/stats/all', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const total = await Film.countDocuments();
    const pending = await Film.countDocuments({ status: 'pending_review' });
    res.json({ success: true, stats: { total, pending } });
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
        { description: { $regex: q, $options: 'i' } }
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
    const film = new Film({ ...req.body, filmmaker: req.user.id, status: 'pending_review' });
    await film.save();
    res.status(201).json({ success: true, film });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/films/:id - filmmaker (own) or admin
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

// DELETE /api/films/:id - admin only
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await Film.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Film deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
