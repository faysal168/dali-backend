const express = require('express');
const router = express.Router();
const Report = require('../models/Report');
const { authMiddleware } = require('../middleware/auth');

router.post('/:filmId', authMiddleware, async (req, res) => {
  try {
    const { reason, details } = req.body;
    const report = await Report.create({
      reporter: req.user.id,
      film: req.params.filmId,
      reason,
      details
    });
    res.status(201).json({ success: true, report });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
