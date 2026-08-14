const express = require('express');
const router = express.Router();
const Comment = require('../models/Comment');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.get('/:filmId', async (req, res) => {
  try {
    const comments = await Comment.find({ film: req.params.filmId })
      .populate('user', 'name profileImage')
      .sort({ createdAt: -1 });
    res.json({ success: true, comments });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:filmId', authMiddleware, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ success: false, error: 'Comment text required' });
    const comment = await Comment.create({ user: req.user.id, film: req.params.filmId, text });
    await comment.populate('user', 'name profileImage');
    res.status(201).json({ success: true, comment });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:commentId', authMiddleware, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });
    if (req.user.role !== 'admin' && comment.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    await Comment.deleteOne({ _id: req.params.commentId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
