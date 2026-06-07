const mongoose = require('mongoose');

const PLATFORMS = ['Slack', 'Google Chat', 'Teams', 'Meta'];

const ProjectConfigSchema = new mongoose.Schema({
  projectName: {
    type: String,
    required: true,
    trim: true
  },
  metabaseDatabaseId: {
    type: Number,
    required: true,
    unique: true
  },
  projectId: {
    type: String,
    required: true,
    trim: true
  },
  source: {
    type: String,
    required: true,
    enum: PLATFORMS
  },
  destination: {
    type: String,
    required: true,
    enum: PLATFORMS
  },
  migrationType: {
    type: String,
    default: 'messaging'
  },
  teamsWebhookUrl: {
    type: String,
    default: '',
    trim: true
  },
  alertEmail: {
    type: String,
    default: '',
    trim: true
  },
  showDms: {
    type: Boolean,
    default: true
  },
  showDmToSpace: {
    type: Boolean,
    default: false
  },
  status: {
    type:    String,
    enum:    ['active', 'inactive', 'on_hold'],
    default: 'active'
  },
  alertsEnabled: {
    type: Boolean,
    default: true
  },
  alertChannels: {
    type: Boolean,
    default: true
  },
  alertDms: {
    type: Boolean,
    default: true
  },
  alertDmToSpace: {
    type: Boolean,
    default: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('ProjectConfig', ProjectConfigSchema);
