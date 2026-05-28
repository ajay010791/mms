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
  console.log(`\n[Metabase] Fetching DB ID: ${databaseId}`);

  if (!sessionToken) await authenticate();

  // Get tables list, retry once on auth failure
  let tables = [];
  try {
    const response = await metabaseRequest('GET', `/api/database/${databaseId}/metadata`);
    tables = response.tables || [];
    console.log(`[Metabase] Tables found:`, tables.map(t => t.name));
  } catch (err) {
    await authenticate();
    const response = await metabaseRequest('GET', `/api/database/${databaseId}/metadata`);
    tables = response.tables || [];
  }

  const findTbl = (names) => {
    const list = Array.isArray(names) ? names : [names];
    return tables.find(t =>
      list.some(n =>
        t.name.toLowerCase() === n.toLowerCase() ||
        t.name.toLowerCase().replace(/[\s_]/g, '') === n.toLowerCase().replace(/[\s_]/g, '')
      )
    ) || null;
  };

  // ── Result object ─────────────────────────────────────────────────────────

  const mkSection = () => ({
    total: 0, completed: 0, processedWithConflict: 0, conflict: 0, inProgress: 0, noMessage: 0,
    processedCount: 0, inProgressCount: 0, notProcessedCount: 0, conflictCount: 0,
  });

  const result = {
    channels:    mkSection(),
    dms:         mkSection(),
    dataQuality: { totalRaw: 0, cloudfuzeSkipped: 0, cloudfuzeUserIds: [] }
  };

  // ── MessageWorkSpace: single table, split by directOrGroupMessage ─────────

  const workspaceTable = findTbl(['MessageWorkSpace', 'Message Work Space', 'messageworkspace']);

  if (!workspaceTable) {
    console.warn(`[Metabase] MessageWorkSpace NOT FOUND in DB ${databaseId}`);
    return result;
  }

  let cols = [], rows = [];
  try {
    const response = await metabaseRequest('POST', '/api/dataset', {
      database:   databaseId,
      type:       'query',
      query:      { 'source-table': workspaceTable.id },
      parameters: []
    });
    cols = response.data?.cols || [];
    rows = response.data?.rows || [];
    console.log(`[Metabase] MessageWorkSpace — ${rows.length} rows, columns (${cols.length}):`, cols.map(c => c.name));
    if (rows.length > 0) {
      console.log(`[Metabase] MessageWorkSpace sample row:`);
      cols.forEach((col, i) => console.log(`  "${col.name}": ${JSON.stringify(rows[0][i])}`));
    }
  } catch (err) {
    console.error(`[Metabase] MessageWorkSpace query FAILED:`, err.message);
    return result;
  }

  // Build column index lookup
  const getIdx = (names) => {
    const list = Array.isArray(names) ? names : [names];
    return cols.findIndex(c => list.some(n => n.toLowerCase() === c.name.toLowerCase()));
  };

  const idxOwnerEmail    = getIdx(['ownerEmailId',        'OwnerEmailId']);
  const idxUserId        = getIdx(['userId',              'UserId']);
  const idxProcessStatus = getIdx(['processStatus',       'ProcessStatus']);
  const idxDirectOrGroup = getIdx(['directOrGroupMessage','DirectOrGroupMessage']);
  const idxProcessed     = getIdx(['processedCount',      'ProcessedCount']);
  const idxInProgress    = getIdx(['inProgressCount',     'InProgressCount']);
  const idxNotProcessed  = getIdx(['notProcessedCount',   'NotProcessedCount']);
  const idxConflict      = getIdx(['conflictCount',       'ConflictCount']);

  console.log(
    `[Metabase] Col indices — ownerEmail:${idxOwnerEmail} userId:${idxUserId} ` +
    `processStatus:${idxProcessStatus} directOrGroup:${idxDirectOrGroup}`
  );
  console.log(
    `[Metabase] Msg col indices — processed:${idxProcessed} inProgress:${idxInProgress} ` +
    `notProcessed:${idxNotProcessed} conflict:${idxConflict}`
  );

  const cloudfuzeUserIds = new Set();
  result.dataQuality.totalRaw = rows.length;

  // ── Diagnostic logging ────────────────────────────────────────────────────

  if (result.dataQuality.totalRaw <= 3 ||
      (result.channels.total + result.dms.total +
       result.dataQuality.cloudfuzeSkipped) < 3) {

    console.log(`[Metabase] RAW ROW DUMP (first 3):`);
    rows.slice(0, 3).forEach((row, i) => {
      console.log(`\n  Row ${i + 1}:`);
      cols.forEach((col, j) => {
        const name = col.name.toLowerCase();
        if (
          name.includes('email') ||
          name.includes('userid') ||
          name.includes('user_id') ||
          name.includes('processstatus') ||
          name.includes('process_status') ||
          name.includes('directorgroup') ||
          name.includes('direct') ||
          name.includes('processed') ||
          name.includes('inprogress') ||
          name.includes('notprocessed') ||
          name.includes('conflict')
        ) {
          console.log(`    "${col.name}": ${JSON.stringify(row[j])}`);
        }
      });
    });
  }

  console.log('\n[Metabase] ALL column indexes found:');
  console.log('  ownerEmailId index:',        idxOwnerEmail);
  console.log('  userId index:',              idxUserId);
  console.log('  processStatus index:',       idxProcessStatus);
  console.log('  directOrGroupMessage index:', idxDirectOrGroup);
  console.log('  processedCount index:',      idxProcessed);
  console.log('  inProgressCount index:',     idxInProgress);
  console.log('  notProcessedCount index:',   idxNotProcessed);
  console.log('  conflictCount index:',       idxConflict);

  if (idxDirectOrGroup === -1) {
    console.warn(
      '[Metabase] ⚠ directOrGroupMessage column NOT FOUND — ' +
      'all rows will go to CHANNELS'
    );
  }
  if (idxProcessed === -1) {
    console.warn(
      '[Metabase] ⚠ processedCount column NOT FOUND — ' +
      'message counts will be 0'
    );
    console.log('[Metabase] Available columns:');
    cols.forEach((col, i) => {
      console.log(`  [${i}] "${col.name}"`);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────

  for (const row of rows) {
    const email = idxOwnerEmail >= 0 ? (row[idxOwnerEmail] || '').toString().toLowerCase().trim() : '';

    if (email.includes('@cloudfuze')) {
      const userId = idxUserId >= 0 ? (row[idxUserId] || '').toString().trim() : '';
      if (userId) {
        cloudfuzeUserIds.add(userId);
        console.log(`[Metabase] @cloudfuze — email:${email} userId:${userId}`);
      }
      result.dataQuality.cloudfuzeSkipped++;
      continue;
    }

    // false = Channels, true = DMS
    const rawDirOrGrp = idxDirectOrGroup >= 0 ? row[idxDirectOrGroup] : null;
    const isDMS = rawDirOrGrp === true || rawDirOrGrp === 1 ||
                  String(rawDirOrGrp).toLowerCase() === 'true';
    const section = isDMS ? result.dms : result.channels;

    const rawStatus = idxProcessStatus >= 0 ? (row[idxProcessStatus] || '').toString().trim().toUpperCase() : '';
    const status    = rawStatus.replace(/[\s_]/g, '');

    if (rawStatus) {
      if      (status === 'PROCESSED')                                       section.completed++;
      else if (status.includes('PROCESSED') && status.includes('CONFLICT')) section.processedWithConflict++;
      else if (status === 'CONFLICT')                                        section.conflict++;
      else if (status === 'INPROGRESS')                                      section.inProgress++;
      else if (status === 'NOMESSAGE')                                       section.noMessage++;
    } else {
      // Fallback to numeric count columns when processStatus is empty
      if      (idxProcessed  >= 0 && Number(row[idxProcessed]  || 0) > 0) section.completed++;
      else if (idxConflict   >= 0 && Number(row[idxConflict]   || 0) > 0) section.conflict++;
      else if (idxInProgress >= 0 && Number(row[idxInProgress] || 0) > 0) section.inProgress++;
      else                                                                  section.noMessage++;
    }

    section.total++;
    if (idxProcessed    >= 0) section.processedCount    += Number(row[idxProcessed]    || 0);
    if (idxInProgress   >= 0) section.inProgressCount   += Number(row[idxInProgress]   || 0);
    if (idxNotProcessed >= 0) section.notProcessedCount += Number(row[idxNotProcessed] || 0);
    if (idxConflict     >= 0) section.conflictCount     += Number(row[idxConflict]     || 0);
  }

  result.dataQuality.cloudfuzeUserIds = [...cloudfuzeUserIds];

  const ProjectConfig = require('../models/ProjectConfig');
  const config = await ProjectConfig.findOne({ metabaseDatabaseId: databaseId }).lean();
  const snapshotStore = require('./snapshotStore');
  await snapshotStore.addSnapshot(databaseId, config?.projectName || '', {
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
  });

  console.log(
    `[Metabase] FINAL SUMMARY DB ${databaseId}:\n` +
    `  Channels — total:${result.channels.total} completed:${result.channels.completed} ` +
      `inProgress:${result.channels.inProgress} conflict:${result.channels.conflict} ` +
      `noMessage:${result.channels.noMessage} ` +
      `processedCount:${result.channels.processedCount} conflictCount:${result.channels.conflictCount}\n` +
    `  DMs      — total:${result.dms.total} completed:${result.dms.completed} ` +
      `inProgress:${result.dms.inProgress} conflict:${result.dms.conflict} ` +
      `noMessage:${result.dms.noMessage} ` +
      `processedCount:${result.dms.processedCount} conflictCount:${result.dms.conflictCount}\n` +
    `  DataQuality — totalRaw:${result.dataQuality.totalRaw} skipped:${result.dataQuality.cloudfuzeSkipped}`
  );
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

module.exports = {
  fetchAllProjects, fetchProjectData,
  getSession, authenticate, getDatabases,
  testConnection, getSessionInfo, getLastFetchDebug,
  resetToken,
  metabaseRequest,
  getToken: () => sessionToken,
};
