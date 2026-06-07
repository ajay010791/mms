const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email: {
    type:      String,
    required:  true,
    unique:    true,
    lowercase: true,
    trim:      true
  },
  name: {
    type:    String,
    default: ''
  },
  role: {
    type:    String,
    enum:    ['pm', 'dm', 'sl', 'eng'],
    default: 'eng'
  },
  isActive: {
    type:    Boolean,
    default: true
  },
  addedBy: {
    type:    String,
    default: ''
  },
  lastLogin: {
    type: Date
  },
  createdAt: {
    type:    Date,
    default: Date.now
  }
});

module.exports = mongoose.model('User', UserSchema);
