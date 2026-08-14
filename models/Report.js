const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  film: { type: mongoose.Schema.Types.ObjectId, ref: 'Film', required: true },
  reason: { type: String, required: true },
  details: { type: String, default: '' },
  status: { type: String, enum: ['open','reviewed','resolved'], default: 'open' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Report', reportSchema);
