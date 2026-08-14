const mongoose = require('mongoose');

const videoSessionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  film: { type: mongoose.Schema.Types.ObjectId, ref: 'Film', required: true },
  startedAt: { type: Date, default: Date.now },
  lastPosition: { type: Number, default: 0 },
  watchDuration: { type: Number, default: 0 },
  completed: { type: Boolean, default: false },
  ipAddress: { type: String, default: '' }
});

module.exports = mongoose.model('VideoSession', videoSessionSchema);
