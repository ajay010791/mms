const mongoose = require('mongoose');

const SnapshotSchema = new mongoose.Schema({
  databaseId:   { type: Number, required: true, index: true },
  projectName:  { type: String },
  timestamp:    { type: Date, required: true, index: true },

  channelTotal:                 { type: Number, default: 0 },
  channelCompleted:             { type: Number, default: 0 },
  channelInProgress:            { type: Number, default: 0 },
  channelConflict:              { type: Number, default: 0 },
  channelNoMessage:             { type: Number, default: 0 },
  channelProcessedWithConflict: { type: Number, default: 0 },

  channelProcessedCount:    { type: Number, default: 0 },
  channelInProgressCount:   { type: Number, default: 0 },
  channelConflictCount:     { type: Number, default: 0 },
  channelNotProcessedCount: { type: Number, default: 0 },

  dmsTotal:      { type: Number, default: 0 },
  dmsCompleted:  { type: Number, default: 0 },
  dmsInProgress: { type: Number, default: 0 },
  dmsConflict:   { type: Number, default: 0 },
  dmsNoMessage:  { type: Number, default: 0 },

  dmsProcessedCount:    { type: Number, default: 0 },
  dmsInProgressCount:   { type: Number, default: 0 },
  dmsConflictCount:     { type: Number, default: 0 },
  dmsNotProcessedCount: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now }
});

SnapshotSchema.index({ databaseId: 1, timestamp: -1 });
SnapshotSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('Snapshot', SnapshotSchema);
