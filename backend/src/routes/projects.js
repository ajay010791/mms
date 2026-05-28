const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const { fetchAllProjects } = require('../services/metabase');
const { getMockProjects, getMockProjectById } = require('../services/mockData');
const snapshotStore = require('../services/snapshotStore');

router.use(auth);

function useMock() {
  return process.env.USE_MOCK_DATA === 'true';
}

// stalledSinceMap kept for backward-compat with GET / and GET /:id
const stalledSinceMap = new Map();

async function buildAlerts(project) {
  const d = await snapshotStore.getDiff(project.id);

  if (d.isStalled && !stalledSinceMap.has(project.id)) {
    stalledSinceMap.set(project.id, new Date());
  } else if (!d.isStalled) {
    stalledSinceMap.delete(project.id);
  }

  return {
    isStalled:          d.isStalled,
    processedDiff:      d.diff,
    prevProcessedCount: d.channelPrevious,
    stalledSince:       d.stalledSince || stalledSinceMap.get(project.id) || null,
    conflictAlertActive: false
  };
}

async function toApiShape(p) {
  const alerts = await buildAlerts(p);
  return {
    id:              p.id,
    projectName:     p.project_name,
    migrationType:   p.type || 'messaging',
    cloudSource:     p.cloudBadge || p.clouds || '',
    combinationType: p.combination_type || '',
    createdAt:       p.created_at,
    workspace:       p.workspace || { total: 0, completed: 0, processedWithConflict: 0, conflict: 0, inProgress: 0, noMessage: 0 },
    messages:        p.messages  || { processed: 0, conflict: 0, repliesNotSynced: 0, notProcessed: 0 },
    alerts,
    // Kept for backward-compat with report routes that read these directly
    project_name:     p.project_name,
    type:             p.type,
    processed_count:  p.processed_count,
    conflict_count:   p.conflict_count,
    total_channels:   p.total_channels,
  };
}

router.get('/', async (req, res) => {
  try {
    let projects;
    if (useMock()) {
      projects = getMockProjects();
    } else {
      projects = await fetchAllProjects();
    }

    // Optional type filter for future use
    const typeFilter = req.query.type;
    if (typeFilter) {
      projects = projects.filter(p => p.type === typeFilter);
    }

    res.json(await Promise.all(projects.map(toApiShape)));
  } catch (err) {
    console.error('[Projects] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/live/:databaseId', async (req, res) => {
  try {
    const dbId = Number(req.params.databaseId);
    console.log(`[Projects] Live request for DB: ${dbId}`);

    if (isNaN(dbId)) return res.status(400).json({ error: 'Invalid database ID' });

    const ProjectConfig = require('../models/ProjectConfig');
    const config = await ProjectConfig.findOne({ metabaseDatabaseId: dbId });
    console.log('[Projects] Config found:', !!config, config?.projectName || 'N/A');

    if (!config) {
      return res.status(404).json({
        error: `No project with Metabase ID ${dbId}. Add it in Admin → Projects first.`
      });
    }

    const metabase = require('../services/metabase');
    let data;
    try {
      data = await metabase.fetchProjectData(dbId);
      console.log('[Projects] Metabase data fetched:', {
        channelTotal: data?.channels?.total,
        dmsTotal:     data?.dms?.total
      });
    } catch (metaErr) {
      console.error('[Projects] Metabase fetch failed:', metaErr.message);
      return res.status(500).json({
        error:      `Metabase error: ${metaErr.message}`,
        hint:       'Check backend console for detailed logs',
        databaseId: dbId
      });
    }

    const diffResult = await snapshotStore.getDiff(dbId);
    console.log(`[Projects] ✓ Data fetched for ${config.projectName} — channels:${data.channels?.total} dms:${data.dms?.total}`);

    res.json({
      id:              String(dbId),
      projectName:     config.projectName,
      projectId:       config.projectId   || '',
      migrationType:   config.migrationType,
      source:          config.source      || '',
      destination:     config.destination || '',
      combinationType: `${config.source || ''} → ${config.destination || ''}`,
      cloudSource:     config.source      || '',
      createdAt:       config.createdAt,
      channels:        data.channels,
      dms:             data.dms,
      dmToSpace:       data.dmToSpace,
      dataQuality:     data.dataQuality,
      config:          data.config,
      diff: {
        channelCurrent:  diffResult.channelCurrent,
        channelPrevious: diffResult.channelPrevious,
        channelDiff:     diffResult.channelDiff,
        channelMessage:  diffResult.channelMessage,
        dmsCurrent:      diffResult.dmsCurrent,
        dmsPrevious:     diffResult.dmsPrevious,
        dmsDiff:         diffResult.dmsDiff,
        dmsMessage:      diffResult.dmsMessage,
        dmToSpaceCurrent:  diffResult.dmToSpaceCurrent,
        dmToSpacePrevious: diffResult.dmToSpacePrevious,
        dmToSpaceDiff:     diffResult.dmToSpaceDiff,
        dmToSpaceMessage:  diffResult.dmToSpaceMessage,
        totalDiff:       diffResult.totalDiff,
        diff:            diffResult.diff,
        isStalled:       diffResult.isStalled,
        stalledSince:    diffResult.stalledSince,
        stalledDuration: diffResult.stalledDuration,
        snapshotAge:     diffResult.snapshotAge,
        hasEnoughData:   diffResult.hasEnoughData,
        message:         diffResult.message
      },
    });
  } catch (err) {
    console.error('[Projects] Unexpected error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/timeline/:databaseId', async (req, res) => {
  try {
    const dbId = Number(req.params.databaseId);
    const snapshots = await snapshotStore.getAllSnapshots(dbId);

    if (!snapshots || snapshots.length === 0) {
      return res.json({ timeline: [], message: 'No snapshots yet' });
    }

    const latest     = snapshots[snapshots.length - 1];
    const latestTime = new Date(latest.timestamp).getTime();

    const windows = [
      { label: '10 min',  minutes: 10   },
      { label: '30 min',  minutes: 30   },
      { label: '1 hour',  minutes: 60   },
      { label: '24 hrs',  minutes: 1440 }
    ];

    // Snapshots are taken every 30 min. Allow a comparison snapshot to be at most
    // 60% of the window size away from the target before calling it unavailable.
    // This prevents the 10-min window from using the same 30-min-old snapshot as
    // the 30-min window and showing identical (misleading) data.
    const windowTolerance = (w) => w.minutes * 60 * 1000 * 0.6;

    const timeline = windows.map(window => {
      const targetTime  = latestTime - window.minutes * 60 * 1000;
      const tolerance   = windowTolerance(window);

      let closest = null;
      let minDiff = Infinity;

      snapshots.forEach(snap => {
        const snapTime = new Date(snap.timestamp).getTime();
        // Exclude the latest snapshot itself — we need a PAST comparison point
        if (snapTime < latestTime) {
          const diff = Math.abs(snapTime - targetTime);
          if (diff < minDiff) {
            minDiff = diff;
            closest = snap;
          }
        }
      });

      // No usable comparison snapshot
      if (!closest) {
        return {
          window: window.label, minutes: window.minutes,
          channelDiff: null, dmsDiff: null, dmToSpaceDiff: null, totalDiff: null,
          available: false, message: `No snapshot from ${window.label} ago`
        };
      }

      // Comparison snapshot is too far from the target — would show misleading data
      if (minDiff > tolerance) {
        return {
          window: window.label, minutes: window.minutes,
          channelDiff: null, dmsDiff: null, dmToSpaceDiff: null, totalDiff: null,
          available: false,
          message: `No snapshot close enough to ${window.label} ago (nearest is ${Math.round(minDiff / 60000)} min away)`
        };
      }

      const channelDiff   = (latest.channelProcessedCount   || 0) - (closest.channelProcessedCount   || 0);
      const dmsDiff       = (latest.dmsProcessedCount       || 0) - (closest.dmsProcessedCount       || 0);
      const dmToSpaceDiff = (latest.dmToSpaceProcessedCount || 0) - (closest.dmToSpaceProcessedCount || 0);
      const totalDiff     = channelDiff + dmsDiff + dmToSpaceDiff;

      const actualMinutes = Math.round(
        (latestTime - new Date(closest.timestamp).getTime()) / 60000
      );

      return {
        window:        window.label,
        minutes:       window.minutes,
        actualMinutes,
        channelDiff:    Math.max(0, channelDiff),
        dmsDiff:        Math.max(0, dmsDiff),
        dmToSpaceDiff:  Math.max(0, dmToSpaceDiff),
        totalDiff:      Math.max(0, totalDiff),
        available:      true,
        isStalled:      totalDiff === 0,
        latestCount:   { channel: latest.channelProcessedCount || 0, dms: latest.dmsProcessedCount || 0, dmToSpace: latest.dmToSpaceProcessedCount || 0 },
        previousCount: { channel: closest.channelProcessedCount || 0, dms: closest.dmsProcessedCount || 0, dmToSpace: closest.dmToSpaceProcessedCount || 0 }
      };
    });

    res.json({ databaseId: dbId, latestSnapshot: latest.timestamp, timeline });
  } catch (err) {
    console.error('[Timeline] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    let project;
    if (useMock()) {
      project = getMockProjectById(req.params.id);
    } else {
      const projects = await fetchAllProjects();
      project = projects.find(p => p.id === req.params.id);
    }
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const history = await snapshotStore.getAllSnapshots(project.id);
    res.json({ ...(await toApiShape(project)), history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/snapshot/:id', async (req, res) => {
  try {
    const { minutesAgo } = req.query;
    const snap = await snapshotStore.getSnapshotAt(req.params.id, Number(minutesAgo) || 30);
    if (!snap) return res.status(404).json({ error: 'No snapshot found' });
    res.json(snap);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
