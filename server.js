const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();

// ============================================
// 1. CREATE UPLOAD DIRECTORIES ON STARTUP
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

// ============================================
// 2. MIDDLEWARE
// ============================================
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================
// 3. MULTER CONFIGURATION (with auto-create dirs)
// ============================================
const createStorage = (folderName) => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = path.join(__dirname, 'uploads', folderName);
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
      cb(null, uniqueName);
    }
  });
};

const posterUpload = multer({ 
  storage: createStorage('posters'),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed for posters'), false);
    }
  }
});

const videoUpload = multer({ 
  storage: createStorage('videos'),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed'), false);
    }
  }
});

// ============================================
// 4. DATABASE CONNECTION
// ============================================
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dali')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// ============================================
// 5. SCHEMAS
// ============================================
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isAdmin: { type: Boolean, default: false }
}, { timestamps: true });

const filmSchema = new mongoose.Schema({
  title: { type: String, required: true },
  category: { type: String, required: true },
  genre: { type: String, required: true },
  year: { type: Number, required: true },
  rating: { type: Number, default: 0 },
  posterUrl: { type: String, required: true },
  videoUrl: { type: String, required: true },
  description: { type: String },
  isNewRelease: { type: Boolean, default: false }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Film = mongoose.model('Film', filmSchema);

// ============================================
// 6. AUTH ROUTES
// ============================================
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = await User.findById(decoded.id).select('-password');
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) return res.status(400).json({ message: 'User already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const userCount = await User.countDocuments();
    const user = await User.create({ 
      username, 
      email, 
      password: hashed,
      isAdmin: userCount === 0 // First user is admin
    });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'your-secret-key');
    res.json({ token, user: { id: user._id, username: user.username, email: user.email, isAdmin: user.isAdmin } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'your-secret-key');
    res.json({ token, user: { id: user._id, username: user.username, email: user.email, isAdmin: user.isAdmin } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get current user
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  res.json(req.user);
});

// ============================================
// 7. FILM ROUTES
// ============================================

// Get all films
app.get('/api/films', async (req, res) => {
  try {
    const films = await Film.find().sort({ createdAt: -1 });
    res.json(films);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get single film
app.get('/api/films/:id', async (req, res) => {
  try {
    const film = await Film.findById(req.params.id);
    if (!film) return res.status(404).json({ message: 'Film not found' });
    res.json(film);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add film (with poster + video upload)
app.post('/api/films', 
  authMiddleware,
  posterUpload.single('poster'),
  videoUpload.single('video'),
  async (req, res) => {
    try {
      const { title, category, genre, year, rating, description, isNewRelease } = req.body;

      // Build URLs - use Render URL or fallback to relative
      const baseUrl = process.env.BASE_URL || '';
      const posterUrl = req.file ? `${baseUrl}/uploads/posters/${req.file.filename}` : req.body.posterUrl;

      // For video, handle separately since multer handles one file at a time per field
      // If you need both files in one request, use fields() instead

      const film = await Film.create({
        title,
        category,
        genre,
        year: parseInt(year),
        rating: parseFloat(rating) || 0,
        posterUrl,
        videoUrl: req.body.videoUrl || '',
        description,
        isNewRelease: isNewRelease === 'true' || isNewRelease === true
      });

      res.status(201).json(film);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

// Add film with multiple files (poster + video in one request)
app.post('/api/films/upload',
  authMiddleware,
  (req, res, next) => {
    // Use multer fields to handle both files
    const upload = multer({
      storage: multer.diskStorage({
        destination: (req, file, cb) => {
          const folder = file.fieldname === 'poster' ? 'posters' : 'videos';
          const uploadPath = path.join(__dirname, 'uploads', folder);
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
          cb(null, uniqueName);
        }
      }),
      limits: { fileSize: 500 * 1024 * 1024 }
    }).fields([
      { name: 'poster', maxCount: 1 },
      { name: 'video', maxCount: 1 }
    ]);

    upload(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message });
      next();
    });
  },
  async (req, res) => {
    try {
      const { title, category, genre, year, rating, description, isNewRelease } = req.body;
      const baseUrl = process.env.BASE_URL || `https://${req.get('host')}`;

      const posterFile = req.files?.poster?.[0];
      const videoFile = req.files?.video?.[0];

      const posterUrl = posterFile 
        ? `${baseUrl}/uploads/posters/${posterFile.filename}` 
        : req.body.posterUrl;
      const videoUrl = videoFile 
        ? `${baseUrl}/uploads/videos/${videoFile.filename}` 
        : req.body.videoUrl;

      const film = await Film.create({
        title,
        category,
        genre,
        year: parseInt(year),
        rating: parseFloat(rating) || 0,
        posterUrl,
        videoUrl,
        description,
        isNewRelease: isNewRelease === 'true' || isNewRelease === true
      });

      res.status(201).json(film);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

// Delete film
app.delete('/api/films/:id', authMiddleware, async (req, res) => {
  try {
    const film = await Film.findById(req.params.id);
    if (!film) return res.status(404).json({ message: 'Film not found' });

    // Delete files from disk
    if (film.posterUrl) {
      const posterPath = path.join(__dirname, film.posterUrl.replace(/^.*\/uploads/, 'uploads'));
      if (fs.existsSync(posterPath)) fs.unlinkSync(posterPath);
    }
    if (film.videoUrl) {
      const videoPath = path.join(__dirname, film.videoUrl.replace(/^.*\/uploads/, 'uploads'));
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    }

    await Film.findByIdAndDelete(req.params.id);
    res.json({ message: 'Film deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================
// 8. ERROR HANDLING
// ============================================
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: err.message || 'Something went wrong!' });
});

// ============================================
// 9. START SERVER
// ============================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Upload directories ready');
});
