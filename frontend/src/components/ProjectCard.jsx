import React from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import AlertBadge from './AlertBadge';
import { getTypeColor, getCloudBadgeColor } from '../utils/classifier';
import api from '../utils/axios';

// ─── Shared sub-components ────────────────────────────────────────────────────

function Badges({ project }) {
  const typeColor  = getTypeColor(project.migrationType);
  const cloudColor = getCloudBadgeColor(project.cloudSource);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {project.combinationType && (
        <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: '#F3F4F6', color: '#374151', border: '1px solid #E5E7EB' }}>
          {project.combinationType}
        </span>
      )}
      {project.cloudSource && (
        <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: cloudColor + '15', color: cloudColor, border: `1px solid ${cloudColor}40` }}>
          {project.cloudSource}
        </span>
      )}
      <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: typeColor + '15', color: typeColor, border: `1px solid ${typeColor}40`, textTransform: 'capitalize' }}>
        {project.migrationType}
      </span>
    </div>
  );
}

function ActionButtons({ onExport }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button
        onClick={onExport}
        style={{ padding: '5px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
        ↓ Export report
      </button>
    </div>
  );
}

// ─── List layout: RAG section ─────────────────────────────────────────────────

function RagRow({ dot, label, value, large, subText, subColor, badge }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '3px 0', borderBottom: '0.5px solid #F3F4F6' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontSize: 11, color: '#374151' }}>{label}</span>
      </div>
      <div style={{ textAlign: 'right', marginLeft: 6 }}>
        <div style={{ fontSize: large ? 13 : 11, fontWeight: large ? 500 : 400, color: '#111827', lineHeight: 1.2 }}>
          {(value || 0).toLocaleString()}
        </div>
        {subText && (
          <div style={{ fontSize: 9, color: subColor || '#6b7280', lineHeight: 1.2 }}>{subText}</div>
        )}
        {badge && (
          <span style={{ fontSize: 9, background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 10, padding: '0 5px', lineHeight: 1.5 }}>
            Alert sent
          </span>
        )}
      </div>
    </div>
  );
}

function RagSection({ borderColor, titleColor, title, children }) {
  return (
    <div style={{ borderLeft: `3px solid ${borderColor}`, paddingLeft: 10, minWidth: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: titleColor, marginBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// ─── Detail layout: section label ────────────────────────────────────────────

function SectionLabel({ icon, text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
      <i className={`ti ${icon}`} style={{ fontSize: 14, lineHeight: 1 }} />
      <span style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
        {text}
      </span>
      <div style={{ flex: 1, height: '0.5px', background: 'var(--color-border-tertiary)' }} />
    </div>
  );
}

function WorkspaceBox({ bg, border, icon, iconColor, numColor, labelColor, label, value, barColor, barPct }) {
  return (
    <div style={{ background: bg, border: `0.5px solid ${border}`, borderRadius: 10, padding: '14px 10px', textAlign: 'center' }}>
      <i className={`ti ${icon}`} style={{ fontSize: 18, color: iconColor, display: 'block', marginBottom: 4 }} />
      <div style={{ fontSize: 22, fontWeight: 500, color: numColor, lineHeight: 1.1, marginBottom: 2 }}>
        {(value || 0).toLocaleString()}
      </div>
      <div style={{ fontSize: 10, fontWeight: 500, color: labelColor, marginBottom: 8 }}>{label}</div>
      <div style={{ height: 3, borderRadius: 2, background: 'var(--color-border-tertiary)', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 2, width: `${barPct}%`, background: barColor }} />
      </div>
    </div>
  );
}

function MessageBox({ bg, border, icon, iconColor, numColor, labelColor, label, value, subText, subColor }) {
  return (
    <div style={{ background: bg, border: `0.5px solid ${border}`, borderRadius: 10, padding: '14px 10px', textAlign: 'center' }}>
      <i className={`ti ${icon}`} style={{ fontSize: 18, color: iconColor, display: 'block', marginBottom: 4 }} />
      <div style={{ fontSize: 24, fontWeight: 500, color: numColor, lineHeight: 1.1, marginBottom: 2 }}>
        {(value || 0).toLocaleString()}
      </div>
      <div style={{ fontSize: 10, fontWeight: 500, color: labelColor, marginBottom: 4 }}>{label}</div>
      {subText && (
        <div style={{ fontSize: 10, fontWeight: 500, color: subColor }}>{subText}</div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function ProjectCard({ project, token, layout = 'list', isHistorical = false, historicalTime = '', onRefresh }) {
  if (!project) return null;
  const startedDate = project.createdAt ? format(new Date(project.createdAt), 'MMM d, yyyy') : '—';
  const isStalled   = project.diff?.isStalled || false;
  const hasConflict = (project.channels?.conflict || 0) > 0 || (project.dms?.conflict || 0) > 0;
  const hasAlert    = isStalled || hasConflict;

  // ─── Export: full HTML → PDF ─────────────────────────────────────────────────
  const handleExport = async () => {
    if (!project.channels) {
      toast.error('Load live data first before exporting');
      return;
    }

    const { default: html2pdf } = await import('html2pdf.js');

    const content = `<!DOCTYPE html><html><head><style>
      body { font-family: Arial, sans-serif; font-size: 12px; color: #1A1F36; margin: 0; padding: 20px; }
      .header { background: linear-gradient(135deg, #0129AC, #002060); color: white; padding: 20px 24px; border-radius: 8px; margin-bottom: 20px; }
      .header h1 { margin: 0 0 4px; font-size: 20px; }
      .header p { margin: 0; font-size: 11px; opacity: 0.8; }
      .section { margin-bottom: 16px; }
      .section-title { font-size: 13px; font-weight: bold; color: #0129AC; border-bottom: 2px solid #0129AC; padding-bottom: 4px; margin-bottom: 10px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th { background: #0129AC; color: white; padding: 6px 10px; text-align: left; }
      td { padding: 5px 10px; border-bottom: 1px solid #e5e7eb; }
      tr:nth-child(even) td { background: #F7F8FC; }
      .stat-row { display: flex; gap: 12px; margin-bottom: 12px; }
      .stat-box { flex: 1; background: #DBEAFE; border-radius: 6px; padding: 10px; text-align: center; }
      .stat-num { font-size: 20px; font-weight: bold; color: #0129AC; }
      .stat-label { font-size: 9px; color: #7A8BA6; }
      .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 9px; color: #7A8BA6; text-align: center; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: bold; }
      .badge-green { background: #EAF3DE; color: #27500A; }
      .badge-red   { background: #FCEBEB; color: #791F1F; }
      .badge-amber { background: #FAEEDA; color: #633806; }
    </style></head><body>
      <div class="header">
        <h1>${project.projectName}</h1>
        <p>${project.source || ''} → ${project.destination || ''} &nbsp;|&nbsp; Migration Type: ${project.migrationType} &nbsp;|&nbsp; Report generated: ${new Date().toLocaleString()}</p>
      </div>
      <div class="section">
        <div class="section-title">Channel Status</div>
        <div class="stat-row">
          <div class="stat-box"><div class="stat-num">${project.channels?.total || 0}</div><div class="stat-label">Total Channels</div></div>
          <div class="stat-box"><div class="stat-num" style="color:#27500A">${project.channels?.completed || 0}</div><div class="stat-label">Completed</div></div>
          <div class="stat-box"><div class="stat-num" style="color:#854F0B">${project.channels?.inProgress || 0}</div><div class="stat-label">In Progress</div></div>
          <div class="stat-box"><div class="stat-num" style="color:#A32D2D">${project.channels?.conflict || 0}</div><div class="stat-label">Conflict</div></div>
          <div class="stat-box"><div class="stat-num" style="color:#A32D2D">${project.channels?.processedWithConflict || 0}</div><div class="stat-label">Proc. w/ Conflict</div></div>
          <div class="stat-box"><div class="stat-num" style="color:#6b7280">${project.channels?.noMessage || 0}</div><div class="stat-label">No Message</div></div>
        </div>
      </div>
      <div class="section">
        <div class="section-title">Channel Message Count</div>
        <table>
          <tr><th>Metric</th><th>Count</th><th>Status</th></tr>
          <tr><td>Processed Messages</td><td><strong>${(project.channels?.processedCount || 0).toLocaleString()}</strong></td><td>${project.diff?.isStalled ? '<span class="badge badge-red">⚠ Stalled</span>' : '<span class="badge badge-green">Active</span>'}</td></tr>
          <tr><td>In Progress Messages</td><td>${(project.channels?.inProgressCount || 0).toLocaleString()}</td><td><span class="badge badge-amber">Processing</span></td></tr>
          <tr><td>Conflict Messages</td><td>${(project.channels?.conflictCount || 0).toLocaleString()}</td><td>${(project.channels?.conflictCount || 0) > 0 ? '<span class="badge badge-red">Needs Attention</span>' : '<span class="badge badge-green">Clear</span>'}</td></tr>
          <tr><td>Not Processed</td><td>${(project.channels?.notProcessedCount || 0).toLocaleString()}</td><td>—</td></tr>
        </table>
      </div>
      <div class="section">
        <div class="section-title">DMS Status</div>
        <div class="stat-row">
          <div class="stat-box"><div class="stat-num">${project.dms?.total || 0}</div><div class="stat-label">Total DMs</div></div>
          <div class="stat-box"><div class="stat-num" style="color:#27500A">${project.dms?.completed || 0}</div><div class="stat-label">Completed</div></div>
          <div class="stat-box"><div class="stat-num" style="color:#854F0B">${project.dms?.inProgress || 0}</div><div class="stat-label">In Progress</div></div>
          <div class="stat-box"><div class="stat-num" style="color:#A32D2D">${project.dms?.conflict || 0}</div><div class="stat-label">Conflict</div></div>
        </div>
      </div>
      <div class="section">
        <div class="section-title">DMS Message Count</div>
        <table>
          <tr><th>Metric</th><th>Count</th></tr>
          <tr><td>Processed Messages</td><td><strong>${(project.dms?.processedCount || 0).toLocaleString()}</strong></td></tr>
          <tr><td>In Progress Messages</td><td>${(project.dms?.inProgressCount || 0).toLocaleString()}</td></tr>
          <tr><td>Conflict Messages</td><td>${(project.dms?.conflictCount || 0).toLocaleString()}</td></tr>
          <tr><td>Not Processed</td><td>${(project.dms?.notProcessedCount || 0).toLocaleString()}</td></tr>
        </table>
      </div>
      <div class="footer">Migration Monitor — CloudFuze &nbsp;|&nbsp; Report generated: ${new Date().toLocaleString()} &nbsp;|&nbsp; Project: ${project.projectName}</div>
    </body></html>`;

    const filename = `${project.projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_report_${new Date().toISOString().split('T')[0]}.pdf`;

    const element = document.createElement('div');
    element.innerHTML = content;
    document.body.appendChild(element);

    await html2pdf().set({
      margin:      [10, 10],
      filename,
      image:       { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(element).save();

    document.body.removeChild(element);
    toast.success('Report downloaded ✓');
  };


  // ─── DETAIL LAYOUT ───────────────────────────────────────────────────────────
  if (layout === 'detail') {
    const ch  = project.channels || {};
    const dms = project.dms      || {};

    const pct = (total, val) => total > 0 ? Math.round(((val || 0) / total) * 100) : 0;

    const diffData   = project.diff;
    const chDiffText = diffData?.channelMessage
      || (!diffData ? 'Waiting for snapshot…' : diffData.message);
    const chDiffColor = !diffData || !diffData.hasEnoughData
      ? 'var(--color-text-tertiary)'
      : (diffData.channelDiff ?? diffData.diff) === 0 ? '#A32D2D' : '#3B6D11';
    const dmsDiffText  = diffData?.dmsMessage || '';
    const dmsDiffColor = !diffData || !diffData.hasEnoughData
      ? 'var(--color-text-tertiary)'
      : (diffData.dmsDiff ?? diffData.diff) === 0 ? '#A32D2D' : '#3B6D11';

    return (
      <div style={{ background: '#fff', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 12 }}>

        {isHistorical && (
          <div style={{ background: '#FAEEDA', padding: '4px 16px', fontSize: '10px', color: '#854F0B', borderBottom: '0.5px solid #FAC775', display: 'flex', alignItems: 'center', gap: 4 }}>
            <i className="ti ti-history" style={{ fontSize: '11px' }} />
            {' '}Historical snapshot — {historicalTime}
          </div>
        )}

        {/* HEADER */}
        <div style={{ padding: '14px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 6 }}>
              {project.projectName}
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
              {project.combinationType && (
                <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: '#E6F1FB', color: '#0C447C' }}>
                  {project.combinationType}
                </span>
              )}
              {project.cloudSource && (
                <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: '#E6F1FB', color: '#0C447C' }}>
                  {project.cloudSource}
                </span>
              )}
              <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: '#EEEDFE', color: '#26215C', textTransform: 'capitalize' }}>
                {project.migrationType}
              </span>
              {isStalled && (
                <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: '#FCEBEB', color: '#791F1F' }}>
                  ⚠ Stalled
                </span>
              )}
              {hasConflict && (
                <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: '#FCEBEB', color: '#791F1F' }}>
                  🔴 Conflict Alert
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="ti ti-calendar" style={{ fontSize: 12 }} />
              Started: {startedDate}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              onClick={handleExport}
              style={{ padding: '5px 10px', fontSize: 11, borderRadius: 6, border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-secondary)', color: '#374151', cursor: 'pointer' }}>
              ↓ Export
            </button>
          </div>
        </div>

        {/* BODY */}
        <div style={{ padding: 16 }}>

          {/* ── CHANNELS ── */}
          <div>
            <SectionLabel icon="ti-layout-grid" text="Channel status" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
              <WorkspaceBox bg="#E6F1FB" border="#B5D4F4" icon="ti-stack-2" iconColor="#185FA5" numColor="#185FA5" labelColor="#0C447C" label="Total" value={ch.total} barColor="#378ADD" barPct={100} />
              <WorkspaceBox bg="#EAF3DE" border="#C0DD97" icon="ti-circle-check" iconColor="#3B6D11" numColor="#3B6D11" labelColor="#27500A" label="Completed" value={ch.completed} barColor="#1D9E75" barPct={pct(ch.total, ch.completed)} />
              <WorkspaceBox bg="#FDF4E7" border="#F5D89A" icon="ti-circle-check-filled" iconColor="#854F0B" numColor="#854F0B" labelColor="#633806" label="Proc. w/ Conflict" value={ch.processedWithConflict} barColor="#BA7517" barPct={pct(ch.total, ch.processedWithConflict)} />
              <WorkspaceBox bg="#FCEBEB" border="#F7C1C1" icon="ti-alert-triangle" iconColor="#A32D2D" numColor="#A32D2D" labelColor="#791F1F" label="Conflict" value={ch.conflict} barColor="#E24B4A" barPct={pct(ch.total, ch.conflict)} />
              <WorkspaceBox bg="#FAEEDA" border="#FAC775" icon="ti-loader" iconColor="#854F0B" numColor="#854F0B" labelColor="#633806" label="In Progress" value={ch.inProgress} barColor="#BA7517" barPct={pct(ch.total, ch.inProgress)} />
              <WorkspaceBox bg="var(--color-background-secondary)" border="var(--color-border-tertiary)" icon="ti-message-off" iconColor="var(--color-text-tertiary)" numColor="var(--color-text-secondary)" labelColor="var(--color-text-secondary)" label="No Message" value={ch.noMessage} barColor="#888780" barPct={pct(ch.total, ch.noMessage)} />
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <SectionLabel icon="ti-messages" text="Channel msg count" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <MessageBox bg="#EAF3DE" border="#C0DD97" icon="ti-checks" iconColor="#3B6D11" numColor="#3B6D11" labelColor="#27500A" label="Processed" value={ch.processedCount} subText={chDiffText} subColor={chDiffColor} />
              <MessageBox bg="#FAEEDA" border="#FAC775" icon="ti-loader" iconColor="#854F0B" numColor="#854F0B" labelColor="#633806" label="In Progress" value={ch.inProgressCount} subText="" subColor="" />
              <MessageBox bg="#FCEBEB" border="#F7C1C1" icon="ti-alert-circle" iconColor="#A32D2D" numColor="#A32D2D" labelColor="#791F1F" label="Conflict" value={ch.conflictCount} subText={ch.conflictCount > 0 ? 'needs attention' : 'all clear'} subColor={ch.conflictCount > 0 ? '#A32D2D' : '#3B6D11'} />
              <MessageBox bg="var(--color-background-secondary)" border="var(--color-border-tertiary)" icon="ti-clock-pause" iconColor="var(--color-text-tertiary)" numColor="var(--color-text-secondary)" labelColor="var(--color-text-secondary)" label="Not Processed" value={ch.notProcessedCount} subText="" subColor="" />
            </div>
          </div>

          {/* ── DIVIDER ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 14px' }}>
            <div style={{ flex: 1, height: '0.5px', background: 'var(--color-border-tertiary)' }} />
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#7F77DD', whiteSpace: 'nowrap' }}>Direct Messages</span>
            <div style={{ flex: 1, height: '0.5px', background: 'var(--color-border-tertiary)' }} />
          </div>

          {/* ── DMS ── */}
          <div>
            <SectionLabel icon="ti-message-circle" text="DMS status" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
              <WorkspaceBox bg="#EEEDFE" border="#C4C0F7" icon="ti-stack-2" iconColor="#534AB7" numColor="#534AB7" labelColor="#26215C" label="Total" value={dms.total} barColor="#7F77DD" barPct={100} />
              <WorkspaceBox bg="#EAF3DE" border="#C0DD97" icon="ti-circle-check" iconColor="#3B6D11" numColor="#3B6D11" labelColor="#27500A" label="Completed" value={dms.completed} barColor="#1D9E75" barPct={pct(dms.total, dms.completed)} />
              <WorkspaceBox bg="#FDF4E7" border="#F5D89A" icon="ti-circle-check-filled" iconColor="#854F0B" numColor="#854F0B" labelColor="#633806" label="Proc. w/ Conflict" value={dms.processedWithConflict} barColor="#BA7517" barPct={pct(dms.total, dms.processedWithConflict)} />
              <WorkspaceBox bg="#FCEBEB" border="#F7C1C1" icon="ti-alert-triangle" iconColor="#A32D2D" numColor="#A32D2D" labelColor="#791F1F" label="Conflict" value={dms.conflict} barColor="#E24B4A" barPct={pct(dms.total, dms.conflict)} />
              <WorkspaceBox bg="#FAEEDA" border="#FAC775" icon="ti-loader" iconColor="#854F0B" numColor="#854F0B" labelColor="#633806" label="In Progress" value={dms.inProgress} barColor="#BA7517" barPct={pct(dms.total, dms.inProgress)} />
              <WorkspaceBox bg="var(--color-background-secondary)" border="var(--color-border-tertiary)" icon="ti-message-off" iconColor="var(--color-text-tertiary)" numColor="var(--color-text-secondary)" labelColor="var(--color-text-secondary)" label="No Message" value={dms.noMessage} barColor="#888780" barPct={pct(dms.total, dms.noMessage)} />
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <SectionLabel icon="ti-messages" text="DMS msg count" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <MessageBox bg="#EAF3DE" border="#C0DD97" icon="ti-checks" iconColor="#3B6D11" numColor="#3B6D11" labelColor="#27500A" label="Processed" value={dms.processedCount} subText={dmsDiffText} subColor={dmsDiffColor} />
              <MessageBox bg="#FAEEDA" border="#FAC775" icon="ti-loader" iconColor="#854F0B" numColor="#854F0B" labelColor="#633806" label="In Progress" value={dms.inProgressCount} subText="" subColor="" />
              <MessageBox bg="#FCEBEB" border="#F7C1C1" icon="ti-alert-circle" iconColor="#A32D2D" numColor="#A32D2D" labelColor="#791F1F" label="Conflict" value={dms.conflictCount} subText={dms.conflictCount > 0 ? 'needs attention' : 'all clear'} subColor={dms.conflictCount > 0 ? '#A32D2D' : '#3B6D11'} />
              <MessageBox bg="var(--color-background-secondary)" border="var(--color-border-tertiary)" icon="ti-clock-pause" iconColor="var(--color-text-tertiary)" numColor="var(--color-text-secondary)" labelColor="var(--color-text-secondary)" label="Not Processed" value={dms.notProcessedCount} subText="" subColor="" />
            </div>
          </div>

        </div>
      </div>
    );
  }

  // ─── LIST LAYOUT ─────────────────────────────────────────────────────────────

  const ch       = project.channels || {};
  const dms      = project.dms      || {};
  const diffData = project.diff;
  const chDiffText  = !diffData || !diffData.hasEnoughData
    ? (diffData?.message ?? null)
    : diffData.channelMessage || null;
  const chDiffColor  = !diffData || !diffData.hasEnoughData
    ? '#9ca3af'
    : (diffData.channelDiff ?? diffData.diff) === 0 ? '#E24B4A' : '#3B6D11';
  const dmsDiffText  = diffData?.hasEnoughData ? (diffData.dmsMessage || null) : null;
  const dmsDiffColor = !diffData || !diffData.hasEnoughData
    ? '#9ca3af'
    : (diffData.dmsDiff ?? diffData.diff) === 0 ? '#E24B4A' : '#3B6D11';

  return (
    <div style={{ background: '#fff', border: '0.5px solid #E5E7EB', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: 10, overflow: 'hidden' }}>

      {isHistorical && (
        <div style={{ background: '#FAEEDA', padding: '4px 16px', fontSize: '10px', color: '#854F0B', borderBottom: '0.5px solid #FAC775', display: 'flex', alignItems: 'center', gap: 4 }}>
          <i className="ti ti-history" style={{ fontSize: '11px' }} />
          {' '}Historical snapshot — {historicalTime}
        </div>
      )}

      {/* HEADER */}
      <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#111827', marginBottom: 5 }}>
            {project.projectName}
          </div>
          <div style={{ marginBottom: 4 }}>
            <Badges project={project} />
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>Started: {startedDate}</span>
            {hasAlert && <AlertBadge isStalled={isStalled} hasLongConflict={hasConflict} />}
          </div>
        </div>
        <div style={{ flexShrink: 0, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          {layout !== 'list' && onRefresh && (
            <button
              onClick={onRefresh}
              title="Refresh"
              style={{ background: 'none', border: '0.5px solid var(--color-border-secondary)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <i className="ti ti-refresh" style={{ fontSize: '12px' }} /> Refresh
            </button>
          )}
          <ActionButtons onExport={handleExport} />
        </div>
      </div>

      {/* BODY: 4 RAG sections */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, padding: '12px 16px' }}>

        {/* SECTION 1 — Channel Status */}
        <RagSection borderColor="#378ADD" titleColor="#185FA5" title="Channel Status">
          <RagRow dot="#2563eb" label="Total"            value={ch.total}                />
          <RagRow dot="#16a34a" label="Completed"         value={ch.completed}            />
          <RagRow dot="#d97706" label="Proc. w/ Conflict" value={ch.processedWithConflict} />
          <RagRow dot="#dc2626" label="Conflict"          value={ch.conflict}             />
          <RagRow dot="#d97706" label="In Progress"       value={ch.inProgress}           />
          <RagRow dot="#6b7280" label="No Message"        value={ch.noMessage}            />
        </RagSection>

        {/* SECTION 2 — Channel Msg Count */}
        <RagSection borderColor="#5a9e2f" titleColor="#3B6D11" title="Channel Msg Count">
          <RagRow dot="#16a34a" label="Processed"    value={ch.processedCount}    large subText={chDiffText} subColor={chDiffColor} />
          <RagRow dot="#d97706" label="In Progress"  value={ch.inProgressCount}   />
          <RagRow dot="#dc2626" label="Conflict"     value={ch.conflictCount}     />
          <RagRow dot="#6b7280" label="Not Processed" value={ch.notProcessedCount} />
        </RagSection>

        {/* SECTION 3 — DMS Status */}
        <RagSection borderColor="#7F77DD" titleColor="#534AB7" title="DMS Status">
          <RagRow dot="#7F77DD" label="Total"            value={dms.total}                />
          <RagRow dot="#16a34a" label="Completed"         value={dms.completed}            />
          <RagRow dot="#d97706" label="Proc. w/ Conflict" value={dms.processedWithConflict} />
          <RagRow dot="#dc2626" label="Conflict"          value={dms.conflict}             />
          <RagRow dot="#d97706" label="In Progress"       value={dms.inProgress}           />
          <RagRow dot="#6b7280" label="No Message"        value={dms.noMessage}            />
        </RagSection>

        {/* SECTION 4 — DMS Msg Count */}
        <RagSection borderColor="#BA7517" titleColor="#854F0B" title="DMS Msg Count">
          <RagRow dot="#16a34a" label="Processed"    value={dms.processedCount}    large subText={dmsDiffText} subColor={dmsDiffColor} />
          <RagRow dot="#d97706" label="In Progress"  value={dms.inProgressCount}   />
          <RagRow dot="#dc2626" label="Conflict"     value={dms.conflictCount}     />
          <RagRow dot="#6b7280" label="Not Processed" value={dms.notProcessedCount} />
        </RagSection>

      </div>
    </div>
  );
}
