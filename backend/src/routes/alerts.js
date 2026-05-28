const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ProjectConfig = require('../models/ProjectConfig');

router.get('/', auth, async (req, res) => {
  try {
    const configs = await ProjectConfig.find({});
    res.json(configs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:projectName', auth, async (req, res) => {
  try {
    const config = await ProjectConfig.findOne({ projectName: req.params.projectName });
    res.json(config || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { projectName, teamsWebhookUrl, alertEmail, migrationType } = req.body;
    if (!projectName) return res.status(400).json({ error: 'projectName required' });
    const doc = await ProjectConfig.findOneAndUpdate(
      { projectName },
      { projectName, teamsWebhookUrl, alertEmail, migrationType, updatedBy: req.user.email },
      { upsert: true, new: true }
    );
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const doc = await ProjectConfig.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedBy: req.user.email },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await ProjectConfig.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
