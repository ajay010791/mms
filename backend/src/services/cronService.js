const cron          = require('node-cron');
const ProjectConfig = require('../models/ProjectConfig');
const metabase      = require('./metabase');
const snapshotStore = require('./snapshotStore');
const emailService  = require('./emailService');
const teamsService  = require('./teamsService');

// Alert cooldown tracker — prevent repeated alerts
const lastAlertSent = new Map();

// ── LOAD ALERT RULES FROM MONGODB ────────────────────────────────────────────

const getAlertRules = async () => {
  try {
    const mongoose = require('mongoose');
    const db = mongoose.connection.db;
    const doc = await db.collection('systemconfigs').findOne({ key: 'alertRules' });

    if (doc?.data) {
      const d = doc.data;
      return {
        stallIntervalMinutes: Number(d.stallIntervalMinutes || 30),
        dataRefreshIntervalMinutes: Number(d.dataRefreshIntervalMinutes || d.stallIntervalMinutes || 30),
        // Cooldown in HOURS (support both old minutes and new hours schema)
        cooldownHours: Number(
          d.cooldownHours ||
          (d.cooldownMinutes ? d.cooldownMinutes / 60 : 2)
        ),
        // Conflict threshold in HOURS
        conflictThresholdHours: Number(
          d.conflictThresholdHours ||
          (d.conflictThresholdMinutes ? d.conflictThresholdMinutes / 60 : 1)
        ),
        enableEmailAlerts: d.enableEmailAlerts !== false,
        enableTeamsAlerts: d.enableTeamsAlerts !== false
      };
    }
  } catch (e) {
    console.error('[Cron] getAlertRules error:', e.message);
  }

  console.warn('[Cron] No alert rules in MongoDB — using safe defaults');
  return {
    stallIntervalMinutes:       30,
    dataRefreshIntervalMinutes: 30,
    cooldownHours:               2,
    conflictThresholdHours:      1,
    enableEmailAlerts:           true,
    enableTeamsAlerts:           true
  };
};

// ── BUILD CRON EXPRESSION FROM MINUTES ───────────────────────────────────────

const buildCronExpression = (intervalMinutes) => {
  const mins = Number(intervalMinutes);

  console.log(`[Cron] Building expression for ${mins} minutes`);

  if (mins <= 1)   return '* * * * *';
  if (mins === 2)  return '*/2 * * * *';
  if (mins === 3)  return '*/3 * * * *';
  if (mins === 5)  return '*/5 * * * *';
  if (mins === 10) return '*/10 * * * *';
  if (mins === 15) return '*/15 * * * *';
  if (mins === 20) return '*/20 * * * *';
  if (mins === 30) return '*/30 * * * *';
  if (mins === 60) return '0 * * * *';

  if (60 % mins === 0) return `*/${mins} * * * *`;

  // Build explicit minute list for irregular intervals
  const times = [];
  for (let i = 0; i < 60; i += mins) times.push(Math.floor(i));
  return `${times.join(',')} * * * *`;
};

// ── MAIN CRON CHECK ──────────────────────────────────────────────────────────

const checkProjects = async () => {
  const rules = await getAlertRules();

  console.log('\n[Cron] ══════════════════════════════════');
  console.log(`[Cron] Check at: ${new Date().toLocaleString()}`);
  console.log('[Cron] Settings:', {
    checkEvery:       `${rules.dataRefreshIntervalMinutes} min`,
    stallCooldown:    `${rules.cooldownHours} hrs`,
    conflictCooldown: `${rules.conflictThresholdHours} hrs`,
    emailEnabled:     rules.enableEmailAlerts,
    teamsEnabled:     rules.enableTeamsAlerts
  });

  if (!rules.enableEmailAlerts && !rules.enableTeamsAlerts) {
    console.log('[Cron] All alerts disabled — skipping');
    return;
  }

  const STALL_COOLDOWN_MS    = rules.cooldownHours          * 60 * 60 * 1000;
  const CONFLICT_COOLDOWN_MS = rules.conflictThresholdHours * 60 * 60 * 1000;

  let projects = [];
  try {
    projects = await ProjectConfig.find({ status: { $nin: ['inactive', 'on_hold'] } });
    console.log(`[Cron] Checking ${projects.length} project(s)`);
  } catch (err) {
    console.error('[Cron] Load projects error:', err.message);
    return;
  }

  for (const project of projects) {
    try {
      console.log(`\n[Cron] → ${project.projectName}`);

      const data = await metabase.fetchProjectData(project.metabaseDatabaseId);
      const diff = await snapshotStore.getDiff(project.metabaseDatabaseId);

      console.log('[Cron] Snapshot diff:', {
        hasEnoughData: diff.hasEnoughData,
        isStalled:     diff.isStalled,
        channelDiff:   diff.channelDiff,
        dmsDiff:       diff.dmsDiff,
        snapshotAge:   diff.snapshotAge ? `${diff.snapshotAge} min` : 'N/A',
        message:       diff.message
      });

      // ── PER-SECTION ALERT FLAGS ──────────────────────────────────────────────
      const sAlertCh  = project.alertChannels  !== false;
      const sAlertDms = project.alertDms       !== false;
      const sAlertDmt = project.alertDmToSpace !== false;

      // Build list of diffs for sections that are alert-enabled AND have data
      const enabledDiffs = [
        ...(sAlertCh  && (data.channels?.total  || 0) > 0 ? [diff.channelDiff   ?? 0] : []),
        ...(sAlertDms && (data.dms?.total       || 0) > 0 ? [diff.dmsDiff       ?? 0] : []),
        ...(sAlertDmt && (data.dmToSpace?.total || 0) > 0 ? [diff.dmToSpaceDiff ?? 0] : []),
      ];
      // Effective stall: all alert-enabled sections with data have stopped progressing
      const effectiveStall = diff.hasEnoughData &&
        enabledDiffs.length > 0 &&
        enabledDiffs.every(d => d === 0);

      // ── STALL CHECK (section-aware) ──────────────────────────────────────────
      if (effectiveStall) {
        const key      = `${project.metabaseDatabaseId}-stall`;
        const lastSent = lastAlertSent.get(key) || 0;
        const elapsed  = Date.now() - lastSent;

        console.log('[Cron] Stall check:', {
          isStalled:   true,
          lastSent:    lastSent ? new Date(lastSent).toLocaleString() : 'never',
          elapsedMin:  Math.round(elapsed / 60000),
          cooldownMin: Math.round(STALL_COOLDOWN_MS / 60000),
          canSend:     lastSent === 0 || elapsed > STALL_COOLDOWN_MS
        });

        const canSend = lastSent === 0 || elapsed > STALL_COOLDOWN_MS;
        if (canSend) {
          console.log('[Cron] → SENDING STALL ALERT...');
          try {
            const sent = await sendStallAlert(project, diff, data);
            if (sent) {
              lastAlertSent.set(key, Date.now());
              console.log(`[Cron] ✓ Alert sent and cooldown set. Next in ${Math.round(STALL_COOLDOWN_MS / 60000)} min`);
            } else {
              console.error('[Cron] ✗ Alert returned false — NOT setting cooldown so it retries next check');
            }
          } catch (err) {
            console.error('[Cron] ✗ Alert threw error:', err.message);
            console.error('[Cron] NOT setting cooldown — will retry');
          }
        } else {
          const remaining = STALL_COOLDOWN_MS - elapsed;
          console.log(`[Cron] ⏸ Alert suppressed — cooldown: ${Math.round(remaining / 60000)} min remaining`);
        }
      } else if (!diff.hasEnoughData) {
        console.log(`[Cron] ℹ Not enough snapshots yet — need 2+ snapshots (${diff.message})`);
      } else {
        console.log(`[Cron] ✅ Active — channel +${diff.channelDiff || 0} dms +${diff.dmsDiff || 0}`);
      }

      // ── CONFLICT CHECK (section-aware) ───────────────────────────────────────
      const totalConflicts =
        (sAlertCh  ? (data.channels?.conflict  || 0) : 0) +
        (sAlertDms ? (data.dms?.conflict        || 0) : 0) +
        (sAlertDmt ? (data.dmToSpace?.conflict  || 0) : 0);

      if (totalConflicts > 0) {
        const key      = `${project.metabaseDatabaseId}-conflict`;
        const lastSent = lastAlertSent.get(key) || 0;
        const elapsed  = Date.now() - lastSent;

        const canSend = lastSent === 0 || elapsed > CONFLICT_COOLDOWN_MS;
        if (canSend) {
          console.log(`[Cron] → SENDING CONFLICT ALERT — ${totalConflicts} conflicts`);
          try {
            const sent = await sendConflictAlert(project, data);
            if (sent) {
              lastAlertSent.set(key, Date.now());
              console.log('[Cron] ✓ Conflict alert sent and cooldown set');
            } else {
              console.error('[Cron] ✗ Conflict alert failed — NOT setting cooldown, will retry');
            }
          } catch (err) {
            console.error('[Cron] ✗ Conflict error:', err.message);
          }
        } else {
          const remaining = CONFLICT_COOLDOWN_MS - elapsed;
          console.log(`[Cron] Conflict alert suppressed — ${Math.round(remaining / 60000)} min remaining`);
        }
      }

      await new Promise(r => setTimeout(r, 500));

    } catch (err) {
      console.error(`[Cron] Error for ${project.projectName}:`, err.message);
    }
  }

  console.log('\n[Cron] ✓ Check complete');
  console.log('[Cron] ══════════════════════════════════\n');
};

// ── PAYLOAD BUILDERS ─────────────────────────────────────────────────────────

// ── Helpers ───────────────────────────────────────────────────────────────────

const trimAtCRI = s => {
  if (!s) return '';
  const idx = s.toLowerCase().indexOf('client-request-id');
  return idx >= 0 ? s.slice(0, idx).trim().replace(/[,;:\s]+$/, '') : s;
};

const buildConflictRowsHtml = (conflictRows) => {
  if (!conflictRows || (!conflictRows.channels?.length && !conflictRows.dms?.length)) return '';

  const tableHtml = rows => `
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin:4px 0 10px 0;">
      <thead>
        <tr style="background:#f9fafb;border-bottom:1px solid #e5e7eb;">
          <th style="padding:5px 8px;text-align:left;color:#555555;font-weight:600;font-size:10px;width:28%;">Channel Name</th>
          <th style="padding:5px 8px;text-align:left;color:#555555;font-weight:600;font-size:10px;width:22%;">WS ID</th>
          <th style="padding:5px 8px;text-align:left;color:#555555;font-weight:600;font-size:10px;width:50%;">Error Description</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr style="border-bottom:0.5px solid #f3f4f6;">
            <td style="padding:5px 8px;color:#111111;font-size:11px;">${r.channelName || '&mdash;'}</td>
            <td style="padding:5px 8px;color:#374151;font-family:monospace;font-size:10px;">${r.wsId || '&mdash;'}</td>
            <td style="padding:5px 8px;color:#DC2626;font-size:11px;">${trimAtCRI(r.error) || '&mdash;'}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  let html = '<hr style="border:0;border-top:1px solid #e5e7eb;margin:14px 0;">';
  html += '<span style="font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:0.06em;color:#0129ac;padding:10px 0 4px 0;border-bottom:2px solid #0129ac;margin-bottom:10px;display:block;">Conflict Details (Top 5)</span>';
  if (conflictRows.channels?.length) {
    html += '<span style="font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:0.04em;color:#555;padding:8px 0 4px 0;display:block;">&#128226; Channel Conflicts</span>';
    html += tableHtml(conflictRows.channels);
  }
  if (conflictRows.dms?.length) {
    html += '<span style="font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:0.04em;color:#555;padding:8px 0 4px 0;display:block;">&#128172; DMS Conflicts</span>';
    html += tableHtml(conflictRows.dms);
  }
  return html;
};

const buildMultiInitHtml = (data) => {
  const rows = data.channels?.oneTime?.multipleInitiations;
  if (!rows || rows.length === 0) return '';

  return `
    <hr style="border:0;border-top:1px solid #e5e7eb;margin:14px 0;">
    <span style="font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:0.06em;color:#D97706;padding:10px 0 4px 0;border-bottom:2px solid #D97706;margin-bottom:10px;display:block;">
      &#9888; Duplicate One-Time Channel Initiations (${rows.length})
    </span>
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin:4px 0 10px 0;">
      <thead>
        <tr style="background:#FFFBEB;border-bottom:1px solid #FDE68A;">
          <th style="padding:5px 8px;text-align:left;color:#92400E;font-weight:600;font-size:10px;width:75%;">Channel Name</th>
          <th style="padding:5px 8px;text-align:center;color:#92400E;font-weight:600;font-size:10px;width:25%;">Initiated</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr style="border-bottom:0.5px solid #FEF3C7;">
            <td style="padding:5px 8px;color:#111111;font-size:11px;">${r.name || '&mdash;'}</td>
            <td style="padding:5px 8px;text-align:center;font-weight:700;color:#D97706;font-size:12px;">&times;${r.count}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
};

// ── Migration mode pill(s) for HTML emails ────────────────────────────────────
const migrationModeHtml = (data) => {
  const hasDelta = data.channels?.hasDelta;
  const hasOT    = (data.channels?.oneTime?.rowCount || 0) > 0;
  const hasDT    = (data.channels?.delta?.rowCount   || 0) > 0;
  const OT = '<span style="background:#EDE9FE;color:#5B21B6;padding:2px 9px;border-radius:10px;font-size:11px;font-weight:bold;font-family:Arial,sans-serif;">1&times; One-Time</span>';
  const DT = '<span style="background:#CCFBF1;color:#0F766E;padding:2px 9px;border-radius:10px;font-size:11px;font-weight:bold;font-family:Arial,sans-serif;">&#x1F504; Delta</span>';
  if (hasDelta === null || hasDelta === undefined) return '&mdash;';
  if (hasOT && hasDT) return `${OT} &nbsp;+&nbsp; ${DT}`;
  if (hasDT)  return DT;
  return OT;
};

const buildStallTextBody = (project, diff, data) => `
Migration Stall Alert
═══════════════════════════════════════════════

PROJECT INFO
  Project:      ${project.projectName}
  Migration:    ${project.source} → ${project.destination}
  Type:         ${project.migrationType}
  Alert time:   ${new Date().toLocaleString()}
  Stalled for:  ${diff.stalledDuration || '?'} minutes ⚠️

CHANNEL STATUS
  Total:         ${data.channels.total           || 0}
  Completed:     ${data.channels.completed       || 0}
  In Progress:   ${data.channels.inProgress      || 0}
  Conflict:      ${data.channels.conflict        || 0}
  Proc w/Conflict: ${data.channels.processedWithConflict || 0}
  No Message:    ${data.channels.noMessage       || 0}
  Not Processed: ${data.channels.notProcessed    || 0}

CHANNEL MESSAGE COUNT
  Processed:     ${(data.channels.processedCount    || 0).toLocaleString()} ⚠️ No change vs ${diff.snapshotAge || 30} min ago
  Previous:      ${(diff.channelPrevious             || 0).toLocaleString()}
  In Progress:   ${(data.channels.inProgressCount   || 0).toLocaleString()}
  Conflict:      ${(data.channels.conflictCount     || 0).toLocaleString()}
  Not Processed: ${(data.channels.notProcessedCount || 0).toLocaleString()}

DMS STATUS
  Total:         ${data.dms.total           || 0}
  Completed:     ${data.dms.completed       || 0}
  In Progress:   ${data.dms.inProgress      || 0}
  Conflict:      ${data.dms.conflict        || 0}
  Proc w/Conflict: ${data.dms.processedWithConflict || 0}
  No Message:    ${data.dms.noMessage       || 0}
  Not Processed: ${data.dms.notProcessed    || 0}

DMS MESSAGE COUNT
  Processed:     ${(data.dms.processedCount    || 0).toLocaleString()} ⚠️ No change vs ${diff.snapshotAge || 30} min ago
  Previous:      ${(diff.dmsPrevious             || 0).toLocaleString()}
  In Progress:   ${(data.dms.inProgressCount   || 0).toLocaleString()}
  Conflict:      ${(data.dms.conflictCount     || 0).toLocaleString()}
  Not Processed: ${(data.dms.notProcessedCount || 0).toLocaleString()}

Please investigate the migration pipeline immediately.
This alert repeats every 2 hours if issue persists.
`.trim();

const buildConflictTextBody = (project, data) => {
  const total = (data.channels.conflict || 0) + (data.dms.conflict || 0);
  return `
Migration Conflict Alert — URGENT
═══════════════════════════════════════════════

PROJECT INFO
  Project:         ${project.projectName}
  Migration:       ${project.source} → ${project.destination}
  Alert time:      ${new Date().toLocaleString()}
  Total conflicts: ${total} 🔴

CHANNEL STATUS
  Total:         ${data.channels.total                || 0}
  Completed:     ${data.channels.completed            || 0}
  In Progress:   ${data.channels.inProgress           || 0}
  Conflict:      ${data.channels.conflict             || 0} 🔴
  Proc w/Conflict: ${data.channels.processedWithConflict || 0}
  No Message:    ${data.channels.noMessage            || 0}
  Not Processed: ${data.channels.notProcessed         || 0}

CHANNEL MESSAGE COUNT
  Processed:     ${(data.channels.processedCount    || 0).toLocaleString()}
  In Progress:   ${(data.channels.inProgressCount   || 0).toLocaleString()}
  Conflict:      ${(data.channels.conflictCount     || 0).toLocaleString()} 🔴
  Not Processed: ${(data.channels.notProcessedCount || 0).toLocaleString()}

DMS STATUS
  Total:         ${data.dms.total                || 0}
  Completed:     ${data.dms.completed            || 0}
  In Progress:   ${data.dms.inProgress           || 0}
  Conflict:      ${data.dms.conflict             || 0} 🔴
  Proc w/Conflict: ${data.dms.processedWithConflict || 0}
  No Message:    ${data.dms.noMessage            || 0}
  Not Processed: ${data.dms.notProcessed         || 0}

DMS MESSAGE COUNT
  Processed:     ${(data.dms.processedCount    || 0).toLocaleString()}
  In Progress:   ${(data.dms.inProgressCount   || 0).toLocaleString()}
  Conflict:      ${(data.dms.conflictCount     || 0).toLocaleString()} 🔴
  Not Processed: ${(data.dms.notProcessedCount || 0).toLocaleString()}

Please resolve conflicts immediately.
This alert repeats every 1 hour if conflicts persist.
`.trim();
};

const buildStallHtmlBody = (project, diff, data, conflictRows = null) => `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width">
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  body, table, td { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #111111; margin: 0; padding: 0; border-collapse: collapse; }
  .wrapper     { width: 100%; background: #f4f6f9; padding: 16px 0; }
  .container   { width: 620px; max-width: 620px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; }
  .header      { background: #0129ac; padding: 22px 24px; }
  .header h2   { color: #ffffff; font-size: 20px; margin: 0 0 5px 0; font-family: Arial, Helvetica, sans-serif; }
  .header p    { color: rgba(255,255,255,0.80); font-size: 11px; margin: 0; font-family: Arial, Helvetica, sans-serif; }
  .body-cell   { padding: 20px 24px; background: #ffffff; }
  .section-title     { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.06em; color: #0129ac; padding: 14px 0 4px 0; border-bottom: 2px solid #0129ac; margin-bottom: 10px; display: block; }
  .section-title-dms { color: #111111; border-bottom-color: #111111; }
  .section-title-sub { font-size: 9px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.04em; color: #555555; padding: 8px 0 4px 0; display: block; }
  .data-table        { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 6px; }
  .data-table td     { padding: 5px 0; font-family: Arial, Helvetica, sans-serif; font-size: 12px; border-bottom: 1px solid #f3f4f6; }
  .data-table .label { color: #555555; width: 58%; }
  .data-table .value { font-weight: bold; text-align: right; color: #111111; }
  .stat-table  { width: 100%; border-collapse: collapse; margin: 6px 0 10px 0; }
  .stat-table td { width: 14%; text-align: center; padding: 8px 2px; font-family: Arial, Helvetica, sans-serif; }
  .stat-num    { font-size: 17px; font-weight: bold; display: block; margin-bottom: 3px; font-family: Arial, Helvetica, sans-serif; }
  .stat-label  { font-size: 7px; display: block; text-transform: uppercase; letter-spacing: 0.03em; font-weight: bold; font-family: Arial, Helvetica, sans-serif; }
  .nochg  { font-size: 9px; background: #FEF3C7; color: #92400E; padding: 1px 6px; border-radius: 8px; font-family: Arial, Helvetica, sans-serif; }
  .divider { border: 0; border-top: 1px solid #e5e7eb; margin: 14px 0; }
  .alert-box { background: #FEF3C7; border-left: 4px solid #D97706; padding: 12px 16px; margin-top: 16px; font-size: 11px; color: #92400E; font-family: Arial, Helvetica, sans-serif; }
  .footer-cell { background: #f9fafb; padding: 12px 24px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #888888; text-align: center; font-family: Arial, Helvetica, sans-serif; }
</style>
</head>
<body>
<div class="wrapper">
<table class="container" cellpadding="0" cellspacing="0" align="center">

  <tr>
    <td class="header">
      <h2>&#9203; Migration Stalled</h2>
      <p>${project.projectName} &mdash; ${project.source} &rarr; ${project.destination} &nbsp;|&nbsp; ${new Date().toLocaleString()}</p>
    </td>
  </tr>

  <tr>
    <td class="body-cell">

      <span class="section-title">Project Info</span>
      <table class="data-table">
        <tr><td class="label">Project</td><td class="value">${project.projectName}</td></tr>
        <tr><td class="label">Migration</td><td class="value">${project.source} &rarr; ${project.destination}</td></tr>
        <tr><td class="label">Migration Type</td><td class="value">${project.migrationType || '—'}</td></tr>
        <tr><td class="label">Migration Mode</td><td class="value" style="text-align:right;">${migrationModeHtml(data)}</td></tr>
        <tr><td class="label">Alert Time</td><td class="value">${new Date().toLocaleString()}</td></tr>
        <tr><td class="label">Stalled For</td><td class="value" style="color:#D97706;">&#9203; ${diff.stalledDuration || '?'} minutes — NO PROGRESS</td></tr>
      </table>

      <hr class="divider">

      <!-- CHANNELS -->
      <span class="section-title">&#128226; Channel Migration</span>
      <span class="section-title-sub">Workspace Status</span>
      <table class="stat-table" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background:#EFF6FF;border:1px solid #BFDBFE;"><span class="stat-num" style="color:#1D4ED8;">${data.channels?.total || 0}</span><span class="stat-label" style="color:#1D4ED8;">Total</span></td>
          <td style="background:#F0FDF4;border:1px solid #BBF7D0;"><span class="stat-num" style="color:#16A34A;">&#10003; ${data.channels?.completed || 0}</span><span class="stat-label" style="color:#16A34A;">Completed</span></td>
          <td style="background:#FFFBEB;border:1px solid #FDE68A;"><span class="stat-num" style="color:#D97706;">&#9203; ${data.channels?.inProgress || 0}</span><span class="stat-label" style="color:#D97706;">In Progress</span></td>
          <td style="background:#FEF2F2;border:1px solid #FECACA;"><span class="stat-num" style="color:#DC2626;">&#9888; ${data.channels?.conflict || 0}</span><span class="stat-label" style="color:#DC2626;">Conflict</span></td>
          <td style="background:#FFFBEB;border:1px solid #FDE68A;"><span class="stat-num" style="color:#D97706;">${data.channels?.processedWithConflict || 0}</span><span class="stat-label" style="color:#D97706;">Proc w/Conflict</span></td>
          <td style="background:#F9FAFB;border:1px solid #E5E7EB;"><span class="stat-num" style="color:#6B7280;">${data.channels?.noMessage || 0}</span><span class="stat-label" style="color:#6B7280;">No Message</span></td>
          <td style="background:#F9FAFB;border:1px solid #E5E7EB;"><span class="stat-num" style="color:#6B7280;">${data.channels?.notProcessed || 0}</span><span class="stat-label" style="color:#6B7280;">Not Processed</span></td>
        </tr>
      </table>

      <span class="section-title-sub">Message Count</span>
      <table class="data-table">
        <tr>
          <td class="label">Processed Messages</td>
          <td class="value" style="color:#16A34A;">${(diff.channelCurrent || 0).toLocaleString()} &nbsp;<span class="nochg">&#9203; No change vs ${diff.snapshotAge || 30} min ago</span></td>
        </tr>
        <tr><td class="label">Previous (${diff.snapshotAge || 30} min ago)</td><td class="value">${(diff.channelPrevious || 0).toLocaleString()}</td></tr>
        <tr><td class="label">In Progress Messages</td><td class="value" style="color:#D97706;">${(data.channels?.inProgressCount || 0).toLocaleString()}</td></tr>
        <tr><td class="label">Conflict Messages</td><td class="value" style="color:#DC2626;">${(data.channels?.conflictCount || 0).toLocaleString()}</td></tr>
        <tr><td class="label">Not Processed Messages</td><td class="value" style="color:#6B7280;">${(data.channels?.notProcessedCount || 0).toLocaleString()}</td></tr>
      </table>

      <hr class="divider">

      <!-- DMS -->
      <span class="section-title section-title-dms">&#128172; DMS Migration</span>
      <span class="section-title-sub">Workspace Status</span>
      <table class="stat-table" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background:#EFF6FF;border:1px solid #BFDBFE;"><span class="stat-num" style="color:#1D4ED8;">${data.dms?.total || 0}</span><span class="stat-label" style="color:#1D4ED8;">Total</span></td>
          <td style="background:#F0FDF4;border:1px solid #BBF7D0;"><span class="stat-num" style="color:#16A34A;">&#10003; ${data.dms?.completed || 0}</span><span class="stat-label" style="color:#16A34A;">Completed</span></td>
          <td style="background:#FFFBEB;border:1px solid #FDE68A;"><span class="stat-num" style="color:#D97706;">&#9203; ${data.dms?.inProgress || 0}</span><span class="stat-label" style="color:#D97706;">In Progress</span></td>
          <td style="background:#FEF2F2;border:1px solid #FECACA;"><span class="stat-num" style="color:#DC2626;">&#9888; ${data.dms?.conflict || 0}</span><span class="stat-label" style="color:#DC2626;">Conflict</span></td>
          <td style="background:#FFFBEB;border:1px solid #FDE68A;"><span class="stat-num" style="color:#D97706;">${data.dms?.processedWithConflict || 0}</span><span class="stat-label" style="color:#D97706;">Proc w/Conflict</span></td>
          <td style="background:#F9FAFB;border:1px solid #E5E7EB;"><span class="stat-num" style="color:#6B7280;">${data.dms?.noMessage || 0}</span><span class="stat-label" style="color:#6B7280;">No Message</span></td>
          <td style="background:#F9FAFB;border:1px solid #E5E7EB;"><span class="stat-num" style="color:#6B7280;">${data.dms?.notProcessed || 0}</span><span class="stat-label" style="color:#6B7280;">Not Processed</span></td>
        </tr>
      </table>

      <span class="section-title-sub">Message Count</span>
      <table class="data-table">
        <tr>
          <td class="label">Processed Messages</td>
          <td class="value" style="color:#16A34A;">${(diff.dmsCurrent || 0).toLocaleString()} &nbsp;<span class="nochg">&#9203; No change vs ${diff.snapshotAge || 30} min ago</span></td>
        </tr>
        <tr><td class="label">Previous (${diff.snapshotAge || 30} min ago)</td><td class="value">${(diff.dmsPrevious || 0).toLocaleString()}</td></tr>
        <tr><td class="label">In Progress Messages</td><td class="value" style="color:#D97706;">${(data.dms?.inProgressCount || 0).toLocaleString()}</td></tr>
        <tr><td class="label">Conflict Messages</td><td class="value" style="color:#DC2626;">${(data.dms?.conflictCount || 0).toLocaleString()}</td></tr>
        <tr><td class="label">Not Processed Messages</td><td class="value" style="color:#6B7280;">${(data.dms?.notProcessedCount || 0).toLocaleString()}</td></tr>
      </table>

      ${buildConflictRowsHtml(conflictRows)}
      ${buildMultiInitHtml(data)}

      <div class="alert-box">
        <strong>&#9888; Action Required:</strong> Please investigate the migration pipeline immediately.<br>
        This alert repeats every 2 hour(s) if the issue persists.
      </div>

    </td>
  </tr>

  <tr>
    <td class="footer-cell">
      Migration Monitor &mdash; CloudFuze &nbsp;|&nbsp; Do not reply to this email &nbsp;|&nbsp; ${new Date().toLocaleString()}
    </td>
  </tr>

</table>
</div>
</body>
</html>`;

const buildConflictHtmlBody = (project, data, conflictRows = null) => {
  const total = (data.channels?.conflict || 0) + (data.dms?.conflict || 0);
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width">
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  body, table, td { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #111111; margin: 0; padding: 0; border-collapse: collapse; }
  .wrapper     { width: 100%; background: #f4f6f9; padding: 16px 0; }
  .container   { width: 620px; max-width: 620px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; }
  .header      { background: #0129ac; padding: 22px 24px; }
  .header h2   { color: #ffffff; font-size: 20px; margin: 0 0 5px 0; font-family: Arial, Helvetica, sans-serif; letter-spacing: -0.3px; }
  .header p    { color: rgba(255,255,255,0.80); font-size: 11px; margin: 0; font-family: Arial, Helvetica, sans-serif; }
  .body-cell   { padding: 20px 24px; background: #ffffff; }
  .section-title     { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.06em; color: #0129ac; padding: 14px 0 4px 0; border-bottom: 2px solid #0129ac; margin-bottom: 10px; display: block; }
  .section-title-dms { color: #111111; border-bottom-color: #111111; }
  .section-title-sub { font-size: 9px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.04em; color: #555555; padding: 8px 0 4px 0; display: block; }
  .data-table        { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 6px; }
  .data-table td     { padding: 5px 0; font-family: Arial, Helvetica, sans-serif; font-size: 12px; border-bottom: 1px solid #f3f4f6; }
  .data-table .label { color: #555555; width: 58%; }
  .data-table .value { font-weight: bold; text-align: right; color: #111111; }
  .stat-table  { width: 100%; border-collapse: collapse; margin: 6px 0 10px 0; }
  .stat-table td { width: 14%; text-align: center; padding: 8px 2px; font-family: Arial, Helvetica, sans-serif; }
  .stat-num    { font-size: 17px; font-weight: bold; display: block; margin-bottom: 3px; font-family: Arial, Helvetica, sans-serif; }
  .stat-label  { font-size: 7px; display: block; text-transform: uppercase; letter-spacing: 0.03em; font-weight: bold; font-family: Arial, Helvetica, sans-serif; }
  .badge  { background: #DC2626; color: #ffffff; padding: 2px 10px; font-weight: bold; font-size: 11px; font-family: Arial, Helvetica, sans-serif; border-radius: 3px; }
  .divider   { border: 0; border-top: 1px solid #e5e7eb; margin: 14px 0; }
  .alert-box { background: #FEF2F2; border-left: 4px solid #DC2626; padding: 12px 16px; margin-top: 16px; font-size: 11px; color: #991B1B; font-family: Arial, Helvetica, sans-serif; }
  .footer-cell { background: #f9fafb; padding: 12px 24px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #888888; text-align: center; font-family: Arial, Helvetica, sans-serif; }
</style>
</head>
<body>
<div class="wrapper">
<table class="container" cellpadding="0" cellspacing="0" align="center">

  <tr>
    <td class="header">
      <h2>&#9888; Conflict Alert</h2>
      <p>${project.projectName} &mdash; ${project.source} &rarr; ${project.destination} &nbsp;|&nbsp; ${new Date().toLocaleString()}</p>
    </td>
  </tr>

  <tr>
    <td class="body-cell">

      <span class="section-title">Project Info</span>
      <table class="data-table">
        <tr><td class="label">Project</td><td class="value">${project.projectName}</td></tr>
        <tr><td class="label">Migration</td><td class="value">${project.source} &rarr; ${project.destination}</td></tr>
        <tr><td class="label">Migration Type</td><td class="value">${project.migrationType || '—'}</td></tr>
        <tr><td class="label">Migration Mode</td><td class="value" style="text-align:right;">${migrationModeHtml(data)}</td></tr>
        <tr><td class="label">Alert Time</td><td class="value">${new Date().toLocaleString()}</td></tr>
        <tr><td class="label">Total Conflicts</td><td class="value"><span class="badge">&#9888; ${total} conflict${total !== 1 ? 's' : ''}</span></td></tr>
      </table>

      <hr class="divider">

      <span class="section-title">&#128226; Channel Migration</span>
      <span class="section-title-sub">Workspace Status</span>
      <table class="stat-table" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background:#EFF6FF;border:1px solid #BFDBFE;"><span class="stat-num" style="color:#1D4ED8;">${data.channels?.total || 0}</span><span class="stat-label" style="color:#1D4ED8;">Total</span></td>
          <td style="background:#F0FDF4;border:1px solid #BBF7D0;"><span class="stat-num" style="color:#16A34A;">&#10003; ${data.channels?.completed || 0}</span><span class="stat-label" style="color:#16A34A;">Completed</span></td>
          <td style="background:#FFFBEB;border:1px solid #FDE68A;"><span class="stat-num" style="color:#D97706;">&#9203; ${data.channels?.inProgress || 0}</span><span class="stat-label" style="color:#D97706;">In Progress</span></td>
          <td style="background:#FEF2F2;border:1px solid #FECACA;"><span class="stat-num" style="color:#DC2626;">&#9888; ${data.channels?.conflict || 0}</span><span class="stat-label" style="color:#DC2626;">Conflict</span></td>
          <td style="background:#FFFBEB;border:1px solid #FDE68A;"><span class="stat-num" style="color:#D97706;">${data.channels?.processedWithConflict || 0}</span><span class="stat-label" style="color:#D97706;">Proc w/Conflict</span></td>
          <td style="background:#F9FAFB;border:1px solid #E5E7EB;"><span class="stat-num" style="color:#6B7280;">${data.channels?.noMessage || 0}</span><span class="stat-label" style="color:#6B7280;">No Message</span></td>
          <td style="background:#F9FAFB;border:1px solid #E5E7EB;"><span class="stat-num" style="color:#6B7280;">${data.channels?.notProcessed || 0}</span><span class="stat-label" style="color:#6B7280;">Not Processed</span></td>
        </tr>
      </table>
      <span class="section-title-sub">Message Count</span>
      <table class="data-table">
        <tr><td class="label">Processed Messages</td><td class="value" style="color:#16A34A;">${(data.channels?.processedCount || 0).toLocaleString()}</td></tr>
        <tr><td class="label">In Progress Messages</td><td class="value" style="color:#D97706;">${(data.channels?.inProgressCount || 0).toLocaleString()}</td></tr>
        <tr><td class="label">Conflict Messages</td><td class="value" style="color:#DC2626;">${(data.channels?.conflictCount || 0).toLocaleString()}</td></tr>
        <tr><td class="label">Not Processed Messages</td><td class="value" style="color:#6B7280;">${(data.channels?.notProcessedCount || 0).toLocaleString()}</td></tr>
      </table>

      <hr class="divider">

      <span class="section-title section-title-dms">&#128172; DMS Migration</span>
      <span class="section-title-sub">Workspace Status</span>
      <table class="stat-table" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background:#EFF6FF;border:1px solid #BFDBFE;"><span class="stat-num" style="color:#1D4ED8;">${data.dms?.total || 0}</span><span class="stat-label" style="color:#1D4ED8;">Total</span></td>
          <td style="background:#F0FDF4;border:1px solid #BBF7D0;"><span class="stat-num" style="color:#16A34A;">&#10003; ${data.dms?.completed || 0}</span><span class="stat-label" style="color:#16A34A;">Completed</span></td>
          <td style="background:#FFFBEB;border:1px solid #FDE68A;"><span class="stat-num" style="color:#D97706;">&#9203; ${data.dms?.inProgress || 0}</span><span class="stat-label" style="color:#D97706;">In Progress</span></td>
          <td style="background:#FEF2F2;border:1px solid #FECACA;"><span class="stat-num" style="color:#DC2626;">&#9888; ${data.dms?.conflict || 0}</span><span class="stat-label" style="color:#DC2626;">Conflict</span></td>
          <td style="background:#FFFBEB;border:1px solid #FDE68A;"><span class="stat-num" style="color:#D97706;">${data.dms?.processedWithConflict || 0}</span><span class="stat-label" style="color:#D97706;">Proc w/Conflict</span></td>
          <td style="background:#F9FAFB;border:1px solid #E5E7EB;"><span class="stat-num" style="color:#6B7280;">${data.dms?.noMessage || 0}</span><span class="stat-label" style="color:#6B7280;">No Message</span></td>
          <td style="background:#F9FAFB;border:1px solid #E5E7EB;"><span class="stat-num" style="color:#6B7280;">${data.dms?.notProcessed || 0}</span><span class="stat-label" style="color:#6B7280;">Not Processed</span></td>
        </tr>
      </table>
      <span class="section-title-sub">Message Count</span>
      <table class="data-table">
        <tr><td class="label">Processed Messages</td><td class="value" style="color:#16A34A;">${(data.dms?.processedCount || 0).toLocaleString()}</td></tr>
        <tr><td class="label">In Progress Messages</td><td class="value" style="color:#D97706;">${(data.dms?.inProgressCount || 0).toLocaleString()}</td></tr>
        <tr><td class="label">Conflict Messages</td><td class="value" style="color:#DC2626;">${(data.dms?.conflictCount || 0).toLocaleString()}</td></tr>
        <tr><td class="label">Not Processed Messages</td><td class="value" style="color:#6B7280;">${(data.dms?.notProcessedCount || 0).toLocaleString()}</td></tr>
      </table>

      ${buildConflictRowsHtml(conflictRows)}
      ${buildMultiInitHtml(data)}

      <div class="alert-box">
        <strong>&#9888; Action Required:</strong> Please resolve conflicts immediately to unblock migration progress.<br>
        This alert repeats every hour if conflicts persist.
      </div>

    </td>
  </tr>

  <tr>
    <td class="footer-cell">
      Migration Monitor &mdash; CloudFuze &nbsp;|&nbsp; Do not reply to this email &nbsp;|&nbsp; ${new Date().toLocaleString()}
    </td>
  </tr>

</table>
</div>
</body>
</html>`;
};

const buildStallTeamsPayload = (project, diff, data) => ({
  '@type':    'MessageCard',
  '@context': 'http://schema.org/extensions',
  themeColor: 'F59E0B',
  summary:    `⚠️ Migration Stalled — ${project.projectName}`,
  sections: [{
    activityTitle:    `⚠️ Migration Stalled — ${project.projectName}`,
    activitySubtitle: `${project.source} → ${project.destination} • ${new Date().toLocaleString()}`,
    facts: [
      { name: 'Previous channel count', value: (diff.channelPrevious || 0).toLocaleString() },
      { name: 'Current channel count',  value: (diff.channelCurrent  || 0).toLocaleString() },
      { name: 'Channel difference',     value: '0 — NO PROGRESS ⚠️' },
      { name: 'Previous DMS count',     value: (diff.dmsPrevious || 0).toLocaleString() },
      { name: 'Current DMS count',      value: (diff.dmsCurrent  || 0).toLocaleString() },
      { name: 'DMS difference',         value: '0 — NO PROGRESS ⚠️' },
      { name: 'Stalled for',            value: `${diff.stalledDuration || '?'} minutes` },
      { name: 'Channel conflicts',      value: String(data.channels.conflict || 0) },
      { name: 'DMS conflicts',          value: String(data.dms.conflict      || 0) },
    ]
  }]
});

const buildConflictTeamsPayload = (project, data) => {
  const total = (data.channels.conflict || 0) + (data.dms.conflict || 0);
  return {
    '@type':    'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: 'DC2626',
    summary:    `🔴 URGENT: Conflict — ${project.projectName}`,
    sections: [{
      activityTitle:    `🔴 URGENT: Conflict — ${project.projectName}`,
      activitySubtitle: `${total} conflict${total !== 1 ? 's' : ''} detected • ${new Date().toLocaleString()}`,
      facts: [
        { name: 'Channel conflicts',      value: String(data.channels.conflict || 0) },
        { name: 'DMS conflicts',          value: String(data.dms.conflict      || 0) },
        { name: 'Total channels',         value: String(data.channels.total    || 0) },
        { name: 'Total DMs',              value: String(data.dms.total         || 0) },
        { name: 'Channel processed',      value: (data.channels.processedCount || 0).toLocaleString() },
        { name: 'DMS processed',          value: (data.dms.processedCount      || 0).toLocaleString() },
        { name: 'Channel conflict count', value: (data.channels.conflictCount  || 0).toLocaleString() },
        { name: 'DMS conflict count',     value: (data.dms.conflictCount       || 0).toLocaleString() },
        { name: 'Migration route',        value: `${project.source} → ${project.destination}` },
      ]
    }]
  };
};

// ── ALERT SENDERS ────────────────────────────────────────────────────────────

const sendStallAlert = async (project, diff, data) => {
  const subject =
    `⚠️ Migration Stalled — ${project.projectName} ` +
    `(${project.source} → ${project.destination})`;

  // Include conflict details if there are any conflicts alongside the stall
  let conflictRows = null;
  const totalConflicts = (data.channels?.conflict || 0) + (data.dms?.conflict || 0);
  if (totalConflicts > 0) {
    try {
      const { fetchTopConflictRows } = require('./metabase');
      conflictRows = await fetchTopConflictRows(project.metabaseDatabaseId, 5);
    } catch (e) { console.warn('[Alert] fetchTopConflictRows failed:', e.message); }
  }

  return await sendAlerts(
    project,
    subject,
    buildStallTextBody(project, diff, data),
    buildStallHtmlBody(project, diff, data, conflictRows),
    buildStallTeamsPayload(project, diff, data)
  );
};

const sendConflictAlert = async (project, data) => {
  const totalConflicts =
    (data.channels?.conflict || 0) + (data.dms?.conflict || 0);

  const subject =
    `🔴 URGENT: Conflict Alert — ${project.projectName} ` +
    `(${totalConflicts} conflict${totalConflicts !== 1 ? 's' : ''})`;

  // Fetch top 5 conflict rows (channel name, WS ID, error) for email table
  let conflictRows = null;
  try {
    const { fetchTopConflictRows } = require('./metabase');
    conflictRows = await fetchTopConflictRows(project.metabaseDatabaseId, 5);
  } catch (e) { console.warn('[Alert] fetchTopConflictRows failed:', e.message); }

  return await sendAlerts(
    project,
    subject,
    buildConflictTextBody(project, data),
    buildConflictHtmlBody(project, data, conflictRows),
    buildConflictTeamsPayload(project, data)
  );
};

// ── DISPATCH ─────────────────────────────────────────────────────────────────

const sendAlerts = async (project, subject, textBody, htmlBody, teamsPayload) => {
  console.log('\n[Alert] ══════════════════════════');
  console.log('[Alert] Project:', project.projectName);
  console.log('[Alert] Subject:', subject);

  const mongoose = require('mongoose');
  const db = mongoose.connection.db;

  // Load fresh project
  let freshProject;
  try {
    freshProject = await db
      .collection('projectconfigs')
      .findOne({ metabaseDatabaseId: Number(project.metabaseDatabaseId) });
  } catch (e) {
    freshProject = project;
  }

  // Check per-project alert toggle
  if (freshProject?.alertsEnabled === false) {
    console.log(`[Alert] Skipped — alerts disabled for "${project.projectName}"`);
    return { emailSent: false, teamsSent: false };
  }

  // Load SMTP config
  const smtpDoc = await db
    .collection('systemconfigs')
    .findOne({ key: 'smtp' });

  // Resolve email
  const projectEmail = freshProject?.alertEmail?.toString().trim() || '';
  const defaultEmail = smtpDoc?.data?.defaultAlertEmail?.toString().trim() || '';

  // Support comma-separated emails — valid if at least one address contains @
  const hasValidProjectEmail = projectEmail &&
    projectEmail.split(',').some(e => e.trim().includes('@'));

  const alertEmail = hasValidProjectEmail ? projectEmail : defaultEmail;

  // Check if Graph API email is configured (can send without SMTP)
  const graphDoc = await db.collection('systemconfigs').findOne({ key: 'graphEmail' });
  const graphConfigured = !!(graphDoc?.data?.clientId && graphDoc?.data?.clientSecret &&
                             graphDoc?.data?.tenantId  && graphDoc?.data?.senderEmail);
  const emailServiceReady = !!(smtpDoc?.data?.host) || graphConfigured;

  console.log('[Alert] Config:', {
    projectEmail: projectEmail  || 'NOT SET',
    defaultEmail: defaultEmail  || 'NOT SET',
    finalEmail:   alertEmail    || 'NONE ← PROBLEM!',
    smtpHost:     smtpDoc?.data?.host     || 'NOT SET',
    authType:     smtpDoc?.data?.authType || 'password',
    hasPassword:  !!smtpDoc?.data?.password,
    hasOAuth:     !!smtpDoc?.data?.refreshToken
  });

  const rules = await getAlertRules();

  let emailSent = false;
  let teamsSent = false;

  // ── SEND EMAIL ────────────────────────────────────────────────────────────────
  if (!rules.enableEmailAlerts) {
    console.log('[Alert] Email disabled in rules');
  } else if (!alertEmail) {
    console.error(
      '[Alert] ✗ NO EMAIL — set in Admin → Projects ' +
      'or Admin → SMTP → Default Alert Email'
    );
  } else if (!emailServiceReady) {
    console.error('[Alert] ✗ No email service configured (set up SMTP or Microsoft Graph API in Admin)');
  } else {
    console.log(`[Alert] Sending email to: ${alertEmail}`);
    try {
      await emailService.sendAlert(alertEmail, subject, textBody, htmlBody);
      emailSent = true;
      console.log(`[Alert] ✓ EMAIL SENT: ${alertEmail}`);
    } catch (err) {
      console.error('[Alert] ✗ EMAIL FAILED:', err.message);
      if (err.response) console.error('[Alert] SMTP response:', err.response);
      if (err.code)     console.error('[Alert] Error code:', err.code);
    }
  }

  // ── SEND TEAMS ────────────────────────────────────────────────────────────────
  const webhookUrl = freshProject?.teamsWebhookUrl?.trim() || '';

  if (!rules.enableTeamsAlerts) {
    console.log('[Alert] Teams disabled in rules');
  } else if (!webhookUrl) {
    console.log('[Alert] No Teams webhook');
  } else {
    try {
      await teamsService.sendWebhook(webhookUrl, teamsPayload);
      teamsSent = true;
      console.log('[Alert] ✓ TEAMS SENT');
    } catch (err) {
      console.error('[Alert] ✗ TEAMS FAILED:', err.message);
    }
  }

  console.log('[Alert] Result:', { emailSent, teamsSent });
  console.log('[Alert] ══════════════════════════\n');

  // Return true only if at least one channel succeeded
  return emailSent || teamsSent;
};

// ── LIFECYCLE ────────────────────────────────────────────────────────────────

let cronJob = null;

const startCron = async () => {
  try {
    const rules = await getAlertRules();

    console.log('\n[Cron] ══════════════════════════════');
    console.log('[Cron] Loading alert rules from MongoDB...');
    console.log('[Cron] Rules:', {
      dataRefresh:      `${rules.dataRefreshIntervalMinutes} min`,
      stallCooldown:    `${rules.cooldownHours} hrs`,
      conflictCooldown: `${rules.conflictThresholdHours} hrs`,
      emailAlerts:      rules.enableEmailAlerts,
      teamsAlerts:      rules.enableTeamsAlerts
    });

    const expression = buildCronExpression(rules.dataRefreshIntervalMinutes);
    console.log(`[Cron] Cron expression: "${expression}"`);

    if (cronJob) {
      cronJob.stop();
      cronJob = null;
      console.log('[Cron] Stopped previous cron job');
    }

    cronJob = cron.schedule(expression, async () => {
      const now = new Date().toLocaleString();
      console.log(`\n[Cron] ⏰ Triggered at ${now}`);
      await checkProjects();
    });

    console.log(`[Cron] ✓ Started — runs every ${rules.dataRefreshIntervalMinutes} min`);
    console.log('[Cron] ══════════════════════════════\n');

    setTimeout(async () => {
      console.log('[Cron] Running initial check...');
      await checkProjects();
    }, 15000);

  } catch (err) {
    console.error('[Cron] startCron error:', err.message);
    console.log('[Cron] Falling back to 30 min default');
    cronJob = cron.schedule('*/30 * * * *', checkProjects);
  }
};

const restartCron = async () => {
  console.log('[Cron] Restarting with new settings...');
  await startCron();
};

const stop = () => {
  if (cronJob) { cronJob.stop(); cronJob = null; }
};

const getJobStatus = () => {
  const now     = new Date();
  const nextRun = new Date(
    Math.ceil(now.getTime() / (30 * 60 * 1000)) * (30 * 60 * 1000)
  );
  return { snapshotJob: 'running', nextRun };
};

module.exports = {
  startCron,
  restartCron,
  stop,
  checkProjects,
  getJobStatus,
  getAlertRules,
  buildCronExpression,
  sendStallAlert,
  sendConflictAlert,
  buildStallTextBody,
  buildStallHtmlBody,
  buildStallTeamsPayload,
  buildConflictTextBody,
  buildConflictHtmlBody,
  buildConflictTeamsPayload,
  lastAlertSent,
};
