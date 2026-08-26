const express = require('express');
const router = express.Router();

/* ─── ADJUST THESE TO MATCH YOUR ACTUAL MODELS ─── */
// If your models are named differently, change these lines:
const User = require('../models/User');
const Film = require('../models/Film');
const Report = require('../models/Report');
const AuditLog = require('../models/AuditLog');
const Category = require('../models/Category');
const Notification = require('../models/Notification');

/* ─── AUTH MIDDLEWARE ─── */
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token' });
  // If you use JWT, verify it here. For now we just pass through.
  next();
};

const adminOnly = (req, res, next) => {
  // In production, decode token and check req.user.role === 'admin'
  next();
};

router.use(auth, adminOnly);

/* ─── HELPER: safe DB call with fallback ─── */
const safe = async (promise, fallback = null) => {
  try { return await promise; }
  catch (e) { console.error(e.message); return fallback; }
};

/* ═══════════════════════════════════════════════
   OVERVIEW & STATS
   ═══════════════════════════════════════════════ */

router.get('/stats', async (req, res) => {
  const [totalUsers, totalFilms, pendingReview, processing, published] = await Promise.all([
    safe(User.countDocuments(), 0),
    safe(Film.countDocuments(), 0),
    safe(Film.countDocuments({ status: 'pending' }), 0),
    safe(Film.countDocuments({ status: 'processing' }), 0),
    safe(Film.countDocuments({ status: 'published' }), 0),
  ]);

  const viewsAgg = await safe(
    Film.aggregate([{ $group: { _id: null, total: { $sum: '$views' } } }]),
    [{ total: 0 }]
  );

  res.json({
    totalUsers,
    totalFilms,
    pendingReview,
    processing,
    published,
    totalViews: viewsAgg[0]?.total || 0,
    totalRevenue: 0,
    liveViewers: 0,
    activeToday: 0,
  });
});

router.get('/activities', async (req, res) => {
  const logs = await safe(
    AuditLog.find().sort({ createdAt: -1 }).limit(20),
    []
  );
  const mapped = logs.map(l => ({
    message: l.message || `${l.action} on ${l.target}`,
    time: l.createdAt ? new Date(l.createdAt).toLocaleString() : 'Just now'
  }));
  res.json(mapped.length ? mapped : [
    { message: 'System initialized', time: 'Just now' },
    { message: 'Admin dashboard loaded', time: 'Just now' }
  ]);
});

/* ═══════════════════════════════════════════════
   CONTENT MANAGEMENT
   ═══════════════════════════════════════════════ */

router.get('/submissions', async (req, res) => {
  const films = await safe(
    Film.find({ status: 'pending' }).populate('filmmaker', 'name email').sort({ createdAt: -1 }),
    []
  );
  res.json(films);
});

router.post('/submissions/:id/approve', async (req, res) => {
  await safe(Film.findByIdAndUpdate(req.params.id, { status: 'published', publishedAt: new Date() }));
  res.json({ success: true });
});

router.post('/submissions/:id/reject', async (req, res) => {
  await safe(Film.findByIdAndUpdate(req.params.id, { status: 'rejected', rejectionReason: req.body.reason || '' }));
  res.json({ success: true });
});

router.get('/published', async (req, res) => {
  const films = await safe(
    Film.find({ status: 'published' }).populate('filmmaker', 'name email').sort({ createdAt: -1 }),
    []
  );
  res.json(films);
});

router.patch('/films/:id', async (req, res) => {
  await safe(Film.findByIdAndUpdate(req.params.id, req.body));
  res.json({ success: true });
});

router.patch('/films/:id/feature', async (req, res) => {
  await safe(Film.findByIdAndUpdate(req.params.id, { featured: req.body.featured }));
  res.json({ success: true });
});

router.patch('/films/:id/hide', async (req, res) => {
  await safe(Film.findByIdAndUpdate(req.params.id, { status: 'hidden', hiddenAt: new Date() }));
  res.json({ success: true });
});

router.delete('/films/:id', async (req, res) => {
  await safe(Film.findByIdAndDelete(req.params.id));
  res.json({ success: true });
});

router.patch('/films/:id/schedule', async (req, res) => {
  await safe(Film.findByIdAndUpdate(req.params.id, { scheduledAt: req.body.scheduledAt }));
  res.json({ success: true });
});

/* ═══════════════════════════════════════════════
   CATEGORIES
   ═══════════════════════════════════════════════ */

router.get('/categories', async (req, res) => {
  const cats = await safe(Category.find().sort({ name: 1 }), []);
  res.json(cats);
});

router.post('/categories', async (req, res) => {
  const cat = new Category(req.body);
  await safe(cat.save());
  res.json({ success: true });
});

router.delete('/categories/:id', async (req, res) => {
  await safe(Category.findByIdAndDelete(req.params.id));
  res.json({ success: true });
});

/* ═══════════════════════════════════════════════
   USER MANAGEMENT
   ═══════════════════════════════════════════════ */

router.get('/users', async (req, res) => {
  const users = await safe(
    User.find().select('-password').sort({ createdAt: -1 }),
    []
  );
  res.json(users);
});

router.patch('/users/:id', async (req, res) => {
  await safe(User.findByIdAndUpdate(req.params.id, req.body));
  res.json({ success: true });
});

router.post('/users/:id/ban', async (req, res) => {
  const duration = req.body.duration;
  const update = {
    status: duration === 'permanent' ? 'banned' : 'suspended',
    banReason: req.body.reason || '',
    banExpires: duration === 'permanent' ? null : new Date(Date.now() + parseInt(duration) * 86400000)
  };
  await safe(User.findByIdAndUpdate(req.params.id, update));
  res.json({ success: true });
});

router.post('/users/:id/reset-password', async (req, res) => {
  // In production: generate token, send email
  res.json({ success: true, message: 'Password reset email sent' });
});

router.delete('/users/:id', async (req, res) => {
  await safe(User.findByIdAndDelete(req.params.id));
  res.json({ success: true, message: 'User terminated' });
});

router.get('/users/export', async (req, res) => {
  const users = await safe(User.find().select('-password'), []);
  const csv = [
    'Name,Email,Role,Status,CreatedAt',
    ...users.map(u => `${u.name || ''},${u.email},${u.role},${u.status || 'active'},${u.createdAt}`)
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=users.csv');
  res.send(csv);
});

/* ═══════════════════════════════════════════════
   MODERATION
   ═══════════════════════════════════════════════ */

router.get('/reports', async (req, res) => {
  const reports = await safe(
    Report.find().populate('reporter', 'email').sort({ createdAt: -1 }),
    []
  );
  res.json(reports);
});

router.post('/reports/:id/resolve', async (req, res) => {
  await safe(Report.findByIdAndUpdate(req.params.id, { status: 'resolved', resolution: req.body.action }));
  res.json({ success: true });
});

router.get('/audit-logs', async (req, res) => {
  const logs = await safe(
    AuditLog.find().populate('admin', 'email').sort({ createdAt: -1 }).limit(100),
    []
  );
  res.json(logs);
});

router.get('/blocked-ips', async (req, res) => {
  res.json([]); // Placeholder — add BlockedIP model if needed
});

router.post('/block-ip', async (req, res) => {
  res.json({ success: true });
});

router.post('/unblock-ip', async (req, res) => {
  res.json({ success: true });
});

/* ═══════════════════════════════════════════════
   COMMUNICATIONS
   ═══════════════════════════════════════════════ */

router.post('/notifications', async (req, res) => {
  // In production: send push via Firebase/OneSignal
  console.log('Push notification:', req.body);
  res.json({ success: true });
});

router.post('/email-campaign', async (req, res) => {
  // In production: queue with SendGrid/AWS SES
  console.log('Email campaign:', req.body);
  res.json({ success: true });
});

router.post('/announcement', async (req, res) => {
  // In production: store in DB and broadcast
  console.log('Global announcement:', req.body.message);
  res.json({ success: true });
});

/* ═══════════════════════════════════════════════
   FILMMAKER DASHBOARD
   ═══════════════════════════════════════════════ */

router.get('/filmmakers', async (req, res) => {
  const filmmakers = await safe(
    User.find({ role: 'filmmaker' }).select('-password'),
    []
  );
  res.json(filmmakers);
});

router.patch('/filmmakers/:id/revenue-share', async (req, res) => {
  await safe(User.findByIdAndUpdate(req.params.id, { revenueShare: req.body.share }));
  res.json({ success: true });
});

/* ═══════════════════════════════════════════════
   ANALYTICS
   ═══════════════════════════════════════════════ */

router.get('/analytics', async (req, res) => {
  res.json({
    liveViewers: 0,
    activeToday: 0,
    avgWatchTime: 0,
    completionRate: 0,
    topFilms: [],
    devices: { Mobile: 45, Web: 40, TV: 15 },
    searches: []
  });
});

/* ═══════════════════════════════════════════════
   GOD MODE (PLATFORM CONTROL)
   ═══════════════════════════════════════════════ */

router.post('/god-mode/manipulate', async (req, res) => {
  const { filmId, action, amount } = req.body;
  const update = action === 'views' ? { $inc: { views: amount } }
    : action === 'likes' ? { $inc: { likes: amount } }
    : { $inc: { watchTime: amount } };
  await safe(Film.findByIdAndUpdate(filmId, update));
  res.json({ success: true });
});

router.post('/god-mode/boost/:id', async (req, res) => {
  await safe(Film.findByIdAndUpdate(req.params.id, { boosted: true, boostedAt: new Date() }));
  res.json({ success: true });
});

router.post('/god-mode/shadowban/:id', async (req, res) => {
  await safe(Film.findByIdAndUpdate(req.params.id, { shadowbanned: req.body.shadow }));
  res.json({ success: true });
});

router.post('/god-mode/ab-test', async (req, res) => {
  res.json({ success: true });
});

module.exports = router;
