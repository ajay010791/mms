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
    stallIntervalMinutes:   30,
    cooldownHours:          2,
    conflictThresholdHours: 1,
    enableEmailAlerts:      true,
    enableTeamsAlerts:      true
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
    checkEvery:       `${rules.stallIntervalMinutes} min`,
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
    projects = await ProjectConfig.find({ isActive: true });
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

      // ── STALL CHECK ──────────────────────────────────────────────────────────
      if (diff.hasEnoughData && diff.isStalled) {
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

      // ── CONFLICT CHECK ───────────────────────────────────────────────────────
      const totalConflicts = (data.channels.conflict || 0) + (data.dms.conflict || 0);

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

const buildStallTextBody = (project, diff, data) => `
Migration Stall Alert
═══════════════════════════════════════════════

PROJECT INFO
  Project:      ${project.projectName}
  Migration:    ${project.source} → ${project.destination}
  Type:         ${project.migrationType}
  Alert time:   ${new Date().toLocaleString()}
  Stalled for:  ${diff.stalledDuration || '?'} minutes ⚠️

CHANNEL MESSAGE COUNT
  Previous (${diff.snapshotAge || 30} min ago):  ${(diff.channelPrevious || 0).toLocaleString()}
  Current:                    ${(diff.channelCurrent || 0).toLocaleString()}
  Difference:                 0 — NO PROGRESS ⚠️

DMS MESSAGE COUNT
  Previous (${diff.snapshotAge || 30} min ago):  ${(diff.dmsPrevious || 0).toLocaleString()}
  Current:                    ${(diff.dmsCurrent || 0).toLocaleString()}
  Difference:                 0 — NO PROGRESS ⚠️

CHANNEL STATUS
  Total:      ${data.channels.total      || 0}
  Completed:  ${data.channels.completed  || 0}
  InProgress: ${data.channels.inProgress || 0}
  Conflict:   ${data.channels.conflict   || 0}
  No message: ${data.channels.noMessage  || 0}

DMS STATUS
  Total:      ${data.dms.total      || 0}
  Completed:  ${data.dms.completed  || 0}
  InProgress: ${data.dms.inProgress || 0}
  Conflict:   ${data.dms.conflict   || 0}

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

CHANNEL CONFLICTS
  In conflict:     ${data.channels.conflict   || 0}
  Total channels:  ${data.channels.total      || 0}
  Completed:       ${data.channels.completed  || 0}
  Processed count: ${(data.channels.processedCount || 0).toLocaleString()}
  Conflict count:  ${(data.channels.conflictCount  || 0).toLocaleString()}

DMS CONFLICTS
  In conflict:     ${data.dms.conflict   || 0}
  Total DMs:       ${data.dms.total      || 0}
  Completed:       ${data.dms.completed  || 0}
  Processed count: ${(data.dms.processedCount || 0).toLocaleString()}
  Conflict count:  ${(data.dms.conflictCount  || 0).toLocaleString()}

Please resolve conflicts immediately.
This alert repeats every 1 hour if conflicts persist.
`.trim();
};

const buildStallHtmlBody = (project, diff, data) => `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width">
<!--[if mso]>
<noscript>
<xml>
<o:OfficeDocumentSettings>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
</noscript>
<![endif]-->
<style>
  body, table, td {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13px;
    color: #333333;
    margin: 0;
    padding: 0;
    border-collapse: collapse;
  }
  .wrapper   { width: 100%; background: #f4f6f9; padding: 16px 0; }
  .container { width: 600px; max-width: 600px; margin: 0 auto; background: #ffffff; }
  .header    { background: #D97706; padding: 20px 24px; }
  .header h2 { color: #ffffff; font-size: 18px; margin: 0 0 4px 0; font-family: Arial, Helvetica, sans-serif; }
  .header p  { color: rgba(255,255,255,0.85); font-size: 11px; margin: 0; font-family: Arial, Helvetica, sans-serif; }
  .body-cell { padding: 20px 24px; background: #ffffff; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb; }
  .section-title        { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; padding: 12px 0 4px 0; border-bottom: 2px solid #f3f4f6; margin-bottom: 8px; display: block; }
  .section-title-blue   { color: #0129AC; border-bottom-color: #0129AC; }
  .section-title-purple { color: #6D28D9; border-bottom-color: #6D28D9; }
  .section-title-sub    { font-size: 9px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.04em; color: #374151; padding: 8px 0 3px 0; display: block; border-bottom: none; }
  .data-table    { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 4px; }
  .data-table td { padding: 5px 0; font-family: Arial, Helvetica, sans-serif; font-size: 12px; }
  .data-table .label { color: #6b7280; width: 55%; }
  .data-table .value { font-weight: bold; text-align: right; color: #333333; }
  .stat-table    { width: 100%; border-collapse: collapse; margin: 8px 0; }
  .stat-table td { width: 20%; text-align: center; padding: 8px 3px; border: 1px solid #e5e7eb; background: #f9fafb; font-family: Arial, Helvetica, sans-serif; }
  .stat-num   { font-size: 18px; font-weight: bold; display: block; margin-bottom: 2px; font-family: Arial, Helvetica, sans-serif; }
  .stat-label { font-size: 8px; color: #6b7280; display: block; font-family: Arial, Helvetica, sans-serif; }
  .red   { color: #DC2626; }
  .green { color: #16A34A; }
  .amber { color: #D97706; }
  .gray  { color: #6b7280; }
  .blue2 { color: #1D4ED8; }
  .nochg { font-size: 9px; background: #FEE2E2; color: #DC2626; padding: 1px 5px; border-radius: 8px; font-family: Arial, Helvetica, sans-serif; }
  .divider   { border: 0; border-top: 1px solid #f3f4f6; margin: 10px 0; }
  .alert-box { background: #FEF3C7; border: 1px solid #FCD34D; padding: 12px 16px; margin-top: 14px; font-size: 11px; color: #92400E; font-family: Arial, Helvetica, sans-serif; }
  .footer-cell { background: #f9fafb; padding: 12px 24px; border: 1px solid #e5e7eb; border-top: none; font-size: 10px; color: #9ca3af; text-align: center; font-family: Arial, Helvetica, sans-serif; }
</style>
</head>
<body>
<div class="wrapper">
<table class="container" cellpadding="0" cellspacing="0" align="center">

  <!-- HEADER -->
  <tr>
    <td class="header">
      <h2>&#9888;&#65039; Migration Stalled</h2>
      <p>${project.projectName} &mdash; ${project.source} &rarr; ${project.destination} &nbsp;|&nbsp; ${new Date().toLocaleString()}</p>
    </td>
  </tr>

  <!-- BODY -->
  <tr>
    <td class="body-cell">

      <!-- Project Info -->
      <span class="section-title">Project Info</span>
      <table class="data-table">
        <tr><td class="label">Project</td><td class="value">${project.projectName}</td></tr>
        <tr><td class="label">Migration</td><td class="value">${project.source} &rarr; ${project.destination}</td></tr>
        <tr><td class="label">Alert Time</td><td class="value">${new Date().toLocaleString()}</td></tr>
        <tr><td class="label">Stalled For</td><td class="value red">${diff.stalledDuration || '?'} minutes</td></tr>
      </table>

      <hr class="divider">

      <!-- CHANNELS -->
      <span class="section-title section-title-blue">&#128226; Channel Migration</span>

      <span class="section-title-sub">Channel Status</span>
      <table class="stat-table" cellpadding="0" cellspacing="0">
        <tr>
          <td><span class="stat-num blue2">${data.channels?.total || 0}</span><span class="stat-label">Total</span></td>
          <td><span class="stat-num green">${data.channels?.completed || 0}</span><span class="stat-label">Completed</span></td>
          <td><span class="stat-num amber">${data.channels?.inProgress || 0}</span><span class="stat-label">In Progress</span></td>
          <td><span class="stat-num red">${data.channels?.conflict || 0}</span><span class="stat-label">Conflict</span></td>
          <td><span class="stat-num gray">${data.channels?.noMessage || 0}</span><span class="stat-label">No Message</span></td>
        </tr>
      </table>

      <span class="section-title-sub">Channel Message Count</span>
      <table class="data-table">
        <tr>
          <td class="label">Processed Messages</td>
          <td class="value green">${(diff.channelCurrent || 0).toLocaleString()} &nbsp;<span class="nochg">&#9888; No change vs ${diff.snapshotAge || 30} min ago</span></td>
        </tr>
        <tr><td class="label">Previous (${diff.snapshotAge || 30} min ago)</td><td class="value">${(diff.channelPrevious || 0).toLocaleString()}</td></tr>
        <tr><td class="label">In Progress Messages</td><td class="value amber">${(data.channels?.inProgressCount || 0).toLocaleString()}</td></tr>
        <tr><td class="label">Conflict Messages</td><td class="value red">${(data.channels?.conflictCount || 0).toLocaleString()}</td></tr>
        <tr><td class="label">Not Processed</td><td class="value gray">${(data.channels?.notProcessedCount || 0).toLocaleString()}</td></tr>
      </table>

      <hr class="divider">

      <!-- DMS -->
      <span class="section-title section-title-purple">&#128172; DMS Migration</span>

      <span class="section-title-sub">DMS Status</span>
      <table class="stat-table" cellpadding="0" cellspacing="0">
        <tr>
          <td><span class="stat-num blue2">${data.dms?.total || 0}</span><span class="stat-label">Total</span></td>
          <td><span class="stat-num green">${data.dms?.completed || 0}</span><span class="stat-label">Completed</span></td>
          <td><span class="stat-num amber">${data.dms?.inProgress || 0}</span><span class="stat-label">In Progress</span></td>
          <td><span class="stat-num red">${data.dms?.conflict || 0}</span><span class="stat-label">Conflict</span></td>
          <td><span class="stat-num gray">${data.dms?.noMessage || 0}</span><span class="stat-label">No Message</span></td>
        </tr>
      </table>

      <span class="section-title-sub">DMS Message Count</span>
      <table class="data-table">
        <tr>
          <td class="label">Processed Messages</td>
          <td class="value green">${(diff.dmsCurrent || 0).toLocaleString()} &nbsp;<span class="nochg">&#9888; No change vs ${diff.snapshotAge || 30} min ago</span></td>
        </tr>
        <tr><td class="label">Previous (${diff.snapshotAge || 30} min ago)</td><td class="value">${(diff.dmsPrevious || 0).toLocaleString()}</td></tr>
        <tr><td class="label">In Progress Messages</td><td class="value amber">${(data.dms?.inProgressCount || 0).toLocaleString()}</td></tr>
        <tr><td class="label">Conflict Messages</td><td class="value red">${(data.dms?.conflictCount || 0).toLocaleString()}</td></tr>
        <tr><td class="label">Not Processed</td><td class="value gray">${(data.dms?.notProcessedCount || 0).toLocaleString()}</td></tr>
      </table>

      <!-- Action Required -->
      <div class="alert-box">
        &#9889; <strong>Action Required:</strong> Please investigate the migration pipeline immediately.<br>
        This alert repeats every 2 hour(s) if the issue persists.
      </div>

    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td class="footer-cell">
      Migration Monitor &mdash; CloudFuze &nbsp;|&nbsp; Do not reply to this email &nbsp;|&nbsp; ${new Date().toLocaleString()}
    </td>
  </tr>

</table>
</div>
</body>
</html>`;

const buildConflictHtmlBody = (project, data) => {
  const total = (data.channels?.conflict || 0) + (data.dms?.conflict || 0);
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width">
<!--[if mso]>
<noscript>
<xml>
<o:OfficeDocumentSettings>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
</noscript>
<![endif]-->
<style>
  body, table, td {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13px;
    color: #333333;
    margin: 0;
    padding: 0;
    border-collapse: collapse;
  }
  .wrapper   { width: 100%; background: #f4f6f9; padding: 16px 0; }
  .container { width: 600px; max-width: 600px; margin: 0 auto; background: #ffffff; }
  .header    { background: #DC2626; padding: 20px 24px; }
  .header h2 { color: #ffffff; font-size: 18px; margin: 0 0 4px 0; font-family: Arial, Helvetica, sans-serif; }
  .header p  { color: rgba(255,255,255,0.85); font-size: 11px; margin: 0; font-family: Arial, Helvetica, sans-serif; }
  .body-cell { padding: 20px 24px; background: #ffffff; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb; }
  .section-title        { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; padding: 12px 0 4px 0; border-bottom: 2px solid #f3f4f6; margin-bottom: 8px; display: block; }
  .section-title-blue   { color: #0129AC; border-bottom-color: #0129AC; }
  .section-title-purple { color: #6D28D9; border-bottom-color: #6D28D9; }
  .section-title-sub    { font-size: 9px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.04em; color: #374151; padding: 8px 0 3px 0; display: block; }
  .data-table    { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 4px; }
  .data-table td { padding: 5px 0; font-family: Arial, Helvetica, sans-serif; font-size: 12px; }
  .data-table .label { color: #6b7280; width: 55%; }
  .data-table .value { font-weight: bold; text-align: right; color: #333333; }
  .stat-table    { width: 100%; border-collapse: collapse; margin: 8px 0; }
  .stat-table td { width: 20%; text-align: center; padding: 8px 3px; border: 1px solid #e5e7eb; background: #f9fafb; font-family: Arial, Helvetica, sans-serif; }
  .stat-num   { font-size: 18px; font-weight: bold; display: block; margin-bottom: 2px; font-family: Arial, Helvetica, sans-serif; }
  .stat-label { font-size: 8px; color: #6b7280; display: block; font-family: Arial, Helvetica, sans-serif; }
  .red   { color: #DC2626; }
  .green { color: #16A34A; }
  .amber { color: #D97706; }
  .gray  { color: #6b7280; }
  .blue2 { color: #1D4ED8; }
  .badge { background: #FEE2E2; color: #DC2626; padding: 2px 8px; font-weight: bold; font-size: 11px; font-family: Arial, Helvetica, sans-serif; }
  .divider   { border: 0; border-top: 1px solid #f3f4f6; margin: 10px 0; }
  .alert-box { background: #FEE2E2; border: 1px solid #FECACA; padding: 12px 16px; margin-top: 14px; font-size: 11px; color: #991B1B; font-family: Arial, Helvetica, sans-serif; }
  .footer-cell { background: #f9fafb; padding: 12px 24px; border: 1px solid #e5e7eb; border-top: none; font-size: 10px; color: #9ca3af; text-align: center; font-family: Arial, Helvetica, sans-serif; }
</style>
</head>
<body>
<div class="wrapper">
<table class="container" cellpadding="0" cellspacing="0" align="center">

  <tr>
    <td class="header">
      <h2>&#128308; URGENT: Conflict Alert</h2>
      <p>${project.projectName} &mdash; ${project.source} &rarr; ${project.destination} &nbsp;|&nbsp; ${new Date().toLocaleString()}</p>
    </td>
  </tr>

  <tr>
    <td class="body-cell">

      <span class="section-title">Project Info</span>
      <table class="data-table">
        <tr><td class="label">Project</td><td class="value">${project.projectName}</td></tr>
        <tr><td class="label">Migration</td><td class="value">${project.source} &rarr; ${project.destination}</td></tr>
        <tr><td class="label">Alert Time</td><td class="value">${new Date().toLocaleString()}</td></tr>
        <tr><td class="label">Total Conflicts</td><td class="value"><span class="badge">${total} conflict${total !== 1 ? 's' : ''}</span></td></tr>
      </table>

      <hr class="divider">

      <span class="section-title section-title-blue">&#128226; Channel Migration</span>
      <span class="section-title-sub">Channel Status</span>
      <table class="stat-table" cellpadding="0" cellspacing="0">
        <tr>
          <td><span class="stat-num blue2">${data.channels?.total || 0}</span><span class="stat-label">Total</span></td>
          <td><span class="stat-num green">${data.channels?.completed || 0}</span><span class="stat-label">Completed</span></td>
          <td><span class="stat-num amber">${data.channels?.inProgress || 0}</span><span class="stat-label">In Progress</span></td>
          <td><span class="stat-num red">${data.channels?.conflict || 0}</span><span class="stat-label">Conflict</span></td>
          <td><span class="stat-num gray">${data.channels?.noMessage || 0}</span><span class="stat-label">No Message</span></td>
        </tr>
      </table>
      <span class="section-title-sub">Channel Message Count</span>
      <table class="data-table">
        <tr><td class="label">Processed Messages</td><td class="value green">${(data.channels?.processedCount || 0).toLocaleString()}</td></tr>
        <tr><td class="label">In Progress Messages</td><td class="value amber">${(data.channels?.inProgressCount || 0).toLocaleString()}</td></tr>
        <tr><td class="label">Conflict Messages</td><td class="value red">${(data.channels?.conflictCount || 0).toLocaleString()}</td></tr>
        <tr><td class="label">Not Processed</td><td class="value gray">${(data.channels?.notProcessedCount || 0).toLocaleString()}</td></tr>
      </table>

      <hr class="divider">

      <span class="section-title section-title-purple">&#128172; DMS Migration</span>
      <span class="section-title-sub">DMS Status</span>
      <table class="stat-table" cellpadding="0" cellspacing="0">
        <tr>
          <td><span class="stat-num blue2">${data.dms?.total || 0}</span><span class="stat-label">Total</span></td>
          <td><span class="stat-num green">${data.dms?.completed || 0}</span><span class="stat-label">Completed</span></td>
          <td><span class="stat-num amber">${data.dms?.inProgress || 0}</span><span class="stat-label">In Progress</span></td>
          <td><span class="stat-num red">${data.dms?.conflict || 0}</span><span class="stat-label">Conflict</span></td>
          <td><span class="stat-num gray">${data.dms?.noMessage || 0}</span><span class="stat-label">No Message</span></td>
        </tr>
      </table>
      <span class="section-title-sub">DMS Message Count</span>
      <table class="data-table">
        <tr><td class="label">Processed Messages</td><td class="value green">${(data.dms?.processedCount || 0).toLocaleString()}</td></tr>
        <tr><td class="label">In Progress Messages</td><td class="value amber">${(data.dms?.inProgressCount || 0).toLocaleString()}</td></tr>
        <tr><td class="label">Conflict Messages</td><td class="value red">${(data.dms?.conflictCount || 0).toLocaleString()}</td></tr>
        <tr><td class="label">Not Processed</td><td class="value gray">${(data.dms?.notProcessedCount || 0).toLocaleString()}</td></tr>
      </table>

      <div class="alert-box">
        &#128680; <strong>Action Required:</strong> Please resolve conflicts immediately to unblock migration progress.<br>
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

  return await sendAlerts(
    project,
    subject,
    buildStallTextBody(project, diff, data),
    buildStallHtmlBody(project, diff, data),
    buildStallTeamsPayload(project, diff, data)
  );
};

const sendConflictAlert = async (project, data) => {
  const totalConflicts =
    (data.channels?.conflict || 0) + (data.dms?.conflict || 0);

  const subject =
    `🔴 URGENT: Conflict Alert — ${project.projectName} ` +
    `(${totalConflicts} conflict${totalConflicts !== 1 ? 's' : ''})`;

  return await sendAlerts(
    project,
    subject,
    buildConflictTextBody(project, data),
    buildConflictHtmlBody(project, data),
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
      stallInterval:    `${rules.stallIntervalMinutes} min`,
      stallCooldown:    `${rules.cooldownHours} hrs`,
      conflictCooldown: `${rules.conflictThresholdHours} hrs`,
      emailAlerts:      rules.enableEmailAlerts,
      teamsAlerts:      rules.enableTeamsAlerts
    });

    const expression = buildCronExpression(rules.stallIntervalMinutes);
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

    console.log(`[Cron] ✓ Started — runs every ${rules.stallIntervalMinutes} min`);
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
