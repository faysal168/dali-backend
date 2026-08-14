const mongoose = require('mongoose');

const filmSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  genre: { type: String, default: '' },
  country: { type: String, default: '' },
  language: { type: String, default: '' },
  releaseYear: { type: Number },
  runtime: { type: String, default: '' },
  director: { type: String, default: '' },
  cast: { type: String, default: '' },
  img: { type: String, default: '' },
  backdrop: { type: String, default: '' },
  video: { type: String, default: '' },
  trailer: { type: String, default: '' },
  filmmaker: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  filmmakerName: { type: String, default: '' },
  status: {
    type: String,
    enum: ['draft','pending_review','approved','published','rejected','changes_requested','unpublished'],
    default: 'draft'
  },
  statusMessage: { type: String, default: '' },
  featured: { type: Boolean, default: false },
  views: { type: Number, default: 0 },
  qualifiedViews: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  avgRating: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Film', filmSchema);
