const express = require('express');
const router = express.Router();
const Film = require('../models/Film');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// GET /api/films - get all films
router.get('/', async (req, res) => {
  try {
    const films = await Film.find().sort({ createdAt: -1 });
    res.json({ success: true, films });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/films/stats/all - get stats
router.get('/stats/all', async (req, res) => {
  try {
    const total = await Film.countDocuments();
    const trending = await Film.countDocuments({ category: 'trending' });
    const newReleases = await Film.countDocuments({ new: true });
    const topRated = await Film.countDocuments({ rating: { $gte: 8 } });

    res.json({
      success: true,
      stats: { total, trending, newReleases, topRated }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/films/search/all - search films
router.get('/search/all', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      const films = await Film.find().sort({ createdAt: -1 });
      return res.json({ success: true, films });
    }

    const films = await Film.find({
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { genre: { $regex: q, $options: 'i' } },
        { desc: { $regex: q, $options: 'i' } }
      ]
    }).sort({ createdAt: -1 });

    res.json({ success: true, films });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/films/:id - get single film
router.get('/:id', async (req, res) => {
  try {
    const film = await Film.findById(req.params.id);
    if (!film) {
      return res.status(404).json({ success: false, error: 'Film not found' });
    }
    res.json({ success: true, film });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/films - create film (admin only)
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const film = await Film.create(req.body);
    res.status(201).json({ success: true, film });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/films/:id - update film (admin only)
router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const film = await Film.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!film) {
      return res.status(404).json({ success: false, error: 'Film not found' });
    }
    res.json({ success: true, film });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/films/:id - delete film (admin only)
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const film = await Film.findByIdAndDelete(req.params.id);
    if (!film) {
      return res.status(404).json({ success: false, error: 'Film not found' });
    }
    res.json({ success: true, message: 'Film deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
