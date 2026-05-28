const mongoose = require('mongoose');

const AdminLogSchema = new mongoose.Schema({
  action: { type: String, required: true },
  user: { type: String },
  source: { type: String, enum: ['ms-login', 'dev-login', 'system'] },
  route: { type: String },
  timestamp: { type: Date, default: Date.now },
  details: { type: mongoose.Schema.Types.Mixed }
});

module.exports = mongoose.model('AdminLog', AdminLogSchema);
