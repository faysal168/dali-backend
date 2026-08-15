const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, default: '' },
  role: { type: String, enum: ['viewer', 'filmmaker', 'admin'], default: 'viewer' },
  avatar: { type: String, default: '' },
  bio: { type: String, default: '' },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
