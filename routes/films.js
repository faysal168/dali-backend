const express = require('express');
const Film = require('../models/Film');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { genre, status, sort, limit = 20, page = 1 } = req.query;
    const query = {};
    if (status) query.status = status;
    else query.status = 'published';
    if (genre) query.genre = { $in: genre.split(',') };
    let sortOption = { createdAt: -1 };
    if (sort === 'views') sortOption = { views: -1 };
    if (sort === 'rating') sortOption = { rating: -1 };
    const films = await Film.find(query).populate('creator', 'name').sort(sortOption).limit(parseInt(limit)).skip((parseInt(page) - 1) * parseInt(limit));
    res.json(films);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/featured', async (req, res) => {
  try {
    const film = await Film.findOne({ status: 'published' }).populate('creator', 'name').sort({ views: -1 });
    res.json(film);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const film = await Film.findById(req.params.id).populate('creator', 'name');
    if (!film) return res.status(404).json({ message: 'Film not found' });
    film.views = (film.views || 0) + 1;
    await film.save();
    res.json(film);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/search/:query', async (req, res) => {
  try {
    const films = await Film.find({
      status: 'published',
      $or: [
        { title: { $regex: req.params.query, $options: 'i' } },
        { description: { $regex: req.params.query, $options: 'i' } }
      ]
    }).populate('creator', 'name').limit(20);
    res.json(films);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
