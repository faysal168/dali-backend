const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Request logger
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// MongoDB Connection
const MONGO_URI = process.env.MONGODB_URI || '';
let dbConnected = false;

if (!MONGO_URI) {
  console.error('ERROR: MONGODB_URI is not set!');
} else {
  mongoose.connect(MONGO_URI)
    .then(() => {
      console.log('MongoDB connected');
      dbConnected = true;
    })
    .catch(err => {
      console.error('MongoDB connection failed:', err.message);
      dbConnected = false;
    });
}

// Models
let User;
try {
  User = require('./models/User');
  console.log('User model loaded');
} catch (e) {
  console.error('User model failed to load:', e.message);
}

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'dali_secret';

// Inline auth middleware
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'No token' });
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) return res.status(401).json({ message: 'User not found' });
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token invalid' });
  }
};

const requireRole = (role) => (req, res, next) => {
  if (req.user.role !== role && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  next();
};

// DB check middleware
const checkDB = (req, res, next) => {
  if (!dbConnected || !User) {
    return res.status(503).json({ message: 'Database not connected. Please try again in a moment.' });
  }
  next();
};

// ========== AUTH ROUTES ==========

app.post('/api/auth/register', checkDB, async (req, res) => {
  console.log('REGISTER:', req.body);
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password required' });
    }

    let user = await User.findOne({ email });
    if (user && user.password) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashed = await bcrypt.hash(password, 10);

    if (user && !user.password) {
      user.name = name;
      user.password = hashed;
      user.role = role || user.role || 'viewer';
      await user.save();
      const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ token, user: { _id: user._id, name: user.name, email: user.email, role: user.role } });
    }

    user = new User({ name, email, password: hashed, role: role || 'viewer' });
    await user.save();
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { _id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error('REGISTER ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/auth/login', checkDB, async (req, res) => {
  console.log('LOGIN:', req.body);
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });
    if (!user.password) return res.status(400).json({ message: 'Account password missing. Please sign up again' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { _id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error('LOGIN ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/auth/me', auth, async (req, res) => {
  try {
    res.json(req.user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.put('/api/auth/profile', auth, async (req, res) => {
  try {
    const { name, phone, bio } = req.body;
    const user = await User.findByIdAndUpdate(req.user._id, { name, phone, bio }, { new: true }).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'User not found' });
    res.json({ message: 'Password reset link sent to your email' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    res.json({ message: 'Password reset successful' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ========== OTHER ROUTES ==========

try {
  app.use('/api/films', require('./routes/films'));
  console.log('Films routes loaded');
} catch (e) {
  console.error('Films routes failed:', e.message);
}

try {
  app.use('/api/filmmaker', require('./routes/filmmaker'));
  console.log('Filmmaker routes loaded');
} catch (e) {
  console.error('Filmmaker routes failed:', e.message);
}

try {
  app.use('/api/admin', require('./routes/admin'));
  console.log('Admin routes loaded');
} catch (e) {
  console.error('Admin routes failed:', e.message);
}

try {
  app.use('/api/watchlist', require('./routes/watchlist'));
  console.log('Watchlist routes loaded');
} catch (e) {
  console.error('Watchlist routes failed:', e.message);
}

try {
  app.use('/api/notifications', require('./routes/notifications'));
  console.log('Notifications routes loaded');
} catch (e) {
  console.error('Notifications routes failed:', e.message);
}

try {
  app.use('/api/earnings', require('./routes/earnings'));
  console.log('Earnings routes loaded');
} catch (e) {
  console.error('Earnings routes failed:', e.message);
}

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'DALI Backend Running', 
    dbConnected,
    timestamp: new Date().toISOString()
  });
});

// Catch-all
app.use('/api/*', (req, res) => {
  res.status(404).json({ message: 'API endpoint not found' });
});

// Error handler — ALWAYS return JSON
app.use((err, req, res, next) => {
  console.error('SERVER ERROR:', err.stack);
  res.status(500).json({ message: err.message || 'Server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
