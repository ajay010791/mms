const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');

router.use(auth);

// ── All-projects summary ───────────────────────────────────────────────────────

router.get('/all', async (req, res) => {
  try {
    const { fetchAllProjects } = require('../services/metabase');
    const snapshotStore        = require('../services/snapshotStore');

    const projects = await fetchAllProjects();
    const reports  = projects.map(p => {
      const diff30   = snapshotStore.getDiff30Min?.(p.id, p.processed_count) ?? 0;
      const progress = p.total_channels > 0
        ? Math.round((p.completed / p.total_channels) * 100) : 0;
      let status = 'On Track';
      if (diff30 === 0)       status = 'Stalled';
      else if (p.conflict > 10) status = 'Critical';
      return { ...p, diff30min: diff30, progress, status };
    });

    res.json({ reports, generatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
