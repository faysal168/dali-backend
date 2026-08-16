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

const requireRole = (role) => (req, res, next) => {
  if (req.user.role !== role && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  next();
};

const MIN_PAYOUT_UGX = 20000;

// Get creator earnings dashboard
router.get('/creator', auth, requireRole('filmmaker'), async (req, res) => {
  try {
    const films = await Film.find({ filmmaker: req.user._id });
    let totalUniqueViews = 0;
    let totalEarnings = 0;
    let paidOut = 0;

    const filmStats = films.map(f => {
      const uniqueViews = f.uniqueViewers?.length || 0;
      const earnings = f.calculateEarnings();
      totalUniqueViews += uniqueViews;
      totalEarnings += earnings;
      paidOut += f.paidOut || 0;
      return {
        _id: f._id,
        title: f.title,
        uniqueViews,
        totalViews: f.views,
        earnings,
        status: f.status,
        payoutStatus: f.payoutStatus
      };
    });

    const available = totalEarnings - paidOut;
    const canRequest = available >= MIN_PAYOUT_UGX;

    res.json({
      totalUniqueViews,
      totalEarnings,
      paidOut,
      available,
      canRequest,
      minPayout: MIN_PAYOUT_UGX,
      rate: '$2 per 500 unique views',
      films: filmStats
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Request payout
router.post('/request', auth, requireRole('filmmaker'), async (req, res) => {
  try {
    const { method, phone } = req.body;
    if (!method || !phone) {
      return res.status(400).json({ message: 'Payout method and phone number required' });
    }

    const films = await Film.find({ filmmaker: req.user._id });
    let totalEarnings = 0;
    let paidOut = 0;

    films.forEach(f => {
      totalEarnings += f.calculateEarnings();
      paidOut += f.paidOut || 0;
    });

    const available = totalEarnings - paidOut;
    if (available < MIN_PAYOUT_UGX) {
      return res.status(400).json({ message: `Minimum payout is UGX ${MIN_PAYOUT_UGX.toLocaleString()}` });
    }

    // Mark all films as payout pending
    await Film.updateMany(
      { filmmaker: req.user._id },
      { 
        payoutRequested: true, 
        payoutStatus: 'pending',
        payoutAmount: available,
        payoutMethod: method,
        payoutPhone: phone
      }
    );

    res.json({ message: 'Payout request submitted', amount: available, method, phone });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin: get all pending payouts
router.get('/admin/pending', auth, requireRole('admin'), async (req, res) => {
  try {
    const films = await Film.find({ payoutStatus: 'pending' }).populate('filmmaker', 'name email phone');
    const grouped = {};

    films.forEach(f => {
      const key = f.filmmaker._id.toString();
      if (!grouped[key]) {
        grouped[key] = {
          filmmaker: f.filmmaker,
          films: [],
          totalAmount: 0
        };
      }
      grouped[key].films.push({
        _id: f._id,
        title: f.title,
        uniqueViews: f.uniqueViewers?.length || 0,
        earnings: f.calculateEarnings(),
        payoutAmount: f.payoutAmount,
        payoutPhone: f.payoutPhone,
        payoutMethod: f.payoutMethod
      });
      grouped[key].totalAmount += f.payoutAmount || 0;
    });

    res.json(Object.values(grouped));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin: mark payout as paid
router.post('/admin/pay/:filmmakerId', auth, requireRole('admin'), async (req, res) => {
  try {
    const { filmmakerId } = req.params;
    const { transactionId } = req.body;

    const films = await Film.find({ filmmaker: filmmakerId, payoutStatus: 'pending' });
    let totalPaid = 0;

    for (const film of films) {
      const earnings = film.calculateEarnings();
      totalPaid += earnings;
      film.paidOut = (film.paidOut || 0) + earnings;
      film.payoutStatus = 'paid';
      film.payoutDate = new Date();
      film.payoutRequested = false;
      if (transactionId) film.adminNotes = `Paid: ${transactionId}`;
      await film.save();
    }

    res.json({ message: 'Payout marked as paid', totalPaid, filmsUpdated: films.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin: reject payout
router.post('/admin/reject/:filmmakerId', auth, requireRole('admin'), async (req, res) => {
  try {
    const { filmmakerId } = req.params;
    const { reason } = req.body;

    await Film.updateMany(
      { filmmaker: filmmakerId, payoutStatus: 'pending' },
      { payoutStatus: 'rejected', payoutRequested: false, rejectionReason: reason || '' }
    );

    res.json({ message: 'Payout rejected' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
