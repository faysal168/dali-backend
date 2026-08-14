const mongoose = require('mongoose');

const watchProgressSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  film: { type: mongoose.Schema.Types.ObjectId, ref: 'Film', required: true },
  position: { type: Number, default: 0 },
  duration: { type: Number, default: 0 },
  percentWatched: { type: Number, default: 0 },
  completed: { type: Boolean, default: false },
  lastWatched: { type: Date, default: Date.now }
});

watchProgressSchema.index({ user: 1, film: 1 }, { unique: true });
module.exports = mongoose.model('WatchProgress', watchProgressSchema);
