const axios = require('axios');
const { getConfig } = require('./configService');

// ─── Session state ─────────────────────────────────────────────────────────────

let sessionToken = null;
let sessionExpiry = null;
let lastConnected = null;
let lastFetchDebug = null;

// ─── Config ────────────────────────────────────────────────────────────────────

async function getMetabaseConfig() {
  const mongoConfig = await getConfig('metabase');
  if (mongoConfig && mongoConfig.url && mongoConfig.username && mongoConfig.password) {
    console.log('[Metabase] Using config from MongoDB');
    return { ...mongoConfig, url: mongoConfig.url.replace(/\/$/, '') };
  }
  console.log('[Metabase] Using config from .env');
  return {
    url: (process.env.METABASE_URL || '').replace(/\/$/, ''),
    username: process.env.METABASE_USERNAME,
    password: process.env.METABASE_PASSWORD
  };
}

// ─── Session management ────────────────────────────────────────────────────────

async function getSession(forceRefresh = false) {
  if (!forceRefresh && sessionToken && sessionExpiry && Date.now() < sessionExpiry) {
    return sessionToken;
  }
  const config = await getMetabaseConfig();
  if (!config.url || !config.username || !config.password) {
    throw new Error(
      `Metabase config missing. URL: ${!!config.url}, ` +
      `Username: ${!!config.username}, Password: ${!!config.password}`
    );
  }
  console.log('[Metabase] Authenticating at:', config.url);
  const response = await axios.post(
    `${config.url}/api/session`,
    { username: config.username, password: config.password },
    { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
  );
  const token = response.data?.id;
  if (!token) {
    throw new Error('Auth response received but no token id: ' + JSON.stringify(response.data));
  }
  sessionToken = token;
  sessionExpiry = Date.now() + 14 * 24 * 60 * 60 * 1000;
  lastConnected = new Date();
  console.log('[Metabase] ✓ Authenticated successfully');
  return sessionToken;
}

async function authenticate() {
  return getSession(true);
}

async function metabaseRequest(method, path, data = null) {
  const config = await getMetabaseConfig();
  const token = await getSession();
  try {
    const response = await axios({
      method,
      url: `${config.url}${path}`,
      headers: { 'X-Metabase-Session': token, 'Content-Type': 'application/json' },
      data
    });
    return response.data;
  } catch (err) {
    if (err.response && err.response.status === 401) {
      const freshToken = await getSession(true);
      const retry = await axios({
        method,
        url: `${config.url}${path}`,
        headers: { 'X-Metabase-Session': freshToken, 'Content-Type': 'application/json' },
        data
      });
      return retry.data;
    }
    throw err;
  }
}

// ─── Raw API helpers ───────────────────────────────────────────────────────────

async function getDatabases() {
  const result = await metabaseRequest('GET', '/api/database');
  return result.data || result;
}

async function getDatabaseTables(databaseId) {
  const result = await metabaseRequest('GET', `/api/database/${databaseId}/metadata`);
  return result.tables || [];
}

async function queryTable(databaseId, tableId, tableName = '', limit = 100000) {
  try {
    const result = await metabaseRequest('POST', '/api/dataset', {
      database: databaseId,
      type: 'query',
      query: { 'source-table': tableId, limit }
    });

    const cols = result.data.cols;
    const rows = result.data.rows;

    console.log(`\n[Metabase] Table: "${tableName || tableId}"`);
    console.log(`[Metabase] Rows: ${rows.length}`);
    console.log(`[Metabase] Columns (${cols.length}):`);
    cols.forEach((col, i) => {
      console.log(`  [${i}] "${col.name}" — type: ${col.base_type}`);
    });

    if (rows.length > 0) {
      console.log(`[Metabase] Sample row 1:`);
      cols.forEach((col, i) => {
        console.log(`  "${col.name}": ${JSON.stringify(rows[0][i])}`);
      });
    }
    if (rows.length > 1) {
      console.log(`[Metabase] Sample row 2:`);
      cols.forEach((col, i) => {
        console.log(`  "${col.name}": ${JSON.stringify(rows[1][i])}`);
      });
    }

    return rows.map(row => {
      const obj = {};
      cols.forEach((col, i) => { obj[col.name] = row[i]; });
      return obj;
    });

  } catch (err) {
    console.error(`[Metabase] queryTable "${tableName || tableId}" FAILED:`, err.message);
    return [];
  }
}

// ─── Name matching helpers ─────────────────────────────────────────────────────

function norm(s) {
  return String(s || '').toLowerCase().replace(/[_\s]/g, '');
}

function findTable(tables, ...candidates) {
  for (const candidate of candidates) {
    const hit = tables.find(t =>
      norm(t.name) === norm(candidate) || norm(t.display_name) === norm(candidate)
    );
    if (hit) return hit;
  }
  for (const candidate of candidates) {
    const hit = tables.find(t =>
      norm(t.name).includes(norm(candidate)) || norm(t.display_name).includes(norm(candidate))
    );
    if (hit) return hit;
  }
  return null;
}

function findColumn(row, ...candidates) {
  if (!row) return null;
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const hit = keys.find(k => norm(k) === norm(candidate));
    if (hit !== undefined) return hit;
  }
  return null;
}

// ─── Column value helper ───────────────────────────────────────────────────────

// Returns the value of the first matching candidate column in a row.
function getCol(row, candidates) {
  if (!row) return null;
  const key = findColumn(row, ...candidates);
  return key !== null ? row[key] : null;
}

// ─── Messaging classification ──────────────────────────────────────────────────

const MSG_KEYWORDS = ['slack', 'google chat', 'teams'];

const CLOUD_MAPPINGS = [
  { keyword: 'google chat', label: 'Google Chat' },
  { keyword: 'slack',       label: 'Slack' },
  { keyword: 'teams',       label: 'Teams' },
];

function isMessagingProject(cloudsRows) {
  for (const row of cloudsRows) {
    for (const val of Object.values(row)) {
      const s = String(val || '').toLowerCase();
      if (MSG_KEYWORDS.some(k => s.includes(k))) return true;
    }
  }
  return false;
}

function extractCloudSource(cloudsRows) {
  for (const row of cloudsRows) {
    for (const val of Object.values(row)) {
      const s = String(val || '').toLowerCase();
      for (const { keyword, label } of CLOUD_MAPPINGS) {
        if (s.includes(keyword)) return label;
      }
    }
  }
  return '';
}

// ─── Table 1: ConversationsFetchingInfo — Picking process per channel ──────────

function processPicking(rows, debugEntry) {
  const total = rows.length;
  let completed = 0, inProgress = 0, conflict = 0;
  const conflictChannels = [];

  if (total === 0) return { total, completed, inProgress, conflict, conflictChannels };

  const sample = rows[0];
  const statusCol    = findColumn(sample, 'ProcessStatus', 'process_status', 'Status', 'status');
  const channelIdCol = findColumn(sample, 'ChannelId', 'channel_id', 'ConversationId', 'conversation_id', 'Id', 'id');
  const channelNameCol = findColumn(sample, 'ChannelName', 'channel_name', 'ConversationName', 'conversation_name', 'Name', 'name');

  if (debugEntry) {
    if (statusCol)      debugEntry.columnsMapped.picking_status      = statusCol;
    if (channelIdCol)   debugEntry.columnsMapped.picking_channelId   = channelIdCol;
    if (channelNameCol) debugEntry.columnsMapped.picking_channelName = channelNameCol;
  }

  for (const row of rows) {
    const rawStatus = statusCol ? String(row[statusCol] || '').trim() : '';
    const normStatus = rawStatus.toLowerCase().replace(/[_\s]/g, '');
    if (normStatus === 'processed') {
      completed++;
    } else if (normStatus === 'inprogress') {
      inProgress++;
    } else if (normStatus === 'conflict') {
      conflict++;
      conflictChannels.push({
        channelId:   channelIdCol   ? row[channelIdCol]   : null,
        channelName: channelNameCol ? String(row[channelNameCol] || `Channel ${conflict}`) : `Channel ${conflict}`
      });
    }
  }

  return { total, completed, inProgress, conflict, conflictChannels };
}

// ─── Table 2: MessageWorkSpace — Moving process per channel ───────────────────

function processWorkspace(rows, debugEntry) {
  const total = rows.length;
  let completed = 0, processedWithConflict = 0, conflict = 0, inProgress = 0, noMessage = 0;

  if (total === 0) return { total, completed, processedWithConflict, conflict, inProgress, noMessage };

  const sample = rows[0];
  const statusCol = findColumn(sample, 'ProcessStatus', 'process_status', 'Status', 'status');

  if (debugEntry && statusCol) debugEntry.columnsMapped.workspace_status = statusCol;

  for (const row of rows) {
    const rawStatus = statusCol ? String(row[statusCol] || '').trim().toUpperCase() : '';
    const normStatus = rawStatus.replace(/[_\s]/g, '');
    if      (normStatus === 'PROCESSED')                 completed++;
    else if (normStatus === 'PROCESSEDWITHSOMECONFLICT') processedWithConflict++;
    else if (normStatus === 'CONFLICT')                  conflict++;
    else if (normStatus === 'INPROGRESS')                inProgress++;
    else if (normStatus === 'NOMESSAGE')                 noMessage++;
  }

  return { total, completed, processedWithConflict, conflict, inProgress, noMessage };
}

// ─── Table 3: MessageEachFile — Message counts (SUM of all rows) ──────────────

function processMessageEachFile(rows, debugEntry) {
  let processed = 0, conflict = 0, repliesNotSynced = 0, notProcessed = 0;

  if (rows.length === 0) return { processed, conflict, repliesNotSynced, notProcessed };

  const sample = rows[0];
  const processedCol    = findColumn(sample, 'Processed', 'PROCESSED', 'ProcessedCount', 'processed_count');
  const conflictCol     = findColumn(sample, 'Conflict', 'CONFLICT', 'ConflictCount', 'conflict_count');
  const repliesCol      = findColumn(sample,
    'RepliesNotSynced', 'replies_not_synced', 'REPLIES_NOT_SYNCED', 'ReplyNotSynced', 'Replies Not Synced');
  const notProcessedCol = findColumn(sample,
    'NotProcessed', 'not_processed', 'NOT_PROCESSED', 'NotProcessedCount', 'not_processed_count', 'Not Processed');

  if (debugEntry) {
    if (processedCol)    debugEntry.columnsMapped.msg_processed        = processedCol;
    if (conflictCol)     debugEntry.columnsMapped.msg_conflict          = conflictCol;
    if (repliesCol)      debugEntry.columnsMapped.msg_repliesNotSynced  = repliesCol;
    if (notProcessedCol) debugEntry.columnsMapped.msg_notProcessed      = notProcessedCol;
  }

  for (const row of rows) {
    if (processedCol)    processed        += Number(row[processedCol])    || 0;
    if (conflictCol)     conflict         += Number(row[conflictCol])     || 0;
    if (repliesCol)      repliesNotSynced += Number(row[repliesCol])      || 0;
    if (notProcessedCol) notProcessed     += Number(row[notProcessedCol]) || 0;
  }

  return { processed, conflict, repliesNotSynced, notProcessed };
}

// ─── Main fetch ────────────────────────────────────────────────────────────────

async function fetchAllProjects() {
  const debugInfo = {
    lastFetchAt: null,
    metabaseUrl: '[configured]',
    sessionTokenPresent: false,
    totalDatabasesFound: 0,
    messagingProjectsFound: 0,
    skippedDatabases: 0,
    perProject: [],
    errors: []
  };

  console.log('[Metabase] Scanning databases for messaging projects...');
  const databases = await getDatabases();
  debugInfo.totalDatabasesFound = databases.length;
  debugInfo.sessionTokenPresent = !!sessionToken;
  console.log(`[Metabase] Found ${databases.length} databases total`);

  const projects = [];

  for (const db of databases) {
    if (db.is_sample || db.name === 'Sample Database') {
      debugInfo.skippedDatabases++;
      continue;
    }

    const debugEntry = {
      name: db.name,
      type: null,
      tablesFound: [],
      tablesMissing: [],
      columnsMapped: {},
      rowCounts: { picking: 0, workspace: 0, messageEachFile: 0 }
    };

    try {
      const tables = await getDatabaseTables(db.id);

      // Identify as messaging project via the Clouds table
      const cloudsTable = findTable(tables, 'Clouds', 'Cloud');
      if (!cloudsTable) {
        debugInfo.skippedDatabases++;
        debugEntry.skippedReason = 'No Clouds table found';
        debugInfo.perProject.push(debugEntry);
        continue;
      }

      const cloudsRows = await queryTable(db.id, cloudsTable.id);
      if (!isMessagingProject(cloudsRows)) {
        debugInfo.skippedDatabases++;
        debugEntry.skippedReason = 'Clouds table has no Slack/Google Chat/Teams entries';
        debugInfo.perProject.push(debugEntry);
        continue;
      }

      const cloudSource = extractCloudSource(cloudsRows);
      debugEntry.type = 'messaging';

      // Locate the 2 data tables
      const workspaceTable = findTable(tables, 'MessageWorkSpace', 'MessageWorkspace');
      const messagesTable  = findTable(tables, 'MessageEachFile');

      const tablesFound   = [];
      const tablesMissing = [];
      if (workspaceTable) tablesFound.push('MessageWorkSpace');
      else                tablesMissing.push('MessageWorkSpace');
      if (messagesTable)  tablesFound.push('MessageEachFile');
      else                tablesMissing.push('MessageEachFile');

      debugEntry.tablesFound   = tablesFound;
      debugEntry.tablesMissing = tablesMissing;

      console.log(`[Metabase] Project: "${db.name}" — Tables found: [${tablesFound.join(', ') || 'none'}]`);

      const workspaceRows = workspaceTable ? await queryTable(db.id, workspaceTable.id) : [];
      const messageRows   = messagesTable  ? await queryTable(db.id, messagesTable.id)  : [];

      debugEntry.rowCounts = {
        workspace: workspaceRows.length,
        messageEachFile: messageRows.length
      };

      console.log(
        `[Metabase] Project: "${db.name}" — ` +
        `Workspace: ${workspaceRows.length} | Messages: ${messageRows.length}`
      );

      const workspace = processWorkspace(workspaceRows, debugEntry);
      const messages  = processMessageEachFile(messageRows, debugEntry);

      debugInfo.perProject.push(debugEntry);
      debugInfo.messagingProjectsFound++;

      projects.push({
        // Identity
        id:               String(db.id),
        project_name:     db.name,
        type:             'messaging',
        cloudBadge:       cloudSource,
        clouds:           cloudSource,
        combination_type: '',
        created_at:       null,

        // Nested canonical data
        workspace,
        messages,

        // Backward-compat flat fields for cronService / snapshotStore / reports
        total_channels:    workspace.total,
        completed:         workspace.completed,
        in_progress:       workspace.inProgress,
        conflict:          workspace.conflict,
        no_message:        workspace.noMessage,
        processed_count:   messages.processed,
        in_progress_count: messages.notProcessed,
        conflict_count:    messages.conflict,
      });

    } catch (err) {
      console.error(`[Metabase] Error processing "${db.name}":`, err.message);
      debugInfo.errors.push({ database: db.name, error: err.message });
      debugInfo.perProject.push(debugEntry);
    }
  }

  debugInfo.lastFetchAt = new Date();
  lastFetchDebug = debugInfo;

  console.log(`[Metabase] Classified ${projects.length} as messaging projects`);
  console.log(
    `[Metabase] Fetch complete — ${projects.length} messaging projects ` +
    `(${debugInfo.skippedDatabases} skipped, ${debugInfo.errors.length} errors)`
  );

  return projects;
}

// ─── Per-database fetch (used by /api/projects/live/:databaseId) ──────────────

async function fetchProjectData(databaseId) {
  console.log(`\n[Metabase] Fetching DB ID: ${databaseId} (native aggregation)`);

  if (!sessionToken) await authenticate();

  // ── 1. Table metadata ─────────────────────────────────────────────────────
  let tables = [];
  try {
    const r = await metabaseRequest('GET', `/api/database/${databaseId}/metadata`);
    tables = r.tables || [];
  } catch (err) {
    await authenticate();
    const r = await metabaseRequest('GET', `/api/database/${databaseId}/metadata`);
    tables = r.tables || [];
  }

  const normS = s => s.toLowerCase().replace(/[\s_]/g, '');
  const workspaceTable = tables.find(t => normS(t.name) === 'messageworkspace');

  const mkSection = () => ({
    total: 0, completed: 0, processedWithConflict: 0, conflict: 0, inProgress: 0,
    noMessage: 0, notProcessed: 0,
    processedCount: 0, inProgressCount: 0, notProcessedCount: 0, conflictCount: 0,
  });

  const ProjectConfigModel = require('../models/ProjectConfig');
  const projConfig   = await ProjectConfigModel.findOne({ metabaseDatabaseId: databaseId }).lean();
  const showDms       = projConfig?.showDms       !== false;
  const showDmToSpace = projConfig?.showDmToSpace === true;

  const result = {
    channels:    mkSection(),
    dms:         mkSection(),
    dmToSpace:   mkSection(),
    dataQuality: { totalRaw: 0, skipped: 0, realRows: 0 },
    config:      { showDms, showDmToSpace, hasDelta: null },
  };

  if (!workspaceTable) {
    console.warn(`[Metabase] MessageWorkSpace NOT FOUND in DB ${databaseId}`);
    return result;
  }

  // ── 2. Detect exact MongoDB field names from table metadata (no extra query)
  const fields = workspaceTable.fields || [];
  const pick = (...candidates) => {
    for (const c of candidates) { const f = fields.find(f => f.name === c);              if (f) return f.name; }
    for (const c of candidates) { const f = fields.find(f => normS(f.name) === normS(c)); if (f) return f.name; }
    return null;
  };

  const colEmail     = pick('ownerEmailId',        'OwnerEmailId');
  const colStatus    = pick('processStatus',        'ProcessStatus',    'Status');
  const colDmFlag    = pick('directOrGroupMessage', 'DirectOrGroupMessage');
  const colDmToSpace = pick('DmToSpace',            'dmToSpace');
  const colDelta     = pick('DeltaMigration',        'deltaMigration');
  const colName      = pick('ChannelName', 'channelName', 'ConversationName', 'SpaceName', 'Name');
  const colProcessed = pick('processedCount',   'ProcessedCount');
  const colInProg    = pick('inProgressCount',  'InProgressCount');
  const colConflict  = pick('conflictCount',    'ConflictCount');
  const colNotProc   = pick('notProcessedCount','NotProcessedCount');

  console.log(`[Metabase] DB ${databaseId} fields:`, { colStatus, colDmFlag, colDmToSpace, colDelta });

  // ── 3. Build + run aggregation pipelines in parallel ─────────────────────
  // One compound $group query replaces 25-50 sequential paginated fetches.
  const emailFilter = colEmail
    ? { [colEmail]: { $not: { $regex: '@cloudfuze', $options: 'i' } } }
    : {};

  const groupId = {};
  if (colStatus)    groupId.status      = `$${colStatus}`;
  if (colDmFlag)    groupId.isDm        = `$${colDmFlag}`;
  if (colDmToSpace) groupId.isDmToSpace = `$${colDmToSpace}`;
  if (colDelta)     groupId.isDelta     = `$${colDelta}`;

  const mainPipeline = [
    { $match: emailFilter },
    { $group: {
      _id:              groupId,
      rowCount:         { $sum: 1 },
      processedCount:   colProcessed ? { $sum: `$${colProcessed}` }  : { $sum: 0 },
      inProgressCount:  colInProg    ? { $sum: `$${colInProg}` }     : { $sum: 0 },
      conflictCount:    colConflict  ? { $sum: `$${colConflict}` }   : { $sum: 0 },
      notProcessedCount: colNotProc  ? { $sum: `$${colNotProc}` }    : { $sum: 0 },
    }},
  ];

  // Data quality: 2 rows (cf vs real)
  const qualPipeline = colEmail ? [
    { $group: {
      _id:   { $cond: [{ $regexMatch: { input: `$${colEmail}`, regex: '@cloudfuze', options: 'i' } }, 'cf', 'real'] },
      count: { $sum: 1 },
    }},
  ] : [{ $count: 'total' }];

  const [mainRes, qualRes] = await Promise.all([
    metabaseRequest('POST', '/api/dataset', {
      database: databaseId, type: 'native',
      native: { query: JSON.stringify(mainPipeline), collection: workspaceTable.name },
    }).catch(err => { console.error('[Metabase] Main agg failed:', err.message); return null; }),

    metabaseRequest('POST', '/api/dataset', {
      database: databaseId, type: 'native',
      native: { query: JSON.stringify(qualPipeline), collection: workspaceTable.name },
    }).catch(() => null),
  ]);

  if (!mainRes) return result;

  const mainCols = mainRes.data?.cols || [];
  const mainRows = mainRes.data?.rows || [];
  console.log(`[Metabase] Aggregation: ${mainRows.length} groups`);

  const colMap = {};
  mainCols.forEach((c, i) => {
    colMap[(c.name || c.display_name || '').toLowerCase().replace(/[\s._-]/g, '')] = i;
  });
  const iId       = colMap['_id']               ?? 0;
  const iRowCount = colMap['rowcount']           ?? 1;
  const iProcCnt  = colMap['processedcount']     ?? 2;
  const iInProg   = colMap['inprogresscount']    ?? 3;
  const iConfCnt  = colMap['conflictcount']      ?? 4;
  const iNotProc  = colMap['notprocessedcount']  ?? 5;

  // Data quality from parallel result
  if (qualRes?.data?.rows) {
    const qCols = qualRes.data.cols || [];
    const qMap  = {};
    qCols.forEach((c, i) => { qMap[(c.name || '').toLowerCase()] = i; });
    const qIdI  = qMap['_id']   ?? 0;
    const qCntI = qMap['count'] ?? 1;
    qualRes.data.rows.forEach(r => {
      const label = String(r[qIdI] ?? '');
      const count = Number(r[qCntI] || 0);
      result.dataQuality.totalRaw += count;
      if (label === 'cf')   result.dataQuality.skipped  += count;
      if (label === 'real') result.dataQuality.realRows += count;
    });
  }

  // ── 4. Process aggregated groups ──────────────────────────────────────────
  const isTrue  = v => v === true  || v === 1 || (typeof v === 'string' && (v.toLowerCase() === 'true'  || v === '1'));
  const isFalse = v => v === false || v === 0 || (typeof v === 'string' && (v.toLowerCase() === 'false' || v === '0'));

  const classifyStatus = s => {
    const u = (s ?? '').toString().toUpperCase().trim();
    if (u === 'PROCESSED')                                                                  return 'completed';
    if (u === 'IN PROGRESS' || u === 'IN_PROGRESS')                                        return 'inProgress';
    if (u === 'CONFLICT')                                                                   return 'conflict';
    if (u === 'NO MESSAGE'    || u === 'NO_MESSAGE')                                        return 'noMessage';
    if (u === 'NOT PROCESSED' || u === 'NOT_PROCESSED')                                     return 'notProcessed';
    if (u === 'PROCESSED WITH SOME CONFLICT' || u === 'PROCESSED_WITH_SOME_CONFLICT')      return 'processedWithConflict';
    return null;
  };

  const deltaAcc = {
    onetime: { ch: mkSection(), dms: mkSection() },
    delta:   { ch: mkSection(), dms: mkSection() },
  };
  const hasDeltaCol = colDelta !== null;
  let hasDeltaRows  = false;

  mainRows.forEach(row => {
    const id      = row[iId] ?? {};
    const status  = typeof id === 'object' ? (id.status     ?? '') : id;
    const isDm    = typeof id === 'object' ? id.isDm        : null;
    const isDmTs  = typeof id === 'object' ? id.isDmToSpace : null;
    const isDelta = typeof id === 'object' ? id.isDelta     : null;

    const rowCount = Number(row[iRowCount] || 0);
    const pCnt     = Number(row[iProcCnt]  || 0);
    const ipCnt    = Number(row[iInProg]   || 0);
    const cCnt     = Number(row[iConfCnt]  || 0);
    const npCnt    = Number(row[iNotProc]  || 0);
    const statKey  = classifyStatus(status);

    if (isTrue(isDmTs)) return; // DmToSpace handled separately below

    const isChannel = isFalse(isDm) || (!colDmFlag);
    const isDmRow   = isTrue(isDm);
    if (isDmRow && !showDms) return;

    const sec = isChannel ? result.channels : (isDmRow ? result.dms : null);
    if (!sec) return;

    sec.total += rowCount;
    if (statKey) sec[statKey] += rowCount;
    sec.processedCount    += pCnt;
    sec.inProgressCount   += ipCnt;
    sec.conflictCount     += cCnt;
    sec.notProcessedCount += npCnt;

    if (hasDeltaCol) {
      let bucket = null;
      if (isFalse(isDelta)) bucket = 'onetime';
      if (isTrue(isDelta))  { bucket = 'delta'; hasDeltaRows = true; }
      if (bucket) {
        const acc = isChannel ? deltaAcc[bucket].ch : deltaAcc[bucket].dms;
        acc.total += rowCount;
        if (statKey) acc[statKey] += rowCount;
        acc.processedCount    += pCnt;
        acc.inProgressCount   += ipCnt;
        acc.conflictCount     += cCnt;
        acc.notProcessedCount += npCnt;
      }
    }
  });

  // ── 5. Delta breakdown ────────────────────────────────────────────────────
  if (hasDeltaCol) {
    const toSec = acc => acc.total > 0 ? { ...acc, rowCount: acc.total } : null;

    result.channels.hasDelta = result.channels.total > 0 ? deltaAcc.delta.ch.total > 0 : null;
    result.channels.oneTime  = result.channels.total > 0 ? toSec(deltaAcc.onetime.ch)  : null;
    result.channels.delta    = result.channels.total > 0 ? toSec(deltaAcc.delta.ch)    : null;

    result.dms.hasDelta = result.dms.total > 0 ? deltaAcc.delta.dms.total > 0 : null;
    result.dms.oneTime  = result.dms.total > 0 ? toSec(deltaAcc.onetime.dms) : null;
    result.dms.delta    = result.dms.total > 0 ? toSec(deltaAcc.delta.dms)   : null;

    result.dmToSpace.hasDelta = null;
    result.dmToSpace.oneTime  = null;
    result.dmToSpace.delta    = null;

    // Multiple initiations — one small aggregation for one-time channels
    if (result.channels.oneTime && colName && colDmFlag && colDelta) {
      try {
        const miPipeline = [
          { $match: { ...emailFilter, [colDmFlag]: { $in: [false, 0] }, [colDelta]: { $in: [false, 0] } } },
          { $group: { _id: `$${colName}`, count: { $sum: 1 } } },
          { $match:  { count: { $gt: 1 } } },
          { $sort:   { count: -1 } },
        ];
        const miRes  = await metabaseRequest('POST', '/api/dataset', {
          database: databaseId, type: 'native',
          native: { query: JSON.stringify(miPipeline), collection: workspaceTable.name },
        });
        const miCols = miRes.data?.cols || [];
        const miRows = miRes.data?.rows || [];
        const miMap  = {};
        miCols.forEach((c, i) => { miMap[(c.name || '').toLowerCase()] = i; });
        result.channels.oneTime.multipleInitiations = miRows
          .map(r => ({ name: String(r[miMap['_id'] ?? 0] ?? ''), count: Number(r[miMap['count'] ?? 1] || 0) }))
          .filter(r => r.name);
      } catch (e) {
        console.warn('[Metabase] Multiple initiations query failed:', e.message);
        result.channels.oneTime.multipleInitiations = [];
      }
    }
  } else {
    result.channels.hasDelta  = null; result.channels.oneTime  = null; result.channels.delta  = null;
    result.dms.hasDelta       = null; result.dms.oneTime       = null; result.dms.delta       = null;
    result.dmToSpace.hasDelta = null; result.dmToSpace.oneTime = null; result.dmToSpace.delta = null;
  }
  result.config.hasDelta = null;

  // ── 6. DmToSpace — keep existing native queries (already fast) ────────────
  let dmToSpaceConflictChannels = [];

  if (showDmToSpace) {
    try {
      const aggPipeline = [
        { $match: { dmToSpace: true, ownerEmailId: { $not: { $regex: '@cloudfuze', $options: 'i' } } } },
        { $group: {
          _id:              '$processStatus',
          workspaceCount:   { $sum: 1 },
          processedMsgs:    { $sum: '$processedCount' },
          inProgressMsgs:   { $sum: '$inProgressCount' },
          conflictMsgs:     { $sum: '$conflictCount' },
          notProcessedMsgs: { $sum: '$notProcessedCount' },
        }},
      ];
      const aggRes  = await metabaseRequest('POST', '/api/dataset', {
        database: databaseId, type: 'native',
        native: { query: JSON.stringify(aggPipeline), collection: workspaceTable.name },
      });
      const aggCols = aggRes.data?.cols || [];
      const aggRows = aggRes.data?.rows || [];
      const aggMap  = {};
      aggCols.forEach((c, i) => { aggMap[(c.name || c.display_name || '').toLowerCase()] = i; });

      const idAgg       = aggMap['_id']              ?? 0;
      const wsCount     = aggMap['workspacecount']   ?? 1;
      const procMsgs    = aggMap['processedmsgs']    ?? 2;
      const inProgMsgs  = aggMap['inprogressmsgs']   ?? 3;
      const confMsgs    = aggMap['conflictmsgs']     ?? 4;
      const notProcMsgs = aggMap['notprocessedmsgs'] ?? 5;

      aggRows.forEach(r => {
        const status = String(r[idAgg] ?? '').toUpperCase().replace(/[\s-]+/g, '_').trim();
        const wc = Number(r[wsCount]     || 0);
        const pm = Number(r[procMsgs]    || 0);
        const im = Number(r[inProgMsgs]  || 0);
        const cm = Number(r[confMsgs]    || 0);
        const nm = Number(r[notProcMsgs] || 0);

        result.dmToSpace.total             += wc;
        result.dmToSpace.processedCount    += pm;
        result.dmToSpace.inProgressCount   += im;
        result.dmToSpace.conflictCount     += cm;
        result.dmToSpace.notProcessedCount += nm;

        if      (status === 'PROCESSED')              result.dmToSpace.completed             += wc;
        else if (status === 'IN_PROGRESS')            result.dmToSpace.inProgress            += wc;
        else if (status === 'CONFLICT')               result.dmToSpace.conflict              += wc;
        else if (status === 'NO_MESSAGE')             result.dmToSpace.noMessage             += wc;
        else if (status === 'NOT_PROCESSED')          result.dmToSpace.noMessage             += wc;
        else if (status.startsWith('PROCESSED_WITH')) result.dmToSpace.processedWithConflict += wc;
        else                                          result.dmToSpace.noMessage             += wc;
      });

      if (result.dmToSpace.conflict > 0 || result.dmToSpace.processedWithConflict > 0) {
        try {
          const conflictPipeline = [
            { $match: { dmToSpace: true, conflictCount: { $gt: 0 }, ownerEmailId: { $not: { $regex: '@cloudfuze', $options: 'i' } } } },
            { $project: { channelName: 1, workSpaceName: 1, ownerEmailId: 1 } },
          ];
          const confRes  = await metabaseRequest('POST', '/api/dataset', {
            database: databaseId, type: 'native',
            native: { query: JSON.stringify(conflictPipeline), collection: workspaceTable.name },
          });
          const confCols = confRes.data?.cols || [];
          const confRows = confRes.data?.rows || [];
          const confMap  = {};
          confCols.forEach((c, i) => { confMap[(c.name || c.display_name || '').toLowerCase()] = i; });
          const nameIdx = confMap['channelname'] ?? confMap['workspacename'] ?? confMap['owneremailid'] ?? 0;
          dmToSpaceConflictChannels = confRows.map(r => String(r[nameIdx] ?? '')).filter(Boolean);
        } catch (e) {
          console.warn('[Metabase] DmToSpace conflict channels query failed:', e.message);
        }
      }
    } catch (err) {
      console.error('[Metabase] DmToSpace native query failed:', err.message);
    }
  }

  result.dmToSpace.conflictChannels = dmToSpaceConflictChannels;

  // ── 7. Save snapshot ──────────────────────────────────────────────────────
  const snapshotStore = require('./snapshotStore');
  await snapshotStore.addSnapshot(databaseId, projConfig?.projectName || '', {
    channelTotal:                result.channels.total,
    channelCompleted:            result.channels.completed,
    channelInProgress:           result.channels.inProgress,
    channelConflict:             result.channels.conflict,
    channelNoMessage:            result.channels.noMessage,
    channelProcessedWithConflict: result.channels.processedWithConflict,
    channelProcessedCount:       result.channels.processedCount,
    channelInProgressCount:      result.channels.inProgressCount,
    channelConflictCount:        result.channels.conflictCount,
    channelNotProcessedCount:    result.channels.notProcessedCount,
    dmsTotal:                    result.dms.total,
    dmsCompleted:                result.dms.completed,
    dmsInProgress:               result.dms.inProgress,
    dmsConflict:                 result.dms.conflict,
    dmsNoMessage:                result.dms.noMessage,
    dmsProcessedCount:           result.dms.processedCount,
    dmsInProgressCount:          result.dms.inProgressCount,
    dmsConflictCount:            result.dms.conflictCount,
    dmsNotProcessedCount:        result.dms.notProcessedCount,
    dmToSpaceTotal:                 result.dmToSpace.total,
    dmToSpaceCompleted:             result.dmToSpace.completed,
    dmToSpaceInProgress:            result.dmToSpace.inProgress,
    dmToSpaceConflict:              result.dmToSpace.conflict,
    dmToSpaceNoMessage:             result.dmToSpace.noMessage,
    dmToSpaceProcessedWithConflict: result.dmToSpace.processedWithConflict,
    dmToSpaceProcessedCount:        result.dmToSpace.processedCount,
    dmToSpaceInProgressCount:       result.dmToSpace.inProgressCount,
    dmToSpaceConflictCount:         result.dmToSpace.conflictCount,
    dmToSpaceNotProcessedCount:     result.dmToSpace.notProcessedCount,
  });

  console.log(`[Metabase] Done — ch:${result.channels.total} dms:${result.dms.total} dmts:${result.dmToSpace.total}`);
  return result;
}

// ─── Status helpers ────────────────────────────────────────────────────────────

function getSessionInfo() {
  return {
    token: sessionToken ? '***' + sessionToken.slice(-6) : null,
    lastConnected,
    expiresAt: sessionExpiry ? new Date(sessionExpiry) : null
  };
}

function getLastFetchDebug() {
  return lastFetchDebug;
}

async function testConnection() {
  await getSession(true);
  const dbs = await getDatabases();
  return { success: true, databases: dbs.length, lastConnected };
}

function resetToken() {
  sessionToken = null;
  sessionExpiry = null;
}

// ─── Conflict errors — native MongoDB queries, filter+project pushed to DB ─────

// Shared helper: resolve MessageWorkSpace table + exact MongoDB field names
// from metadata only (zero extra queries).
async function _getConflictMeta(databaseId) {
  const meta   = await metabaseRequest('GET', `/api/database/${databaseId}/metadata`);
  const tables = meta.tables || [];
  const norm   = s => s.toLowerCase().replace(/[\s_]/g, '');

  const table = tables.find(t => norm(t.name) === 'messageworkspace');
  if (!table) return null;

  const fields = table.fields || [];
  const pick   = (...candidates) => {
    for (const c of candidates) {
      const f = fields.find(f => f.name === c);
      if (f) return f.name;
    }
    for (const c of candidates) {
      const f = fields.find(f => norm(f.name) === norm(c));
      if (f) return f.name;
    }
    return null;
  };

  return {
    table,
    colStatus : pick('processStatus', 'ProcessStatus', 'Status'),
    colEmail  : pick('ownerEmailId',  'OwnerEmailId',  'email'),
    colName   : pick('ChannelName', 'channelName', 'ConversationName', 'SpaceName', 'WorkSpaceName', 'Name'),
    colWsId   : pick('ID', 'Id', 'id', 'WorkSpaceId', 'workSpaceId', 'ChannelId', 'channelId', 'ConversationId'),
    colError  : pick('ErrorDescription', 'errorDescription', 'ErrorDesc', 'error_description'),
    colDmFlag : pick('directOrGroupMessage', 'DirectOrGroupMessage'),
  };
}

// Tooltip: top 3 conflict errors via server-side $group — returns 3 rows max.
async function fetchConflictTopErrors(databaseId) {
  const meta = await _getConflictMeta(databaseId);
  if (!meta) return { tableFound: false, topErrors: [] };

  const { table, colStatus, colEmail, colError } = meta;
  if (!colStatus || !colError) return { tableFound: true, topErrors: [] };

  const match = {
    [colStatus]: 'CONFLICT',
    [colError]:  { $exists: true, $nin: [null, ''] },
  };
  if (colEmail) match[colEmail] = { $not: { $regex: '@cloudfuze', $options: 'i' } };

  const pipeline = [
    { $match: match },
    { $group: { _id: `$${colError}`, count: { $sum: 1 } } },
    { $sort:  { count: -1 } },
    { $limit: 3 },
  ];

  const res  = await metabaseRequest('POST', '/api/dataset', {
    database: databaseId, type: 'native',
    native: { query: JSON.stringify(pipeline), collection: table.name },
  });

  const cols = res.data?.cols || [];
  const rows = res.data?.rows || [];
  const iId    = cols.findIndex(c => (c.name || '').toLowerCase() === '_id');
  const iCount = cols.findIndex(c => (c.name || '').toLowerCase() === 'count');

  const topErrors = rows
    .map(r => ({
      error: String(r[iId    >= 0 ? iId    : 0] ?? '').trim(),
      count: Number(r[iCount >= 0 ? iCount : 1] ?? 0),
    }))
    .filter(e => e.error);

  console.log(`[ConflictTopErrors] DB ${databaseId} → ${topErrors.length} top errors`);
  return { tableFound: true, topErrors };
}

// Detail page: all conflict rows, only needed fields, $match+$project in MongoDB.
async function fetchConflictDetails(databaseId) {
  const meta = await _getConflictMeta(databaseId);
  if (!meta) return { tableFound: false, details: [], total: 0 };

  const { table, colStatus, colEmail, colName, colWsId, colError, colDmFlag } = meta;

  const match = {};
  if (colStatus) match[colStatus] = 'CONFLICT';
  if (colEmail)  match[colEmail]  = { $not: { $regex: '@cloudfuze', $options: 'i' } };

  const project = { _id: 0 };
  if (colName)   project[colName]   = 1;
  if (colWsId)   project[colWsId]   = 1;
  if (colError)  project[colError]  = 1;
  if (colDmFlag) project[colDmFlag] = 1;

  const pipeline = [
    { $match:   match   },
    { $project: project },
  ];

  const res  = await metabaseRequest('POST', '/api/dataset', {
    database: databaseId, type: 'native',
    native: { query: JSON.stringify(pipeline), collection: table.name },
  });

  const resCols = res.data?.cols || [];
  const resRows = res.data?.rows || [];

  const norm   = s => s.toLowerCase().replace(/[\s_]/g, '');
  const colIdx = {};
  resCols.forEach((c, i) => { colIdx[norm(c.name || c.display_name || '')] = i; });
  const gi = name => name ? (colIdx[norm(name)] ?? -1) : -1;

  const iName  = gi(colName);
  const iWsId  = gi(colWsId);
  const iError = gi(colError);
  const iDm    = gi(colDmFlag);

  const details = resRows.map(row => ({
    channelName: iName  >= 0 ? String(row[iName]  ?? '') : '',
    wsId:        iWsId  >= 0 ? String(row[iWsId]  ?? '') : '',
    error:       iError >= 0 ? String(row[iError] ?? '').trim() : '',
    isDm:        iDm    >= 0 ? row[iDm]                        : null,
  }));

  console.log(`[ConflictDetails] DB ${databaseId} → ${details.length} conflict rows`);
  return { tableFound: true, details, total: details.length };
}

// Top N conflict rows split by channels / DMs — used in email alerts.
// Fast: two parallel $match + $project + $limit queries.
async function fetchTopConflictRows(databaseId, limitEach = 5) {
  const meta = await _getConflictMeta(databaseId);
  if (!meta) return { channels: [], dms: [] };

  const { table, colStatus, colEmail, colName, colWsId, colError, colDmFlag } = meta;

  const baseMatch = {};
  if (colStatus) baseMatch[colStatus] = 'CONFLICT';
  if (colEmail)  baseMatch[colEmail]  = { $not: { $regex: '@cloudfuze', $options: 'i' } };

  const project = { _id: 0 };
  if (colName)   project[colName]   = 1;
  if (colWsId)   project[colWsId]   = 1;
  if (colError)  project[colError]  = 1;

  const chMatch  = colDmFlag ? { ...baseMatch, [colDmFlag]: { $in: [false, 0] } } : baseMatch;
  const dmsMatch = colDmFlag ? { ...baseMatch, [colDmFlag]: { $in: [true,  1] } } : null;

  const runQuery = async (match) => {
    const res = await metabaseRequest('POST', '/api/dataset', {
      database: databaseId, type: 'native',
      native: { query: JSON.stringify([{ $match: match }, { $project: project }, { $limit: limitEach }]), collection: table.name },
    });
    const cols = res.data?.cols || [];
    const rows = res.data?.rows || [];
    const norm = s => s.toLowerCase().replace(/[\s_]/g, '');
    const idx  = {};
    cols.forEach((c, i) => { idx[norm(c.name || c.display_name || '')] = i; });
    const gi = name => name ? (idx[norm(name)] ?? -1) : -1;
    const iN = gi(colName); const iW = gi(colWsId); const iE = gi(colError);
    return rows.map(r => ({
      channelName: iN >= 0 ? String(r[iN] ?? '') : '',
      wsId:        iW >= 0 ? String(r[iW] ?? '') : '',
      error:       iE >= 0 ? String(r[iE] ?? '').trim() : '',
    }));
  };

  const [channels, dms] = await Promise.all([
    runQuery(chMatch).catch(() => []),
    dmsMatch ? runQuery(dmsMatch).catch(() => []) : Promise.resolve([]),
  ]);

  return { channels, dms };
}

module.exports = {
  fetchAllProjects, fetchProjectData,
  fetchConflictTopErrors, fetchConflictDetails, fetchTopConflictRows,
  getSession, authenticate, getDatabases,
  testConnection, getSessionInfo, getLastFetchDebug,
  resetToken,
  metabaseRequest,
  getToken: () => sessionToken,
};
