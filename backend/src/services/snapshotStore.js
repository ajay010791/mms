const Snapshot = require('../models/Snapshot');

// In-memory cache: Map<databaseId, Snapshot[]>
const memoryCache = new Map();
const CACHE_SIZE  = 48; // 24 hrs at 30-min intervals
const INTERVAL_MS = 30 * 60 * 1000;

// ── ADD ───────────────────────────────────────────────────────────────────────

const addSnapshot = async (databaseId, projectName, data) => {
  try {
    const id  = Number(databaseId);
    const now = new Date();

    const snapshotData = {
      databaseId:   id,
      projectName:  projectName || '',
      timestamp:    now,

      channelTotal:                data.channelTotal                || 0,
      channelCompleted:            data.channelCompleted            || 0,
      channelInProgress:           data.channelInProgress           || 0,
      channelConflict:             data.channelConflict             || 0,
      channelNoMessage:            data.channelNoMessage            || 0,
      channelProcessedWithConflict: data.channelProcessedWithConflict || 0,

      channelProcessedCount:    data.channelProcessedCount    || 0,
      channelInProgressCount:   data.channelInProgressCount   || 0,
      channelConflictCount:     data.channelConflictCount     || 0,
      channelNotProcessedCount: data.channelNotProcessedCount || 0,

      dmsTotal:      data.dmsTotal      || 0,
      dmsCompleted:  data.dmsCompleted  || 0,
      dmsInProgress: data.dmsInProgress || 0,
      dmsConflict:   data.dmsConflict   || 0,
      dmsNoMessage:  data.dmsNoMessage  || 0,

      dmsProcessedCount:    data.dmsProcessedCount    || 0,
      dmsInProgressCount:   data.dmsInProgressCount   || 0,
      dmsConflictCount:     data.dmsConflictCount     || 0,
      dmsNotProcessedCount: data.dmsNotProcessedCount || 0,

      dmToSpaceTotal:                 data.dmToSpaceTotal                 || 0,
      dmToSpaceCompleted:             data.dmToSpaceCompleted             || 0,
      dmToSpaceInProgress:            data.dmToSpaceInProgress            || 0,
      dmToSpaceConflict:              data.dmToSpaceConflict              || 0,
      dmToSpaceNoMessage:             data.dmToSpaceNoMessage             || 0,
      dmToSpaceProcessedWithConflict: data.dmToSpaceProcessedWithConflict || 0,

      dmToSpaceProcessedCount:    data.dmToSpaceProcessedCount    || 0,
      dmToSpaceInProgressCount:   data.dmToSpaceInProgressCount   || 0,
      dmToSpaceConflictCount:     data.dmToSpaceConflictCount     || 0,
      dmToSpaceNotProcessedCount: data.dmToSpaceNotProcessedCount || 0,

      createdAt: now
    };

    await Snapshot.create(snapshotData);

    if (!memoryCache.has(id)) memoryCache.set(id, []);
    const cache = memoryCache.get(id);
    cache.push(snapshotData);
    if (cache.length > CACHE_SIZE) cache.splice(0, cache.length - CACHE_SIZE);

    console.log(
      `[Snapshot] DB ${id} — saved #${cache.length} ` +
      `channelProcessed=${snapshotData.channelProcessedCount} ` +
      `dmsProcessed=${snapshotData.dmsProcessedCount} ` +
      `dmToSpaceProcessed=${snapshotData.dmToSpaceProcessedCount}`
    );

    return snapshotData;
  } catch (err) {
    console.error('[Snapshot] Save error:', err.message);
    return null;
  }
};

// ── LOAD FROM DB ──────────────────────────────────────────────────────────────

const loadFromDB = async (databaseId) => {
  try {
    const id    = Number(databaseId);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const snapshots = await Snapshot.find({ databaseId: id, timestamp: { $gte: since } })
      .sort({ timestamp: 1 })
      .limit(CACHE_SIZE)
      .lean();

    memoryCache.set(id, snapshots);
    console.log(`[Snapshot] Loaded ${snapshots.length} snapshots from MongoDB for DB ${id}`);
    return snapshots;
  } catch (err) {
    console.error('[Snapshot] loadFromDB error:', err.message);
    return [];
  }
};

// ── GET SNAPSHOTS (cache → DB fallback) ───────────────────────────────────────

const getSnapshots = async (databaseId) => {
  const id = Number(databaseId);
  if (memoryCache.has(id) && memoryCache.get(id).length > 0) return memoryCache.get(id);
  return loadFromDB(id);
};

// ── Time formatter ────────────────────────────────────────────────────────────

function formatAge(minutes) {
  if (minutes < 60) return `${minutes} min ago`;
  const hrs  = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs} hr ${mins} min ago` : `${hrs} hr ago`;
}

// ── DIFF ──────────────────────────────────────────────────────────────────────

const getDiff = async (databaseId) => {
  const id        = Number(databaseId);
  const snapshots = await getSnapshots(id);

  if (snapshots.length === 0) {
    return {
      channelDiff: null, dmsDiff: null, totalDiff: null,
      isStalled: false, stalledSince: null, stalledDuration: null, snapshotAge: null,
      hasEnoughData: false, message: 'No snapshots yet — loading first snapshot'
    };
  }

  if (snapshots.length === 1) {
    return {
      channelDiff: null, dmsDiff: null, totalDiff: null,
      isStalled: false, stalledSince: null, stalledDuration: null, snapshotAge: null,
      hasEnoughData: false, message: 'First snapshot taken — diff available after 30 min'
    };
  }

  const latest   = snapshots[snapshots.length - 1];
  const latestTs = new Date(latest.timestamp).getTime();
  const targetTs = latestTs - INTERVAL_MS;

  let prev = snapshots[0];
  for (const snap of snapshots) {
    const snapTs = new Date(snap.timestamp).getTime();
    const prevTs = new Date(prev.timestamp).getTime();
    if (Math.abs(snapTs - targetTs) < Math.abs(prevTs - targetTs)) prev = snap;
  }
  if (new Date(prev.timestamp).getTime() === latestTs && snapshots.length > 1) {
    prev = snapshots[snapshots.length - 2];
  }

  const prevTs     = new Date(prev.timestamp).getTime();
  const ageMinutes = Math.round((latestTs - prevTs) / 60000);

  const channelDiff    = latest.channelProcessedCount               - prev.channelProcessedCount;
  const dmsDiff        = latest.dmsProcessedCount                   - prev.dmsProcessedCount;
  const dmToSpaceDiff  = (latest.dmToSpaceProcessedCount || 0)      - (prev.dmToSpaceProcessedCount || 0);
  const totalDiff      = channelDiff + dmsDiff + dmToSpaceDiff;
  const isStalled      = totalDiff === 0;

  let stalledSince = null;
  if (isStalled) {
    stalledSince = prev.timestamp;
    for (let i = snapshots.length - 2; i >= 1; i--) {
      const curr   = snapshots[i];
      const before = snapshots[i - 1];
      if (
        curr.channelProcessedCount               === latest.channelProcessedCount &&
        curr.dmsProcessedCount                   === latest.dmsProcessedCount &&
        (curr.dmToSpaceProcessedCount || 0)      === (latest.dmToSpaceProcessedCount || 0)
      ) {
        stalledSince = before.timestamp;
      } else {
        break;
      }
    }
  }

  return {
    channelCurrent:  latest.channelProcessedCount,
    channelPrevious: prev.channelProcessedCount,
    channelDiff,
    channelMessage: channelDiff === 0
      ? `⚠ No change in last ${formatAge(ageMinutes)}`
      : `+${channelDiff.toLocaleString()} msgs in last ${formatAge(ageMinutes)}`,

    dmsCurrent:  latest.dmsProcessedCount,
    dmsPrevious: prev.dmsProcessedCount,
    dmsDiff,
    dmsMessage: dmsDiff === 0
      ? `⚠ No change in last ${formatAge(ageMinutes)}`
      : `+${dmsDiff.toLocaleString()} msgs in last ${formatAge(ageMinutes)}`,

    dmToSpaceCurrent:  latest.dmToSpaceProcessedCount || 0,
    dmToSpacePrevious: prev.dmToSpaceProcessedCount   || 0,
    dmToSpaceDiff,
    dmToSpaceMessage: dmToSpaceDiff === 0
      ? `⚠ No change in last ${formatAge(ageMinutes)}`
      : `+${dmToSpaceDiff.toLocaleString()} msgs in last ${formatAge(ageMinutes)}`,

    totalDiff,
    diff: totalDiff, // backward-compat
    isStalled,
    stalledSince,
    stalledDuration: stalledSince
      ? Math.round((Date.now() - new Date(stalledSince).getTime()) / 60000)
      : null,
    snapshotAge:   ageMinutes,
    hasEnoughData: true,
    message: isStalled
      ? `⚠ No change in last ${formatAge(ageMinutes)}`
      : `+${totalDiff.toLocaleString()} msgs in last ${formatAge(ageMinutes)}`
  };
};

// ── POINT-IN-TIME ─────────────────────────────────────────────────────────────

const getSnapshotAt = async (databaseId, minutesAgo) => {
  try {
    const id         = Number(databaseId);
    const targetTime = new Date(Date.now() - minutesAgo * 60 * 1000);

    const snapshot = await Snapshot.findOne({
      databaseId: id,
      timestamp: {
        $gte: new Date(targetTime.getTime() - 20 * 60 * 1000),
        $lte: new Date(targetTime.getTime() + 20 * 60 * 1000)
      }
    }).sort({ timestamp: -1 }).lean();

    if (!snapshot) console.log(`[Snapshot] No snapshot found for DB ${id} at ${minutesAgo} min ago`);
    return snapshot || null;
  } catch (err) {
    console.error('[Snapshot] getSnapshotAt error:', err.message);
    return null;
  }
};

// ── ALL SNAPSHOTS ─────────────────────────────────────────────────────────────

const getAllSnapshots = async (databaseId) => getSnapshots(databaseId);

// ── STARTUP CACHE INIT ────────────────────────────────────────────────────────

const initializeCache = async () => {
  try {
    const ProjectConfig = require('../models/ProjectConfig');
    const projects = await ProjectConfig.find({ isActive: true });
    console.log(`[Snapshot] Initializing cache for ${projects.length} projects...`);
    for (const project of projects) await loadFromDB(project.metabaseDatabaseId);
    console.log('[Snapshot] Cache initialized ✓');
  } catch (err) {
    console.error('[Snapshot] Cache init error:', err.message);
  }
};

// ── CLEANUP ───────────────────────────────────────────────────────────────────

const cleanupOldSnapshots = async () => {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await Snapshot.deleteMany({ createdAt: { $lt: cutoff } });
    if (result.deletedCount > 0) {
      console.log(`[Snapshot] Cleaned up ${result.deletedCount} old snapshots`);
    }
  } catch (err) {
    console.error('[Snapshot] Cleanup error:', err.message);
  }
};

// ── ADMIN HEALTH HELPERS (sync — reads from memory cache) ─────────────────────

const getSnapshotCount = () => {
  let total = 0;
  memoryCache.forEach(arr => { total += arr.length; });
  return total;
};

const getProjectCount = () => memoryCache.size;

const getLastSnapshotTime = () => {
  let latest = null;
  memoryCache.forEach(arr => {
    if (arr.length > 0) {
      const t = new Date(arr[arr.length - 1].timestamp || arr[arr.length - 1].ts || 0);
      if (!latest || t > latest) latest = t;
    }
  });
  return latest;
};

// ── BACKWARD-COMPAT: getDiff30Min for reports.js (sync, memory-only) ─────────

const getDiff30Min = (databaseId) => {
  const id    = Number(databaseId);
  const cache = memoryCache.get(id) || [];
  if (cache.length < 2) return null;

  const latest     = cache[cache.length - 1];
  const latestTs   = new Date(latest.timestamp || latest.ts).getTime();
  const targetTime = latestTs - INTERVAL_MS;

  let prev = cache[0];
  for (const snap of cache) {
    const snapTs = new Date(snap.timestamp || snap.ts).getTime();
    const prevTs = new Date(prev.timestamp  || prev.ts).getTime();
    if (Math.abs(snapTs - targetTime) < Math.abs(prevTs - targetTime)) prev = snap;
  }

  if (new Date(prev.timestamp || prev.ts).getTime() === latestTs) return null;

  return (
    (latest.channelProcessedCount || 0) + (latest.dmsProcessedCount || 0) -
    (prev.channelProcessedCount   || 0) - (prev.dmsProcessedCount   || 0)
  );
};

const isProLongedStall = async (databaseId, thresholdMinutes = 240) => {
  const d = await getDiff(databaseId);
  if (!d.isStalled || !d.stalledSince) return false;
  return (Date.now() - new Date(d.stalledSince).getTime()) / 60000 >= thresholdMinutes;
};

module.exports = {
  addSnapshot,
  getDiff,
  getSnapshotAt,
  getAllSnapshots,
  initializeCache,
  cleanupOldSnapshots,
  loadFromDB,
  // Admin health (sync)
  getSnapshotCount,
  getProjectCount,
  getLastSnapshotTime,
  // Backward-compat (sync)
  getDiff30Min,
  isProLongedStall,
};
