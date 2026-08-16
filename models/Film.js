const mongoose = require('mongoose');

const filmSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  synopsis: { type: String },
  genre: { type: String, required: true },
  duration: { type: String },
  year: { type: String },
  country: { type: String },
  language: { type: String },
  director: { type: String },
  cast: { type: String },
  poster: { type: String, default: '' },
  trailerUrl: { type: String, default: '' },
  videoUrl: { type: String, default: '' },
  filmmaker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  filmmakerName: { type: String },
  status: { 
    type: String, 
    enum: ['pending_review', 'processing', 'approved', 'rejected'], 
    default: 'pending_review' 
  },
  rejectionReason: { type: String, default: '' },
  adminNotes: { type: String, default: '' },
  views: { type: Number, default: 0 },
  uniqueViewers: [{ type: String }],
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  likesCount: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 },
  paidOut: { type: Number, default: 0 },
  payoutRequested: { type: Boolean, default: false },
  payoutStatus: { 
    type: String, 
    enum: ['none', 'pending', 'paid', 'rejected'], 
    default: 'none' 
  },
  payoutAmount: { type: Number, default: 0 },
  payoutDate: { type: Date },
  payoutMethod: { type: String, default: '' },
  payoutPhone: { type: String, default: '' },
  featured: { type: Boolean, default: false },
  trending: { type: Boolean, default: false },
  tags: [{ type: String }],
  submittedAt: { type: Date, default: Date.now },
  publishedAt: { type: Date },
  filmmakerLinks: {
    filmUrl: { type: String, default: '' },
    trailerUrl: { type: String, default: '' },
    posterUrl: { type: String, default: '' }
  }
}, { timestamps: true });

// $2 per 500 unique views. 1 USD = 3700 UGX
filmSchema.methods.calculateEarnings = function() {
  const uniqueViewCount = this.uniqueViewers ? this.uniqueViewers.length : 0;
  const blocksOf500 = Math.floor(uniqueViewCount / 500);
  const earningsUSD = blocksOf500 * 2;
  return Math.floor(earningsUSD * 3700);
};

module.exports = mongoose.model('Film', filmSchema);
