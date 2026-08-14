const mongoose = require('mongoose');

const filmmakerProfileSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  bio: { type: String, default: '' },
  country: { type: String, default: '' },
  socialLinks: {
    twitter: { type: String, default: '' },
    instagram: { type: String, default: '' },
    website: { type: String, default: '' }
  },
  verificationStatus: { type: String, enum: ['unverified','pending','verified'], default: 'unverified' },
  totalViews: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 },
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  films: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Film' }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('FilmmakerProfile', filmmakerProfileSchema);
