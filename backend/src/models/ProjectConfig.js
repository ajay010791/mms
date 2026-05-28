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
