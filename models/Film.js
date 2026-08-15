const mongoose = require('mongoose');

const filmSchema = new mongoose.Schema({
  // Filmmaker-submitted links (raw)
  filmmakerVideoUrl: { type: String, default: '' },
  filmmakerTrailerUrl: { type: String, default: '' },
  filmmakerPosterUrl: { type: String, default: '' },

  // Admin-uploaded final files (Cloudinary)
  videoUrl: { type: String, default: '' },
  trailerUrl: { type: String, default: '' },
  posterUrl: { type: String, default: '' },

  title: { type: String, required: true },
  description: { type: String, default: '' },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  genre: [{ type: String }],
  country: { type: String, default: '' },
  language: { type: String, default: '' },
  duration: { type: String, default: '' },
  year: { type: Number, default: new Date().getFullYear() },
  rating: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['draft', 'pending_review', 'processing', 'approved', 'rejected', 'published'],
    default: 'draft'
  },
  adminNote: { type: String, default: '' },
  views: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  watchlistCount: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Film', filmSchema);
