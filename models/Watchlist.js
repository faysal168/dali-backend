const mongoose = require('mongoose');

const watchlistSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  film: { type: mongoose.Schema.Types.ObjectId, ref: 'Film', required: true },
  createdAt: { type: Date, default: Date.now }
});

watchlistSchema.index({ user: 1, film: 1 }, { unique: true });
module.exports = mongoose.model('Watchlist', watchlistSchema);
