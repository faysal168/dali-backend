const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const filmRoutes = require('./routes/films');
const authRoutes = require('./routes/auth');
const { authMiddleware, adminMiddleware } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 5000;

const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = file.fieldname === 'poster' ? 'posters' : 'videos';
    cb(null, path.join(__dirname, 'uploads', folder));
  },
  filename: (req, file, cb) => {
    cb(null, uuidv4() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'poster' && !file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files for posters'));
    }
    if (file.fieldname === 'video' && !file.mimetype.startsWith('video/')) {
      return cb(new Error('Only video files'));
    }
    cb(null, true);
  }
});

// Multer error wrapper
function handleUpload(field) {
  return (req, res, next) => {
    upload.single(field)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ success: false, error: 'File too large. Max 500MB.' });
        }
        return res.status(400).json({ success: false, error: err.message });
      }
      if (err) {
        return res.status(400).json({ success: false, error: err.message });
      }
      next();
    });
  };
}

// Upload endpoints - protected
app.post('/api/upload/poster', authMiddleware, adminMiddleware, handleUpload('poster'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
  res.json({ success: true, url: `/uploads/posters/${req.file.filename}` });
});

app.post('/api/upload/video', authMiddleware, adminMiddleware, handleUpload('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
  res.json({ success: true, url: `/uploads/videos/${req.file.filename}` });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/films', filmRoutes);

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
  console.log(`🎬 DALI Backend running on http://localhost:${PORT}`);
  console.log(`📁 Uploads: ${path.join(__dirname, 'uploads')}`);
  console.log(`🗄️  Database: ${path.join(__dirname, 'data')}`);
});
