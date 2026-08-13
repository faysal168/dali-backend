const mongoose = require('mongoose');

const filmSchema = new mongoose.Schema({
  title: { type: String, required: true },
  category: { type: String, required: true, default: 'trending' },
  genre: { type: String, default: '' },
  year: { type: Number, default: 2026 },
  rating: { type: Number, default: 0 },
  img: { type: String, required: true },
  video: { type: String, required: true },
  desc: { type: String, default: '' },
  new: { type: Boolean, default: false },
}, {
  timestamps: true
});

module.exports = mongoose.model('Film', filmSchema);
