const express = require('express');
const router = express.Router();
const Watchlist = require('../models/Watchlist');
const { authMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, async (req, res) => {
  try {
    const items = await Watchlist.find({ user: req.user.id }).populate('film');
    res.json({ success: true, watchlist: items.map(i => i.film) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:filmId', authMiddleware, async (req, res) => {
  try {
    await Watchlist.findOneAndUpdate(
      { user: req.user.id, film: req.params.filmId },
      { user: req.user.id, film: req.params.filmId },
      { upsert: true }
    );
    res.json({ success: true, message: 'Added to watchlist' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:filmId', authMiddleware, async (req, res) => {
  try {
    await Watchlist.deleteOne({ user: req.user.id, film: req.params.filmId });
    res.json({ success: true, message: 'Removed from watchlist' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:filmId/status', authMiddleware, async (req, res) => {
  try {
    const item = await Watchlist.findOne({ user: req.user.id, film: req.params.filmId });
    res.json({ success: true, inWatchlist: !!item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
