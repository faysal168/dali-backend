const express = require('express');
const router = express.Router();
const Like = require('../models/Like');
const Film = require('../models/Film');
const { authMiddleware } = require('../middleware/auth');

router.post('/:filmId', authMiddleware, async (req, res) => {
  try {
    const existing = await Like.findOne({ user: req.user.id, film: req.params.filmId });
    if (existing) {
      await Like.deleteOne({ _id: existing._id });
      await Film.findByIdAndUpdate(req.params.filmId, { $inc: { likes: -1 } });
      return res.json({ success: true, liked: false });
    }
    await Like.create({ user: req.user.id, film: req.params.filmId });
    await Film.findByIdAndUpdate(req.params.filmId, { $inc: { likes: 1 } });
    res.json({ success: true, liked: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:filmId/status', authMiddleware, async (req, res) => {
  try {
    const like = await Like.findOne({ user: req.user.id, film: req.params.filmId });
    res.json({ success: true, liked: !!like });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
