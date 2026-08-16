const express = require('express');
const router = express.Router();
const Film = require('../models/Film');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'No token' });
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dali_secret');
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) return res.status(401).json({ message: 'User not found' });
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token invalid' });
  }
};

// Get all approved films
router.get('/', async (req, res) => {
  try {
    const films = await Film.find({ status: 'approved' })
      .populate('filmmaker', 'name')
      .sort({ publishedAt: -1 });
    res.json(films);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get featured films
router.get('/featured', async (req, res) => {
  try {
    const films = await Film.find({ status: 'approved', featured: true })
      .populate('filmmaker', 'name')
      .limit(6);
    res.json(films);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get trending films
router.get('/trending', async (req, res) => {
  try {
    const films = await Film.find({ status: 'approved' })
      .populate('filmmaker', 'name')
      .sort({ views: -1 })
      .limit(10);
    res.json(films);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get single film + track unique view
router.get('/:id', async (req, res) => {
  try {
    const film = await Film.findById(req.params.id).populate('filmmaker', 'name email');
    if (!film) return res.status(404).json({ message: 'Film not found' });
    res.json(film);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Track view — one email = one view per film forever
router.post('/:id/view', auth, async (req, res) => {
  try {
    const film = await Film.findById(req.params.id);
    if (!film) return res.status(404).json({ message: 'Film not found' });

    const viewerEmail = req.user.email;
    const alreadyViewed = film.uniqueViewers.includes(viewerEmail);

    if (!alreadyViewed) {
      film.uniqueViewers.push(viewerEmail);
      film.views += 1;
      await film.save();
    }

    res.json({ 
      views: film.views, 
      uniqueViews: film.uniqueViewers.length,
      counted: !alreadyViewed 
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Like/unlike film
router.post('/:id/like', auth, async (req, res) => {
  try {
    const film = await Film.findById(req.params.id);
    if (!film) return res.status(404).json({ message: 'Film not found' });

    const userId = req.user._id.toString();
    const liked = film.likes.map(id => id.toString()).includes(userId);

    if (liked) {
      film.likes = film.likes.filter(id => id.toString() !== userId);
      film.likesCount = Math.max(0, film.likesCount - 1);
    } else {
      film.likes.push(req.user._id);
      film.likesCount += 1;
    }

    await film.save();
    res.json({ liked: !liked, likesCount: film.likesCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get comments
router.get('/:id/comments', async (req, res) => {
  try {
    const Comment = require('../models/Comment');
    const comments = await Comment.find({ film: req.params.id })
      .populate('user', 'name')
      .sort({ createdAt: -1 });
    res.json(comments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add comment
router.post('/:id/comments', auth, async (req, res) => {
  try {
    const Comment = require('../models/Comment');
    const comment = new Comment({
      film: req.params.id,
      user: req.user._id,
      text: req.body.text
    });
    await comment.save();
    await comment.populate('user', 'name');
    res.json(comment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
