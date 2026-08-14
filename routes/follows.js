const express = require('express');
const router = express.Router();
const Follow = require('../models/Follow');
const FilmmakerProfile = require('../models/FilmmakerProfile');
const { authMiddleware } = require('../middleware/auth');

router.post('/:userId', authMiddleware, async (req, res) => {
  try {
    const existing = await Follow.findOne({ follower: req.user.id, following: req.params.userId });
    if (existing) {
      await Follow.deleteOne({ _id: existing._id });
      await FilmmakerProfile.findOneAndUpdate({ user: req.params.userId }, { $pull: { followers: req.user.id } });
      return res.json({ success: true, following: false });
    }
    await Follow.create({ follower: req.user.id, following: req.params.userId });
    await FilmmakerProfile.findOneAndUpdate({ user: req.params.userId }, { $addToSet: { followers: req.user.id } });
    res.json({ success: true, following: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:userId/status', authMiddleware, async (req, res) => {
  try {
    const follow = await Follow.findOne({ follower: req.user.id, following: req.params.userId });
    res.json({ success: true, following: !!follow });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
