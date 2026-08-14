const express = require('express');
const router = express.Router();
const multer = require('multer');
const { posterStorage, videoStorage, trailerStorage } = require('../config/cloudinary');
const { authMiddleware, adminMiddleware, filmmakerMiddleware } = require('../middleware/auth');

const posterUpload = multer({ storage: posterStorage });
const videoUpload = multer({ storage: videoStorage });
const trailerUpload = multer({ storage: trailerStorage });

router.post('/poster', authMiddleware, filmmakerMiddleware, posterUpload.single('poster'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
  res.json({ success: true, url: req.file.path });
});

router.post('/video', authMiddleware, filmmakerMiddleware, videoUpload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
  res.json({ success: true, url: req.file.path });
});

router.post('/trailer', authMiddleware, filmmakerMiddleware, trailerUpload.single('trailer'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
  res.json({ success: true, url: req.file.path });
});

module.exports = router;
