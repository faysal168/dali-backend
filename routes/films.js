const express = require('express');
const router = express.Router();
const { loadFilmsDB, saveFilmsDB } = require('../database');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

function getAllFilms() {
  return loadFilmsDB().films;
}

function getFilmById(id) {
  return getAllFilms().find(f => f.id === id);
}

function saveFilms(films) {
  saveFilmsDB({ films });
}

// GET /api/films — public
router.get('/', (req, res) => {
  try {
    const rows = getAllFilms();
    const grouped = { trending: [], new: [], top: [] };
    for (const film of rows) {
      const f = {
        id: film.id,
        title: film.title,
        category: film.category,
        genre: film.genre,
        year: String(film.year),
        rating: String(film.rating),
        img: film.poster_path || '',
        video: film.video_path || '',
        desc: film.description || '',
        new: !!film.is_new,
      };
      if (grouped[film.category]) grouped[film.category].push(f);
    }
    res.json({ success: true, data: grouped });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/films/:id — public
router.get('/:id', (req, res) => {
  try {
    const film = getFilmById(req.params.id);
    if (!film) return res.status(404).json({ success: false, error: 'Film not found' });
    res.json({
      success: true,
      data: {
        id: film.id, title: film.title, category: film.category,
        genre: film.genre, year: String(film.year), rating: String(film.rating),
        img: film.poster_path || '', video: film.video_path || '',
        desc: film.description || '', new: !!film.is_new,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/films — admin only
router.post('/', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { title, category, genre, year, rating, description, is_new, poster_path, video_path } = req.body;
    if (!title || !category || !genre || !year || !rating) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    const films = getAllFilms();
    const film = {
      id: uuidv4(), title, category, genre, year: Number(year),
      rating: Number(rating), poster_path: poster_path || '',
      video_path: video_path || '', description: description || '',
      is_new: is_new ? 1 : 0, created_at: new Date().toISOString()
    };
    films.push(film);
    saveFilms(films);
    res.status(201).json({ success: true, data: film });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/films/:id — admin only
router.put('/:id', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { title, category, genre, year, rating, description, is_new, poster_path, video_path } = req.body;
    const films = getAllFilms();
    const idx = films.findIndex(f => f.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Film not found' });

    const film = films[idx];
    if (title !== undefined) film.title = title;
    if (category !== undefined) film.category = category;
    if (genre !== undefined) film.genre = genre;
    if (year !== undefined) film.year = Number(year);
    if (rating !== undefined) film.rating = Number(rating);
    if (poster_path !== undefined) film.poster_path = poster_path;
    if (video_path !== undefined) film.video_path = video_path;
    if (description !== undefined) film.description = description;
    if (is_new !== undefined) film.is_new = is_new ? 1 : 0;

    films[idx] = film;
    saveFilms(films);
    res.json({ success: true, data: film });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/films/:id — admin only
router.delete('/:id', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const films = getAllFilms();
    const film = films.find(f => f.id === req.params.id);
    if (!film) return res.status(404).json({ success: false, error: 'Film not found' });

    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (film.poster_path && !film.poster_path.startsWith('http')) {
      const p = path.join(uploadsDir, 'posters', path.basename(film.poster_path));
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    if (film.video_path && !film.video_path.startsWith('http')) {
      const p = path.join(uploadsDir, 'videos', path.basename(film.video_path));
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }

    const filtered = films.filter(f => f.id !== req.params.id);
    saveFilms(filtered);
    res.json({ success: true, message: 'Film deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/films/stats/all — public
router.get('/stats/all', (req, res) => {
  try {
    const films = getAllFilms();
    const total = films.length;
    const newCount = films.filter(f => f.is_new).length;
    const topCount = films.filter(f => f.category === 'top').length;
    const genreCount = new Set(films.map(f => f.genre)).size;
    res.json({ success: true, data: { total, newCount, topCount, genreCount } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// GET /api/films/search?q=term
router.get('/search/all', (req, res) => {
  try {
    const q = (req.query.q || '').toLowerCase().trim();
    const films = getAllFilms();
    const filtered = films.filter(f => {
      if (!q) return true;
      return (
        f.title.toLowerCase().includes(q) ||
        f.genre.toLowerCase().includes(q) ||
        (f.description && f.description.toLowerCase().includes(q)) ||
        String(f.year).includes(q)
      );
    }).map(film => ({
      id: film.id,
      title: film.title,
      category: film.category,
      genre: film.genre,
      year: String(film.year),
      rating: String(film.rating),
      img: film.poster_path || '',
      video: film.video_path || '',
      desc: film.description || '',
      new: !!film.is_new,
    }));
    res.json({ success: true, data: filtered });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
