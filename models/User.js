const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String },
  role: { type: String, enum: ['viewer', 'filmmaker', 'admin'], default: 'viewer' },
  phone: { type: String, default: '' },
  bio: { type: String, default: '' },
  avatar: { type: String, default: '' },
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  watchlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Film' }],
  earnings: { type: Number, default: 0 },
  totalViews: { type: Number, default: 0 },
  verified: { type: Boolean, default: false },
  resetToken: { type: String },
  resetTokenExpiry: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
