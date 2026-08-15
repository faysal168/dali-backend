const express = require('express');
const Film = require('../models/Film');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get filmmaker dashboard stats
router.get('/dashboard', auth, requireRole('filmmaker', 'admin'), async (req, res) => {
  try {
    const films = await Film.find({ creator: req.user.userId });
    const stats = {
      totalFilms: films.length,
      published: films.filter(f => f.status === 'published').length,
      pending: films.filter(f => f.status === 'pending_review').length,
      processing: films.filter(f => f.status === 'processing').length,
      totalViews: films.reduce((sum, f) => sum + (f.views || 0), 0),
      totalLikes: films.reduce((sum, f) => sum + (f.likes || 0), 0),
    };
    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get my films
router.get('/my-films', auth, requireRole('filmmaker', 'admin'), async (req, res) => {
  try {
    const films = await Film.find({ creator: req.user.userId })
      .sort({ createdAt: -1 });
    res.json(films);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Submit film (links only - filmmaker provides URLs)
router.post('/submit', auth, requireRole('filmmaker', 'admin'), async (req, res) => {
  try {
    const { title, description, filmmakerVideoUrl, filmmakerTrailerUrl, filmmakerPosterUrl, genre, country, language, duration, year } = req.body;

    if (!title || !filmmakerVideoUrl) {
      return res.status(400).json({ message: 'Title and film URL are required' });
    }

    const film = new Film({
      title,
      description: description || '',
      filmmakerVideoUrl,
      filmmakerTrailerUrl: filmmakerTrailerUrl || '',
      filmmakerPosterUrl: filmmakerPosterUrl || '',
      creator: req.user.userId,
      genre: genre || [],
      country: country || '',
      language: language || '',
      duration: duration || '',
      year: year || new Date().getFullYear(),
      status: 'pending_review'
    });

    await film.save();
    res.status(201).json({ message: 'Film submitted for review', film });
  } catch (error) {
    console.error('Submit film error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update film (only if pending)
router.put('/film/:id', auth, requireRole('filmmaker', 'admin'), async (req, res) => {
  try {
    const film = await Film.findOne({ _id: req.params.id, creator: req.user.userId });
    if (!film) return res.status(404).json({ message: 'Film not found' });
    if (!['draft', 'pending_review', 'rejected'].includes(film.status)) {
      return res.status(400).json({ message: 'Cannot edit film after approval' });
    }

    const allowed = ['title', 'description', 'filmmakerVideoUrl', 'filmmakerTrailerUrl', 'filmmakerPosterUrl', 'genre', 'country', 'language', 'duration', 'year'];
    allowed.forEach(key => {
      if (req.body[key] !== undefined) film[key] = req.body[key];
    });
    if (film.status === 'rejected') film.status = 'pending_review';

    await film.save();
    res.json(film);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete film
router.delete('/film/:id', auth, requireRole('filmmaker', 'admin'), async (req, res) => {
  try {
    const film = await Film.findOneAndDelete({ _id: req.params.id, creator: req.user.userId });
    if (!film) return res.status(404).json({ message: 'Film not found' });
    res.json({ message: 'Film deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get filmmaker profile
router.get('/profile/:userId', async (req, res) => {
  try {
    const User = require('../models/User');
    const FilmmakerProfile = require('../models/FilmmakerProfile');

    const user = await User.findById(req.params.userId).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const profile = await FilmmakerProfile.findOne({ user: req.params.userId });
    const films = await Film.find({ creator: req.params.userId, status: 'published' })
      .select('title posterUrl rating views createdAt');

    res.json({
      user,
      profile: profile || {},
      films,
      filmCount: films.length
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update my profile
router.put('/profile', auth, requireRole('filmmaker', 'admin'), async (req, res) => {
  try {
    const FilmmakerProfile = require('../models/FilmmakerProfile');
    let profile = await FilmmakerProfile.findOne({ user: req.user.userId });

    if (!profile) {
      profile = new FilmmakerProfile({ user: req.user.userId, ...req.body });
    } else {
      Object.assign(profile, req.body);
    }

    await profile.save();
    res.json(profile);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
