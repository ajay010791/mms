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

  // Load project config flags before processing
  const ProjectConfigModel = require('../models/ProjectConfig');
  const projConfig   = await ProjectConfigModel.findOne({ metabaseDatabaseId: databaseId }).lean();
  const showDms       = projConfig?.showDms       !== false; // default true
  const showDmToSpace = projConfig?.showDmToSpace === true;  // default false

  console.log(
    `[Metabase] DB ${databaseId} config →`,
    projConfig
      ? `found | showDms=${projConfig.showDms} showDmToSpace=${projConfig.showDmToSpace}`
      : 'NO ProjectConfig document found for this DB ID'
  );

  const result = {
    channels:    mkSection(),
    dms:         mkSection(),
    dmToSpace:   mkSection(),
    dataQuality: { totalRaw: 0, skipped: 0, realRows: 0 },
    config:      { showDms, showDmToSpace }
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
      query:      { 'source-table': workspaceTable.id, limit: 1000000 },
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
  // Exact match only — prevents getIdx accidentally matching an unrelated column
  const idxDmToSpace     = cols.findIndex(c => c.name === 'DmToSpace' || c.name === 'dmToSpace');
  const idxChannelName   = getIdx(['ChannelName',         'channelName',   'ConversationName', 'SpaceName', 'Name', 'channel_name', 'conversation_name']);
  const idxProcessed     = getIdx(['processedCount',      'ProcessedCount']);
  const idxInProgress    = getIdx(['inProgressCount',     'InProgressCount']);
  const idxNotProcessed  = getIdx(['notProcessedCount',   'NotProcessedCount']);
  const idxConflict      = getIdx(['conflictCount',       'ConflictCount']);

  console.log(
    `[Metabase] Col indices — ownerEmail:${idxOwnerEmail} userId:${idxUserId} ` +
    `processStatus:${idxProcessStatus} directOrGroup:${idxDirectOrGroup} dmToSpace:${idxDmToSpace}`
  );
  console.log(`[Metabase] Config flags — showDms:${showDms} showDmToSpace:${showDmToSpace}`);
  console.log(
    `[Metabase] Msg col indices — processed:${idxProcessed} inProgress:${idxInProgress} ` +
    `notProcessed:${idxNotProcessed} conflict:${idxConflict}`
  );

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

  // Convert raw indexed rows to named-property objects
  const allRows = rows.map(row => ({
    ownerEmailId:         idxOwnerEmail    >= 0 ? String(row[idxOwnerEmail]    ?? '') : '',
    userId:               idxUserId        >= 0 ? String(row[idxUserId]        ?? '') : '',
    processStatus:        idxProcessStatus >= 0 ? String(row[idxProcessStatus] ?? '') : '',
    directOrGroupMessage: idxDirectOrGroup >= 0 ? row[idxDirectOrGroup] : null,
    dmToSpace:            idxDmToSpace     >= 0 ? row[idxDmToSpace]     : null,
    channelName:          idxChannelName   >= 0 ? String(row[idxChannelName] ?? '') : '',
    processedCount:       idxProcessed     >= 0 ? row[idxProcessed]     : 0,
    inProgressCount:      idxInProgress    >= 0 ? row[idxInProgress]    : 0,
    notProcessedCount:    idxNotProcessed  >= 0 ? row[idxNotProcessed]  : 0,
    conflictCount:        idxConflict      >= 0 ? row[idxConflict]      : 0,
  }));

  // ── DB 303 owner-email diagnostic ────────────────────────────────────────
  if (String(databaseId) === '303') {
    console.log(`[Metabase] DB ${databaseId} owner emails:`);
    const ownerEmails = [...new Set(
      allRows.map(r => r.ownerEmailId).filter(Boolean)
    )];
    ownerEmails.forEach(email => {
      const isCloudfuze = email.toLowerCase().includes('@cloudfuze');
      console.log(`  ${isCloudfuze ? '❌ SKIP' : '✅ KEEP'} ${email}`);
    });
  }

  // ── STEP 2: Filter out @cloudfuze rows ONLY ──────────────────────────────
  const realRows = allRows.filter(row => {
    const email = (row.ownerEmailId || '').toLowerCase();
    return !email.includes('@cloudfuze');
  });

  console.log(`[Metabase] DB ${databaseId}:`);
  console.log(`  Total rows:     ${allRows.length}`);
  console.log(`  Skipped (@cloudfuze): ${allRows.length - realRows.length}`);
  console.log(`  Real rows:      ${realRows.length}`);

  // ── STEP 3: Split into channels vs DMS vs DmToSpace ─────────────────────
  const isTrue  = v => v === true  || v === 1 || (typeof v === 'string' && (v.toLowerCase() === 'true'  || v === '1'));
  const isFalse = v => v === false || v === 0 || (typeof v === 'string' && (v.toLowerCase() === 'false' || v === '0'));

  const channelRows = realRows.filter(row => isFalse(row.directOrGroupMessage));

  // Respect showDms flag — if false, skip all DM rows
  const dmsRows = showDms
    ? realRows.filter(row => isTrue(row.directOrGroupMessage))
    : [];

  console.log(`  Channel rows:    ${channelRows.length}`);
  console.log(`  DMS rows:        ${dmsRows.length} (showDms=${showDms})`);
  console.log(`  DmToSpace:       will query separately via native query (showDmToSpace=${showDmToSpace})`);

  // ── STEP 4: Count statuses from channel rows ──────────────────────────────
  let channelTotal                 = channelRows.length;
  let channelCompleted             = 0;
  let channelInProgress            = 0;
  let channelConflict              = 0;
  let channelNoMessage             = 0;
  let channelProcessedWithConflict = 0;
  let channelProcessedCount        = 0;
  let channelInProgressCount       = 0;
  let channelConflictCount         = 0;
  let channelNotProcessedCount     = 0;

  channelRows.forEach(row => {
    const status = (row.processStatus || '').toString().toUpperCase().trim();

    if (status === 'PROCESSED') {
      channelCompleted++;
    } else if (status === 'IN PROGRESS' || status === 'IN_PROGRESS') {
      channelInProgress++;
    } else if (status === 'CONFLICT') {
      channelConflict++;
    } else if (status === 'NO MESSAGE' || status === 'NO_MESSAGE') {
      channelNoMessage++;
    } else if (
      status === 'PROCESSED WITH SOME CONFLICT' ||
      status === 'PROCESSED_WITH_SOME_CONFLICT'
    ) {
      channelProcessedWithConflict++;
    } else {
      channelNoMessage++;
    }

    channelProcessedCount    += Number(row.processedCount    || 0);
    channelInProgressCount   += Number(row.inProgressCount   || 0);
    channelConflictCount     += Number(row.conflictCount     || 0);
    channelNotProcessedCount += Number(row.notProcessedCount || 0);
  });

  // ── STEP 5: Count statuses from DMS rows ──────────────────────────────────
  let dmsTotal                 = dmsRows.length;
  let dmsCompleted             = 0;
  let dmsInProgress            = 0;
  let dmsConflict              = 0;
  let dmsNoMessage             = 0;
  let dmsProcessedWithConflict = 0;
  let dmsProcessedCount        = 0;
  let dmsInProgressCount       = 0;
  let dmsConflictCount         = 0;
  let dmsNotProcessedCount     = 0;

  dmsRows.forEach(row => {
    const status = (row.processStatus || '').toString().toUpperCase().trim();

    if (status === 'PROCESSED') {
      dmsCompleted++;
    } else if (status === 'IN PROGRESS' || status === 'IN_PROGRESS') {
      dmsInProgress++;
    } else if (status === 'CONFLICT') {
      dmsConflict++;
    } else if (status === 'NO MESSAGE' || status === 'NO_MESSAGE') {
      dmsNoMessage++;
    } else if (
      status === 'PROCESSED WITH SOME CONFLICT' ||
      status === 'PROCESSED_WITH_SOME_CONFLICT'
    ) {
      dmsProcessedWithConflict++;
    } else {
      dmsNoMessage++;
    }

    dmsProcessedCount    += Number(row.processedCount    || 0);
    dmsInProgressCount   += Number(row.inProgressCount   || 0);
    dmsConflictCount     += Number(row.conflictCount     || 0);
    dmsNotProcessedCount += Number(row.notProcessedCount || 0);
  });

  // ── STEP 6: DmToSpace — separate native query to bypass Metabase row cap ──
  let dmToSpaceTotal                 = 0;
  let dmToSpaceCompleted             = 0;
  let dmToSpaceInProgress            = 0;
  let dmToSpaceConflict              = 0;
  let dmToSpaceNoMessage             = 0;
  let dmToSpaceProcessedWithConflict = 0;
  let dmToSpaceProcessedCount        = 0;
  let dmToSpaceInProgressCount       = 0;
  let dmToSpaceConflictCount         = 0;
  let dmToSpaceNotProcessedCount     = 0;
  let dmToSpaceConflictChannels      = [];

  if (showDmToSpace && workspaceTable) {
    try {
      // ── Query 1: aggregate by processStatus — avoids all column-detection issues ──
      const aggPipeline = [
        { $match: { dmToSpace: true, ownerEmailId: { $not: { $regex: '@cloudfuze', $options: 'i' } } } },
        { $group: {
          _id:              '$processStatus',
          workspaceCount:   { $sum: 1 },
          processedMsgs:    { $sum: '$processedCount' },
          inProgressMsgs:   { $sum: '$inProgressCount' },
          conflictMsgs:     { $sum: '$conflictCount' },
          notProcessedMsgs: { $sum: '$notProcessedCount' }
        }}
      ];

      const aggRes  = await metabaseRequest('POST', '/api/dataset', {
        database: databaseId,
        type:     'native',
        native:   { query: JSON.stringify(aggPipeline), collection: workspaceTable.name }
      });

      const aggCols = aggRes.data?.cols || [];
      const aggRows = aggRes.data?.rows || [];
      console.log(`[Metabase] DmToSpace aggregation — ${aggRows.length} status groups`);

      // Build a col-name → index map for the aggregation result
      const aggMap = {};
      aggCols.forEach((c, i) => {
        const key = (c.name || c.display_name || '').toLowerCase();
        if (key) aggMap[key] = i;
      });
      console.log(`[Metabase] DmToSpace agg cols:`, Object.keys(aggMap));

      const idAgg       = aggMap['_id']              ?? 0;
      const wsCount     = aggMap['workspacecount']   ?? aggMap['workspaceCount']   ?? 1;
      const procMsgs    = aggMap['processedmsgs']    ?? aggMap['processedMsgs']    ?? 2;
      const inProgMsgs  = aggMap['inprogressmsgs']   ?? aggMap['inProgressMsgs']   ?? 3;
      const confMsgs    = aggMap['conflictmsgs']     ?? aggMap['conflictMsgs']     ?? 4;
      const notProcMsgs = aggMap['notprocessedmsgs'] ?? aggMap['notProcessedMsgs'] ?? 5;

      aggRows.forEach(r => {
        const status = String(r[idAgg] ?? '').toUpperCase().replace(/[\s-]+/g, '_').trim();
        const wc     = Number(r[wsCount]     || 0);
        const pm     = Number(r[procMsgs]    || 0);
        const im     = Number(r[inProgMsgs]  || 0);
        const cm     = Number(r[confMsgs]    || 0);
        const nm     = Number(r[notProcMsgs] || 0);

        dmToSpaceTotal        += wc;
        dmToSpaceProcessedCount    += pm;
        dmToSpaceInProgressCount   += im;
        dmToSpaceConflictCount     += cm;
        dmToSpaceNotProcessedCount += nm;

        if      (status === 'PROCESSED')              dmToSpaceCompleted             += wc;
        else if (status === 'IN_PROGRESS')            dmToSpaceInProgress            += wc;
        else if (status === 'CONFLICT')               dmToSpaceConflict              += wc;
        else if (status === 'NO_MESSAGE')             dmToSpaceNoMessage             += wc;
        else if (status === 'NOT_PROCESSED')          dmToSpaceNoMessage             += wc;
        else if (status.startsWith('PROCESSED_WITH')) dmToSpaceProcessedWithConflict += wc;
        else                                          dmToSpaceNoMessage             += wc;
      });

      console.log(`[Metabase] DmToSpace workspace — total:${dmToSpaceTotal} completed:${dmToSpaceCompleted} inProgress:${dmToSpaceInProgress} conflict:${dmToSpaceConflict} procWithConflict:${dmToSpaceProcessedWithConflict} noMessage:${dmToSpaceNoMessage}`);
      console.log(`[Metabase] DmToSpace messages  — processed:${dmToSpaceProcessedCount} inProgress:${dmToSpaceInProgressCount} conflict:${dmToSpaceConflictCount} notProcessed:${dmToSpaceNotProcessedCount}`);

      // ── Query 2: channel names for conflict rows (tooltip) ────────────────────
      if (dmToSpaceConflict > 0 || dmToSpaceProcessedWithConflict > 0) {
        try {
          const conflictPipeline = [
            { $match: { dmToSpace: true, conflictCount: { $gt: 0 }, ownerEmailId: { $not: { $regex: '@cloudfuze', $options: 'i' } } } },
            { $project: { channelName: 1, workSpaceName: 1, ownerEmailId: 1 } }
          ];
          const confRes  = await metabaseRequest('POST', '/api/dataset', {
            database: databaseId,
            type:     'native',
            native:   { query: JSON.stringify(conflictPipeline), collection: workspaceTable.name }
          });
          const confCols = confRes.data?.cols || [];
          const confRows = confRes.data?.rows || [];
          const confMap  = {};
          confCols.forEach((c, i) => { confMap[(c.name || c.display_name || '').toLowerCase()] = i; });
          const nameIdx  = confMap['channelname'] ?? confMap['workspacename'] ?? confMap['owneremailid'] ?? 0;
          dmToSpaceConflictChannels = confRows
            .map(r => String(r[nameIdx] ?? ''))
            .filter(Boolean);
          console.log(`[Metabase] DmToSpace conflict channels: ${dmToSpaceConflictChannels.length}`);
        } catch (e) {
          console.warn('[Metabase] DmToSpace conflict channels query failed:', e.message);
        }
      }
    } catch (err) {
      console.error('[Metabase] DmToSpace native query failed:', err.message);
    }
  }

  // ── STEP 7: Assign computed values to result ──────────────────────────────
  result.channels.total                 = channelTotal;
  result.channels.completed             = channelCompleted;
  result.channels.inProgress            = channelInProgress;
  result.channels.conflict              = channelConflict;
  result.channels.noMessage             = channelNoMessage;
  result.channels.processedWithConflict = channelProcessedWithConflict;
  result.channels.processedCount        = channelProcessedCount;
  result.channels.inProgressCount       = channelInProgressCount;
  result.channels.conflictCount         = channelConflictCount;
  result.channels.notProcessedCount     = channelNotProcessedCount;

  result.dms.total                      = dmsTotal;
  result.dms.completed                  = dmsCompleted;
  result.dms.inProgress                 = dmsInProgress;
  result.dms.conflict                   = dmsConflict;
  result.dms.noMessage                  = dmsNoMessage;
  result.dms.processedWithConflict      = dmsProcessedWithConflict;
  result.dms.processedCount             = dmsProcessedCount;
  result.dms.inProgressCount            = dmsInProgressCount;
  result.dms.conflictCount              = dmsConflictCount;
  result.dms.notProcessedCount          = dmsNotProcessedCount;

  result.dmToSpace.total                 = dmToSpaceTotal;
  result.dmToSpace.completed             = dmToSpaceCompleted;
  result.dmToSpace.inProgress            = dmToSpaceInProgress;
  result.dmToSpace.conflict              = dmToSpaceConflict;
  result.dmToSpace.noMessage             = dmToSpaceNoMessage;
  result.dmToSpace.processedWithConflict = dmToSpaceProcessedWithConflict;
  result.dmToSpace.processedCount        = dmToSpaceProcessedCount;
  result.dmToSpace.inProgressCount       = dmToSpaceInProgressCount;
  result.dmToSpace.conflictCount         = dmToSpaceConflictCount;
  result.dmToSpace.notProcessedCount     = dmToSpaceNotProcessedCount;
  result.dmToSpace.conflictChannels      = dmToSpaceConflictChannels;

  result.dataQuality.totalRaw = allRows.length;
  result.dataQuality.skipped  = allRows.length - realRows.length;
  result.dataQuality.realRows = realRows.length;

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

  console.log('\n[Metabase] FINAL RESULT:');
  console.log(
    `  Channels — total:${channelTotal} ` +
    `completed:${channelCompleted} ` +
    `inProgress:${channelInProgress} ` +
    `conflict:${channelConflict} ` +
    `noMessage:${channelNoMessage}`
  );
  console.log(
    `  DMs — total:${dmsTotal} ` +
    `completed:${dmsCompleted} ` +
    `inProgress:${dmsInProgress} ` +
    `conflict:${dmsConflict}`
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
