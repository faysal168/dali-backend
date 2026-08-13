const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const connectDB = require('./config/db');
const filmRoutes = require('./routes/films');
const authRoutes = require('./routes/auth');
const { authMiddleware, adminMiddleware } = require('./middleware/auth');
const { posterStorage, videoStorage } = require('./config/cloudinary');

// Connect to MongoDB
connectDB();

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================
// CREATE UPLOAD DIRECTORIES ON STARTUP (fallback)
// ============================================
const uploadsDir = path.join(__dirname, 'uploads');
const postersDir = path.join(__dirname, 'uploads', 'posters');
const videosDir = path.join(__dirname, 'uploads', 'videos');

[uploadsDir, postersDir, videosDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log('Created directory:', dir);
  }
});

const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================
// CLOUDINARY MULTER CONFIG
// ============================================
const posterUpload = multer({ storage: posterStorage });
const videoUpload = multer({ storage: videoStorage });

// Multer error wrapper
function handleUpload(field, uploadInstance) {
  return (req, res, next) => {
    uploadInstance.single(field)(req, res, (err) => {
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

// ============================================
// CLOUDINARY UPLOAD ENDPOINTS
// ============================================
app.post('/api/upload/poster', authMiddleware, adminMiddleware, handleUpload('poster', posterUpload), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
  res.json({ success: true, url: req.file.path });
});

app.post('/api/upload/video', authMiddleware, adminMiddleware, handleUpload('video', videoUpload), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
  res.json({ success: true, url: req.file.path });
});

// ============================================
// ROUTES
// ============================================
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
  console.log(`DALI Backend running on http://localhost:${PORT}`);
  console.log(`Uploads: ${path.join(__dirname, 'uploads')}`);
  console.log(`Cloudinary: ${process.env.CLOUDINARY_CLOUD_NAME || 'NOT CONFIGURED'}`);
});
