const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const connectDB = require('./config/db');
const { posterStorage, videoStorage } = require('./config/cloudinary');
const { authMiddleware, adminMiddleware, filmmakerMiddleware } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 5000;

// Connect MongoDB
connectDB();

// Ensure upload dirs exist locally (fallback)
const uploadsDir = path.join(__dirname, 'uploads');
const postersDir = path.join(__dirname, 'uploads', 'posters');
const videosDir = path.join(__dirname, 'uploads', 'videos');
[uploadsDir, postersDir, videosDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const corsOptions = {
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Cloudinary multer instances
const posterUpload = multer({ storage: posterStorage });
const videoUpload = multer({ storage: videoStorage });

// Upload endpoints
app.post('/api/upload/poster', authMiddleware, adminMiddleware, posterUpload.single('poster'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
  res.json({ success: true, url: req.file.path });
});

app.post('/api/upload/video', authMiddleware, adminMiddleware, videoUpload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
  res.json({ success: true, url: req.file.path });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/films', require('./routes/films'));

// Health
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'DALI API is running', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🎬 DALI Backend running on port ${PORT}`);
  console.log(`☁️  Cloudinary: ${process.env.CLOUDINARY_CLOUD_NAME || 'not set'}`);
});
