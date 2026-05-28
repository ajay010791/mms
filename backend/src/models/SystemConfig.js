const mongoose = require('mongoose');

const SystemConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  data: { type: mongoose.Schema.Types.Mixed },          // plain (non-sensitive) fields
  encryptedData: { type: String },                       // AES-256-GCM blob of sensitive fields
  encryptedValue: { type: String },                      // legacy — read-only migration path
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: String }
});

SystemConfigSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('SystemConfig', SystemConfigSchema);
