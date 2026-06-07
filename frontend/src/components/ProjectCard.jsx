import React, { useState, useRef, useCallback } from 'react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import AlertBadge from './AlertBadge';
import { getTypeColor, getCloudBadgeColor } from '../utils/classifier';
import api from '../utils/axios';

// ─── Conflict Tooltip ─────────────────────────────────────────────────────────

const trimAtClientRequestId = (error) => {
  const idx = error.toLowerCase().indexOf('client-request-id');
  if (idx === -1) return error;
  return error.slice(0, idx).trim().replace(/[,;:\s]+$/, '');
};

function ConflictTooltip({ databaseId, projectName, count, children }) {
  const [visible,  setVisible]  = useState(false);
  const [errors,   setErrors]   = useState(null);   // null = not loaded yet
  const [loading,  setLoading]  = useState(false);
  const timerRef = useRef(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    if (errors !== null || loading) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/projects/conflict-errors/${databaseId}`);
      setErrors(res.data);
    } catch {
      setErrors({ topErrors: [], total: 0, tableFound: false });
    } finally {
      setLoading(false);
    }
  }, [databaseId, errors, loading]);

  const handleEnter = () => {
    timerRef.current = setTimeout(() => {
      setVisible(true);
      load();
    }, 250);
  };

  const handleLeave = () => {
    clearTimeout(timerRef.current);
    setVisible(false);
  };

  if (!count || count === 0) return children;

  return (
    <div style={{ position: 'relative' }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}>
      {children}

      {visible && (
        <div style={{
          position: 'absolute', zIndex: 9999, top: '100%', left: '50%',
          transform: 'translateX(-50%)', marginTop: 6,
          background: '#fff', border: '0.5px solid #e5e7eb',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          minWidth: 280, maxWidth: 340, padding: '12px 14px',
          pointerEvents: 'auto',
        }}>
          {/* Arrow */}
          <div style={{
            position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)',
            width: 10, height: 10, background: '#fff',
            border: '0.5px solid #e5e7eb', borderBottom: 'none', borderRight: 'none',
            rotate: '45deg',
          }} />

          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#DC2626', marginBottom: 8 }}>
            ⚠ Top Conflict Errors
          </div>

          {loading && (
            <div style={{ fontSize: 11, color: '#9ca3af', padding: '4px 0' }}>Loading…</div>
          )}

          {!loading && errors && !errors.tableFound && (
            <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>ErrorDescription table not found in Metabase</div>
          )}

          {!loading && errors?.tableFound && errors.topErrors.length === 0 && (
            <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>No error descriptions available</div>
          )}

          {!loading && errors?.topErrors?.slice(0, 2).map((e, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              gap: 8, padding: '5px 0',
              borderBottom: i < errors.topErrors.length - 1 ? '0.5px solid #f3f4f6' : 'none',
            }}>
              <div style={{ fontSize: 11, color: '#374151', lineHeight: 1.4, flex: 1 }}>
                <span style={{ color: '#DC2626', fontWeight: 700, marginRight: 4 }}>
                  {i + 1}.
                </span>
                {trimAtClientRequestId(e.error)}
              </div>
              <span style={{
                fontSize: 10, fontWeight: 700, background: '#FEF2F2', color: '#DC2626',
                padding: '1px 6px', borderRadius: 10, flexShrink: 0, marginTop: 1,
              }}>
                ×{e.count}
              </span>
            </div>
          ))}

          {/* View More */}
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '0.5px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => navigate(`/conflict-details/${databaseId}?name=${encodeURIComponent(projectName || '')}`)}
              style={{
                fontSize: 11, fontWeight: 600, color: '#0129ac', background: 'none',
                border: '0.5px solid #0129ac', borderRadius: 6, padding: '3px 10px',
                cursor: 'pointer',
              }}>
              View All →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────


function DeltaBadge({ hasDelta }) {
  if (hasDelta === null || hasDelta === undefined) return null;
  return hasDelta ? (
    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#CCFBF1', color: '#0F766E', border: '1px solid #99F6E4' }}>
      🔄 Delta
    </span>
  ) : (
    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#EDE9FE', color: '#5B21B6', border: '1px solid #DDD6FE' }}>
      1× One-Time
    </span>
  );
}

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

// ─── Migration type breakdown (One-Time vs Delta message counts) ──────────────

const BREAKDOWN_METRICS = [
  { label: 'Processed',     key: 'processedCount',    color: '#16a34a' },
  { label: 'In Progress',   key: 'inProgressCount',   color: '#d97706' },
  { label: 'Conflict',      key: 'conflictCount',     color: '#dc2626' },
  { label: 'Not Processed', key: 'notProcessedCount', color: '#6b7280' },
];

function MigrationTypeBreakdown({ oneTime, delta, sectionLabel = 'workspaces' }) {
  if (!oneTime && !delta) return null;
  const hasOneTime = oneTime && oneTime.rowCount > 0;
  const hasDelta   = delta   && delta.rowCount   > 0;
  if (!hasOneTime && !hasDelta) return null;

  const cols = [hasOneTime, hasDelta].filter(Boolean).length + 1; // +1 for label col

  return (
    <div style={{ marginTop: 10, border: '0.5px solid var(--color-border-tertiary)', borderRadius: 8, overflow: 'hidden', fontSize: 11 }}>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: `1.4fr ${'1fr '.repeat(cols - 1).trim()}` }}>
        <div style={{ padding: '5px 10px', background: 'var(--color-background-secondary)', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
          Msg Breakdown
        </div>
        {hasOneTime && (
          <div style={{ padding: '5px 10px', background: '#EDE9FE', borderLeft: '0.5px solid var(--color-border-tertiary)', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: 9, fontWeight: 600, color: '#5B21B6' }}>
            1× One-Time · {oneTime.rowCount.toLocaleString()} {sectionLabel}
          </div>
        )}
        {hasDelta && (
          <div style={{ padding: '5px 10px', background: '#CCFBF1', borderLeft: '0.5px solid var(--color-border-tertiary)', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: 9, fontWeight: 600, color: '#0F766E' }}>
            🔄 Delta · {delta.rowCount.toLocaleString()} {sectionLabel}
          </div>
        )}
      </div>
      {/* Data rows */}
      {BREAKDOWN_METRICS.map((m, i) => {
        const isLast = i === BREAKDOWN_METRICS.length - 1;
        const borderB = isLast ? 'none' : '0.5px solid var(--color-border-tertiary)';
        return (
          <div key={m.key} style={{ display: 'grid', gridTemplateColumns: `1.4fr ${'1fr '.repeat(cols - 1).trim()}` }}>
            <div style={{ padding: '4px 10px', borderBottom: borderB, color: 'var(--color-text-secondary)' }}>
              {m.label}
            </div>
            {hasOneTime && (
              <div style={{ padding: '4px 10px', borderLeft: '0.5px solid var(--color-border-tertiary)', borderBottom: borderB, fontWeight: 500, color: m.color }}>
                {(oneTime[m.key] || 0).toLocaleString()}
              </div>
            )}
            {hasDelta && (
              <div style={{ padding: '4px 10px', borderLeft: '0.5px solid var(--color-border-tertiary)', borderBottom: borderB, fontWeight: 500, color: m.color }}>
                {(delta[m.key] || 0).toLocaleString()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RagSection({ borderColor, titleColor, title, badge, children }) {
  return (
    <div style={{ borderLeft: `3px solid ${borderColor}`, paddingLeft: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
        <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: titleColor, whiteSpace: 'nowrap' }}>
          {title}
        </div>
        {badge}
      </div>
      {children}
    </div>
  );
}

// ─── Detail layout: section label ────────────────────────────────────────────

function SectionLabel({ icon, text, badge }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
      <i className={`ti ${icon}`} style={{ fontSize: 14, lineHeight: 1 }} />
      <span style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
        {text}
      </span>
      <div style={{ flex: 1, height: '0.5px', background: 'var(--color-border-tertiary)' }} />
      {badge}
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
  const [timeline,        setTimeline]        = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineOpen,    setTimelineOpen]    = useState(false);
  const [activeTab,       setActiveTab]       = useState(
    project?.channels?.hasDelta ? 'delta' : 'onetime'
  );

  const fetchTimeline = async () => {
    try {
      setTimelineLoading(true);
      const res = await api.get(`/api/projects/timeline/${project.id}`);
      setTimeline(res.data?.timeline || []);
    } catch (err) {
      console.error('[Timeline] Error:', err.message);
    } finally {
      setTimelineLoading(false);
    }
  };

  const handleTimelineToggle = async () => {
    const newState = !timelineOpen;
    setTimelineOpen(newState);
    if (newState && timeline.length === 0) {
      await fetchTimeline();
    }
  };

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
    const ch   = project.channels  || {};
    const dms  = project.dms       || {};
    const dmts = project.dmToSpace || {};
    const showDmsDetail       = project.config?.showDms       !== false;
    const showDmToSpaceDetail = project.config?.showDmToSpace === true;
    const diffData            = project.diff;

    // ── Tab support ────────────────────────────────────────────────────────
    const showChTabs  = !!(ch.oneTime?.rowCount  > 0) && !!(ch.delta?.rowCount  > 0);
    const showDmsTabs = !!(dms.oneTime?.rowCount > 0) && !!(dms.delta?.rowCount > 0);
    const showAnyTabs = showChTabs || showDmsTabs;

    const tabChSrc  = showChTabs  ? (activeTab === 'onetime' ? ch.oneTime  : ch.delta)  : null;
    const tabDmsSrc = showDmsTabs ? (activeTab === 'onetime' ? dms.oneTime : dms.delta) : null;

    // Resolved display data: tab-specific when tabs exist, overall otherwise
    const dispCh = tabChSrc ? {
      total: tabChSrc.rowCount, completed: tabChSrc.completed, inProgress: tabChSrc.inProgress,
      conflict: tabChSrc.conflict, noMessage: tabChSrc.noMessage, notProcessed: tabChSrc.notProcessed,
      processedWithConflict: tabChSrc.processedWithConflict,
      processedCount: tabChSrc.processedCount, inProgressCount: tabChSrc.inProgressCount,
      conflictCount: tabChSrc.conflictCount, notProcessedCount: tabChSrc.notProcessedCount,
    } : ch;

    const dispDms = tabDmsSrc ? {
      total: tabDmsSrc.rowCount, completed: tabDmsSrc.completed, inProgress: tabDmsSrc.inProgress,
      conflict: tabDmsSrc.conflict, noMessage: tabDmsSrc.noMessage, notProcessed: tabDmsSrc.notProcessed,
      processedWithConflict: tabDmsSrc.processedWithConflict,
      processedCount: tabDmsSrc.processedCount, inProgressCount: tabDmsSrc.inProgressCount,
      conflictCount: tabDmsSrc.conflictCount, notProcessedCount: tabDmsSrc.notProcessedCount,
    } : dms;

    const multiInit = (showChTabs && activeTab === 'onetime' && ch.oneTime?.multipleInitiations) || [];

    const pct = (total, val) => total > 0 ? Math.round(((val || 0) / total) * 100) : 0;

    const dmtsDiffTextDetail  = !diffData || !diffData.hasEnoughData
      ? (diffData?.message ?? null)
      : diffData.dmToSpaceMessage || null;
    const dmtsDiffColorDetail = !diffData || !diffData.hasEnoughData
      ? 'var(--color-text-tertiary)'
      : (diffData.dmToSpaceDiff ?? 0) === 0 ? '#A32D2D' : '#3B6D11';

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

          {/* ── ONE-TIME / DELTA TAB SWITCHER ── */}
          {showAnyTabs && (
            <div style={{ display: 'flex', gap: 0, marginBottom: 18, borderBottom: '1.5px solid var(--color-border-tertiary)' }}>
              {[
                { key: 'onetime', label: '1× One-Time', count: showChTabs ? ch.oneTime.rowCount : null, activeColor: '#5B21B6', activeBorder: '#5B21B6' },
                { key: 'delta',   label: '🔄 Delta',    count: showChTabs ? ch.delta.rowCount   : null, activeColor: '#0F766E', activeBorder: '#0D9488' },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    padding: '8px 18px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                    background: 'transparent',
                    color: activeTab === tab.key ? tab.activeColor : 'var(--color-text-secondary)',
                    borderBottom: activeTab === tab.key ? `2px solid ${tab.activeBorder}` : '2px solid transparent',
                    marginBottom: -1.5, transition: 'all 0.15s',
                  }}>
                  {tab.label}
                  {tab.count !== null && (
                    <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 400, opacity: 0.7 }}>
                      {tab.count.toLocaleString()} ch
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* ── CHANNELS ── */}
          <div>
            <SectionLabel icon="ti-layout-grid" text="Channel status" badge={showAnyTabs ? null : <DeltaBadge hasDelta={ch.hasDelta} />} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 }}>
              <WorkspaceBox bg="#E6F1FB" border="#B5D4F4" icon="ti-stack-2" iconColor="#185FA5" numColor="#185FA5" labelColor="#0C447C" label="Total" value={dispCh.total} barColor="#378ADD" barPct={100} />
              <WorkspaceBox bg="#EAF3DE" border="#C0DD97" icon="ti-circle-check" iconColor="#3B6D11" numColor="#3B6D11" labelColor="#27500A" label="Completed" value={dispCh.completed} barColor="#1D9E75" barPct={pct(dispCh.total, dispCh.completed)} />
              <WorkspaceBox bg="#FDF4E7" border="#F5D89A" icon="ti-circle-check-filled" iconColor="#854F0B" numColor="#854F0B" labelColor="#633806" label="Proc. w/ Conflict" value={dispCh.processedWithConflict} barColor="#BA7517" barPct={pct(dispCh.total, dispCh.processedWithConflict)} />
              <ConflictTooltip databaseId={project.id} projectName={project.projectName} count={dispCh.conflict}>
                <WorkspaceBox bg="#FCEBEB" border="#F7C1C1" icon="ti-alert-triangle" iconColor="#A32D2D" numColor="#A32D2D" labelColor="#791F1F" label="Conflict" value={dispCh.conflict} barColor="#E24B4A" barPct={pct(dispCh.total, dispCh.conflict)} />
              </ConflictTooltip>
              <WorkspaceBox bg="#FAEEDA" border="#FAC775" icon="ti-loader" iconColor="#854F0B" numColor="#854F0B" labelColor="#633806" label="In Progress" value={dispCh.inProgress} barColor="#BA7517" barPct={pct(dispCh.total, dispCh.inProgress)} />
              <WorkspaceBox bg="var(--color-background-secondary)" border="var(--color-border-tertiary)" icon="ti-message-off" iconColor="var(--color-text-tertiary)" numColor="var(--color-text-secondary)" labelColor="var(--color-text-secondary)" label="No Message" value={dispCh.noMessage} barColor="#888780" barPct={pct(dispCh.total, dispCh.noMessage)} />
              <WorkspaceBox bg="#F5F3FF" border="#DDD6FE" icon="ti-clock-pause" iconColor="#5B21B6" numColor="#5B21B6" labelColor="#4C1D95" label="Not Processed" value={dispCh.notProcessed} barColor="#7C3AED" barPct={pct(dispCh.total, dispCh.notProcessed)} />
            </div>

            {/* Channels initiated more than once — one-time tab only */}
            {multiInit.length > 0 && (
              <div style={{ marginTop: 10, border: '0.5px solid #FCD34D', borderRadius: 8, overflow: 'hidden', background: '#FFFBEB' }}>
                <div style={{ padding: '6px 12px', borderBottom: '0.5px solid #FCD34D', fontSize: 10, fontWeight: 600, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  ⚠ {multiInit.length} channel{multiInit.length !== 1 ? 's' : ''} initiated more than once
                </div>
                <div style={{ padding: '8px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {multiInit.map((c, i) => (
                    <span key={i} style={{ fontSize: 11, background: '#FEF3C7', border: '0.5px solid #FCD34D', borderRadius: 6, padding: '2px 8px', color: '#78350F' }}>
                      {c.name} <strong>×{c.count}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ marginTop: 14 }}>
            <SectionLabel icon="ti-messages" text="Channel msg count" badge={showAnyTabs ? null : <DeltaBadge hasDelta={ch.hasDelta} />} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <MessageBox bg="#EAF3DE" border="#C0DD97" icon="ti-checks" iconColor="#3B6D11" numColor="#3B6D11" labelColor="#27500A" label="Processed" value={dispCh.processedCount} subText={chDiffText} subColor={chDiffColor} />
              <MessageBox bg="#FAEEDA" border="#FAC775" icon="ti-loader" iconColor="#854F0B" numColor="#854F0B" labelColor="#633806" label="In Progress" value={dispCh.inProgressCount} subText="" subColor="" />
              <MessageBox bg="#FCEBEB" border="#F7C1C1" icon="ti-alert-circle" iconColor="#A32D2D" numColor="#A32D2D" labelColor="#791F1F" label="Conflict" value={dispCh.conflictCount} subText={dispCh.conflictCount > 0 ? 'needs attention' : 'all clear'} subColor={dispCh.conflictCount > 0 ? '#A32D2D' : '#3B6D11'} />
              <MessageBox bg="var(--color-background-secondary)" border="var(--color-border-tertiary)" icon="ti-clock-pause" iconColor="var(--color-text-tertiary)" numColor="var(--color-text-secondary)" labelColor="var(--color-text-secondary)" label="Not Processed" value={dispCh.notProcessedCount} subText="" subColor="" />
            </div>
          </div>

          {/* ── DMS (only if showDms) ── */}
          {showDmsDetail && (<>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 14px' }}>
              <div style={{ flex: 1, height: '0.5px', background: 'var(--color-border-tertiary)' }} />
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#7F77DD', whiteSpace: 'nowrap' }}>Direct Messages</span>
              <div style={{ flex: 1, height: '0.5px', background: 'var(--color-border-tertiary)' }} />
            </div>
            <div>
              <SectionLabel icon="ti-message-circle" text="DMS status" badge={showAnyTabs ? null : <DeltaBadge hasDelta={dms.hasDelta} />} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 }}>
                <WorkspaceBox bg="#EEEDFE" border="#C4C0F7" icon="ti-stack-2" iconColor="#534AB7" numColor="#534AB7" labelColor="#26215C" label="Total" value={dispDms.total} barColor="#7F77DD" barPct={100} />
                <WorkspaceBox bg="#EAF3DE" border="#C0DD97" icon="ti-circle-check" iconColor="#3B6D11" numColor="#3B6D11" labelColor="#27500A" label="Completed" value={dispDms.completed} barColor="#1D9E75" barPct={pct(dispDms.total, dispDms.completed)} />
                <WorkspaceBox bg="#FDF4E7" border="#F5D89A" icon="ti-circle-check-filled" iconColor="#854F0B" numColor="#854F0B" labelColor="#633806" label="Proc. w/ Conflict" value={dispDms.processedWithConflict} barColor="#BA7517" barPct={pct(dispDms.total, dispDms.processedWithConflict)} />
                <ConflictTooltip databaseId={project.id} projectName={project.projectName} count={dispDms.conflict}>
                  <WorkspaceBox bg="#FCEBEB" border="#F7C1C1" icon="ti-alert-triangle" iconColor="#A32D2D" numColor="#A32D2D" labelColor="#791F1F" label="Conflict" value={dispDms.conflict} barColor="#E24B4A" barPct={pct(dispDms.total, dispDms.conflict)} />
                </ConflictTooltip>
                <WorkspaceBox bg="#FAEEDA" border="#FAC775" icon="ti-loader" iconColor="#854F0B" numColor="#854F0B" labelColor="#633806" label="In Progress" value={dispDms.inProgress} barColor="#BA7517" barPct={pct(dispDms.total, dispDms.inProgress)} />
                <WorkspaceBox bg="var(--color-background-secondary)" border="var(--color-border-tertiary)" icon="ti-message-off" iconColor="var(--color-text-tertiary)" numColor="var(--color-text-secondary)" labelColor="var(--color-text-secondary)" label="No Message" value={dispDms.noMessage} barColor="#888780" barPct={pct(dispDms.total, dispDms.noMessage)} />
                <WorkspaceBox bg="#F5F3FF" border="#DDD6FE" icon="ti-clock-pause" iconColor="#5B21B6" numColor="#5B21B6" labelColor="#4C1D95" label="Not Processed" value={dispDms.notProcessed} barColor="#7C3AED" barPct={pct(dispDms.total, dispDms.notProcessed)} />
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <SectionLabel icon="ti-messages" text="DMS msg count" badge={showAnyTabs ? null : <DeltaBadge hasDelta={dms.hasDelta} />} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                <MessageBox bg="#EAF3DE" border="#C0DD97" icon="ti-checks" iconColor="#3B6D11" numColor="#3B6D11" labelColor="#27500A" label="Processed" value={dispDms.processedCount} subText={dmsDiffText} subColor={dmsDiffColor} />
                <MessageBox bg="#FAEEDA" border="#FAC775" icon="ti-loader" iconColor="#854F0B" numColor="#854F0B" labelColor="#633806" label="In Progress" value={dispDms.inProgressCount} subText="" subColor="" />
                <MessageBox bg="#FCEBEB" border="#F7C1C1" icon="ti-alert-circle" iconColor="#A32D2D" numColor="#A32D2D" labelColor="#791F1F" label="Conflict" value={dispDms.conflictCount} subText={dispDms.conflictCount > 0 ? 'needs attention' : 'all clear'} subColor={dispDms.conflictCount > 0 ? '#A32D2D' : '#3B6D11'} />
                <MessageBox bg="var(--color-background-secondary)" border="var(--color-border-tertiary)" icon="ti-clock-pause" iconColor="var(--color-text-tertiary)" numColor="var(--color-text-secondary)" labelColor="var(--color-text-secondary)" label="Not Processed" value={dispDms.notProcessedCount} subText="" subColor="" />
              </div>
            </div>
          </>)}

          {/* ── DM → Space (only if showDmToSpace) ── */}
          {showDmToSpaceDetail && (<>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 14px' }}>
              <div style={{ flex: 1, height: '0.5px', background: 'var(--color-border-tertiary)' }} />
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#0D9488', whiteSpace: 'nowrap' }}>DM → Space Migration</span>
              <div style={{ flex: 1, height: '0.5px', background: 'var(--color-border-tertiary)' }} />
            </div>
            <div>
              <SectionLabel icon="ti-arrows-right-left" text="DM → Space status" badge={<DeltaBadge hasDelta={dmts.hasDelta} />} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
                <WorkspaceBox bg="#CCFBF1" border="#99F6E4" icon="ti-stack-2" iconColor="#0D9488" numColor="#0D9488" labelColor="#0F766E" label="Total" value={dmts.total} barColor="#0D9488" barPct={100} />
                <WorkspaceBox bg="#EAF3DE" border="#C0DD97" icon="ti-circle-check" iconColor="#3B6D11" numColor="#3B6D11" labelColor="#27500A" label="Completed" value={dmts.completed} barColor="#1D9E75" barPct={pct(dmts.total, dmts.completed)} />
                <WorkspaceBox bg="#FDF4E7" border="#F5D89A" icon="ti-circle-check-filled" iconColor="#854F0B" numColor="#854F0B" labelColor="#633806" label="Proc. w/ Conflict" value={dmts.processedWithConflict} barColor="#BA7517" barPct={pct(dmts.total, dmts.processedWithConflict)} />
                <WorkspaceBox bg="#FCEBEB" border="#F7C1C1" icon="ti-alert-triangle" iconColor="#A32D2D" numColor="#A32D2D" labelColor="#791F1F" label="Conflict" value={dmts.conflict} barColor="#E24B4A" barPct={pct(dmts.total, dmts.conflict)} />
                <WorkspaceBox bg="#FAEEDA" border="#FAC775" icon="ti-loader" iconColor="#854F0B" numColor="#854F0B" labelColor="#633806" label="In Progress" value={dmts.inProgress} barColor="#BA7517" barPct={pct(dmts.total, dmts.inProgress)} />
                <WorkspaceBox bg="var(--color-background-secondary)" border="var(--color-border-tertiary)" icon="ti-message-off" iconColor="var(--color-text-tertiary)" numColor="var(--color-text-secondary)" labelColor="var(--color-text-secondary)" label="No Message" value={dmts.noMessage} barColor="#888780" barPct={pct(dmts.total, dmts.noMessage)} />
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <SectionLabel icon="ti-messages" text="DM → Space msg count" badge={<DeltaBadge hasDelta={dmts.hasDelta} />} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                <MessageBox bg="#CCFBF1" border="#99F6E4" icon="ti-checks" iconColor="#0D9488" numColor="#0D9488" labelColor="#0F766E" label="Processed" value={dmts.processedCount} subText={dmtsDiffTextDetail} subColor={dmtsDiffColorDetail} />
                <MessageBox bg="#FAEEDA" border="#FAC775" icon="ti-loader" iconColor="#854F0B" numColor="#854F0B" labelColor="#633806" label="In Progress" value={dmts.inProgressCount} subText="" subColor="" />
                <MessageBox bg="#FCEBEB" border="#F7C1C1" icon="ti-alert-circle" iconColor="#A32D2D" numColor="#A32D2D" labelColor="#791F1F" label="Conflict" value={dmts.conflictCount} subText={dmts.conflictCount > 0 ? 'needs attention' : 'all clear'} subColor={dmts.conflictCount > 0 ? '#A32D2D' : '#3B6D11'} />
                <MessageBox bg="var(--color-background-secondary)" border="var(--color-border-tertiary)" icon="ti-clock-pause" iconColor="var(--color-text-tertiary)" numColor="var(--color-text-secondary)" labelColor="var(--color-text-secondary)" label="Not Processed" value={dmts.notProcessedCount} subText="" subColor="" />
              </div>
              <MigrationTypeBreakdown oneTime={dmts.oneTime} delta={dmts.delta} sectionLabel="workspaces" />
            </div>
          </>)}

          {/* Migration Progress Timeline — Collapsible */}
          <div style={{ marginTop: 14, border: '0.5px solid var(--color-border-tertiary)', borderRadius: 10, overflow: 'hidden' }}>

            {/* Header — always visible */}
            <div
              onClick={handleTimelineToggle}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', background: timelineOpen ? 'var(--color-background-secondary)' : 'var(--color-background-primary)', cursor: 'pointer', userSelect: 'none', borderBottom: timelineOpen ? '0.5px solid var(--color-border-tertiary)' : 'none', transition: 'background 0.15s' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-chart-line" style={{ fontSize: 13, color: '#185FA5' }} />
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)' }}>Migration Progress</span>
                {!timelineOpen && timeline.length > 0 && (() => {
                  const tenMin = timeline.find(t => t.window === '10 min' && t.available);
                  if (!tenMin) return null;
                  return (
                    <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: tenMin.isStalled ? '#FCEBEB' : '#EAF3DE', color: tenMin.isStalled ? '#791F1F' : '#27500A', border: `0.5px solid ${tenMin.isStalled ? '#F7C1C1' : '#C0DD97'}` }}>
                      {tenMin.isStalled ? '⚠ No change (10min)' : `+${tenMin.totalDiff.toLocaleString()} (10min)`}
                    </span>
                  );
                })()}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {timelineOpen && (
                  <button
                    onClick={e => { e.stopPropagation(); fetchTimeline(); }}
                    disabled={timelineLoading}
                    title="Refresh timeline"
                    style={{ background: 'none', border: 'none', cursor: timelineLoading ? 'not-allowed' : 'pointer', color: 'var(--color-text-tertiary)', padding: 0, display: 'flex', alignItems: 'center' }}
                  >
                    <i className={`ti ${timelineLoading ? 'ti-loader' : 'ti-refresh'}`} style={{ fontSize: 12, animation: timelineLoading ? 'spin 0.8s linear infinite' : 'none' }} />
                  </button>
                )}
                <i className={`ti ti-chevron-${timelineOpen ? 'up' : 'down'}`} style={{ fontSize: 13, color: 'var(--color-text-tertiary)', transition: 'transform 0.2s' }} />
              </div>
            </div>

            {/* Body — only when open */}
            {timelineOpen && (
              <div style={{ padding: '12px 14px', background: 'var(--color-background-secondary)' }}>
                {timelineLoading && timeline.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 16, fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <i className="ti ti-loader" style={{ fontSize: 14, animation: 'spin 0.8s linear infinite' }} />
                    Loading timeline...
                  </div>
                )}
                {!timelineLoading && timeline.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 12, fontSize: 11, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
                    No snapshot data yet. Check back after the next cron run.
                  </div>
                )}
                {timeline.length > 0 && (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {timeline.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', background: item.available && item.isStalled ? '#FCEBEB' : 'var(--color-background-primary)', border: `0.5px solid ${item.available && item.isStalled ? '#F7C1C1' : 'var(--color-border-tertiary)'}`, borderRadius: 7 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 58 }}>
                            <i className="ti ti-clock" style={{ fontSize: 11, color: item.available ? (item.isStalled ? '#A32D2D' : '#185FA5') : 'var(--color-text-tertiary)' }} />
                            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)' }}>{item.window}</span>
                          </div>
                          {item.available ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, justifyContent: 'flex-end' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>CH</span>
                                <span style={{ fontSize: 11, fontWeight: 600, color: item.channelDiff > 0 ? '#3B6D11' : '#A32D2D' }}>
                                  {item.channelDiff > 0 ? `+${item.channelDiff.toLocaleString()}` : '—'}
                                </span>
                              </div>
                              {showDmsDetail && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                  <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>DMS</span>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: item.dmsDiff > 0 ? '#3B6D11' : '#A32D2D' }}>
                                    {item.dmsDiff > 0 ? `+${item.dmsDiff.toLocaleString()}` : '—'}
                                  </span>
                                </div>
                              )}
                              {showDmToSpaceDetail && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                  <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>DTS</span>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: (item.dmToSpaceDiff || 0) > 0 ? '#3B6D11' : '#A32D2D' }}>
                                    {(item.dmToSpaceDiff || 0) > 0 ? `+${item.dmToSpaceDiff.toLocaleString()}` : '—'}
                                  </span>
                                </div>
                              )}
                              <div style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 10, background: item.isStalled ? '#FCEBEB' : '#EAF3DE', color: item.isStalled ? '#791F1F' : '#27500A', border: `0.5px solid ${item.isStalled ? '#F7C1C1' : '#C0DD97'}` }}>
                                {item.isStalled ? '⚠ No change' : `+${item.totalDiff.toLocaleString()} msgs`}
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>Not enough data yet</span>
                          )}
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginTop: 8, textAlign: 'center' }}>
                      CH = Channel &nbsp;|&nbsp; DMS = Direct Messages &nbsp;|&nbsp; DTS = DM → Space &nbsp;|&nbsp; Refreshes every 10 min
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    );
  }

  // ─── LIST LAYOUT ─────────────────────────────────────────────────────────────

  const ch         = project.channels  || {};
  const dms        = project.dms       || {};
  const dmts       = project.dmToSpace || {};
  const showDms       = project.config?.showDms       !== false;
  const showDmToSpace = project.config?.showDmToSpace === true;
  const gridCols      = 2 + (showDms ? 2 : 0) + (showDmToSpace ? 2 : 0);
  const diffData = project.diff;

  const dmtsDiffText  = !diffData || !diffData.hasEnoughData
    ? (diffData?.message ?? null)
    : diffData.dmToSpaceMessage || null;
  const dmtsDiffColor = !diffData || !diffData.hasEnoughData
    ? '#9ca3af'
    : (diffData.dmToSpaceDiff ?? 0) === 0 ? '#E24B4A' : '#3B6D11';
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

  // ── List-layout tab support ──────────────────────────────────────────────────
  const listShowChTabs  = !!(ch.oneTime?.rowCount  > 0) && !!(ch.delta?.rowCount  > 0);
  const listShowDmsTabs = !!(dms.oneTime?.rowCount > 0) && !!(dms.delta?.rowCount > 0);
  const listShowAnyTabs = listShowChTabs || listShowDmsTabs;

  const listTabChSrc  = listShowChTabs  ? (activeTab === 'onetime' ? ch.oneTime  : ch.delta)  : null;
  const listTabDmsSrc = listShowDmsTabs ? (activeTab === 'onetime' ? dms.oneTime : dms.delta) : null;

  const listDispCh = listTabChSrc ? {
    total: listTabChSrc.rowCount, completed: listTabChSrc.completed, inProgress: listTabChSrc.inProgress,
    conflict: listTabChSrc.conflict, noMessage: listTabChSrc.noMessage,
    processedWithConflict: listTabChSrc.processedWithConflict,
    processedCount: listTabChSrc.processedCount, inProgressCount: listTabChSrc.inProgressCount,
    conflictCount: listTabChSrc.conflictCount, notProcessedCount: listTabChSrc.notProcessedCount,
  } : ch;

  const listDispDms = listTabDmsSrc ? {
    total: listTabDmsSrc.rowCount, completed: listTabDmsSrc.completed, inProgress: listTabDmsSrc.inProgress,
    conflict: listTabDmsSrc.conflict, noMessage: listTabDmsSrc.noMessage,
    processedWithConflict: listTabDmsSrc.processedWithConflict,
    processedCount: listTabDmsSrc.processedCount, inProgressCount: listTabDmsSrc.inProgressCount,
    conflictCount: listTabDmsSrc.conflictCount, notProcessedCount: listTabDmsSrc.notProcessedCount,
  } : dms;

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

      {/* ONE-TIME / DELTA TAB SWITCHER — list layout */}
      {listShowAnyTabs && (
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #F3F4F6', padding: '0 16px' }}>
          {[
            { key: 'onetime', label: '1× One-Time', count: listShowChTabs ? ch.oneTime.rowCount : null, activeColor: '#5B21B6', activeBorder: '#5B21B6' },
            { key: 'delta',   label: '🔄 Delta',    count: listShowChTabs ? ch.delta.rowCount   : null, activeColor: '#0F766E', activeBorder: '#0D9488' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '6px 14px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: 'transparent',
                color: activeTab === tab.key ? tab.activeColor : '#6b7280',
                borderBottom: activeTab === tab.key ? `2px solid ${tab.activeBorder}` : '2px solid transparent',
                marginBottom: -1, transition: 'all 0.15s',
              }}>
              {tab.label}
              {tab.count !== null && (
                <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 400, opacity: 0.65 }}>
                  {tab.count.toLocaleString()} ch
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* BODY: dynamic RAG sections */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gridCols}, 1fr)`, gap: 10, padding: '12px 16px' }}>

        {/* SECTION 1 — Channel Status */}
        <RagSection borderColor="#378ADD" titleColor="#185FA5" title="Channel Status" badge={listShowAnyTabs ? null : <DeltaBadge hasDelta={ch.hasDelta} />}>
          <RagRow dot="#2563eb" label="Total"            value={listDispCh.total}                />
          <RagRow dot="#16a34a" label="Completed"         value={listDispCh.completed}            />
          <RagRow dot="#d97706" label="Proc. w/ Conflict" value={listDispCh.processedWithConflict} />
          <ConflictTooltip databaseId={project.id} projectName={project.projectName} count={listDispCh.conflict}>
            <RagRow dot="#dc2626" label="Conflict"        value={listDispCh.conflict}             />
          </ConflictTooltip>
          <RagRow dot="#d97706" label="In Progress"       value={listDispCh.inProgress}           />
          <RagRow dot="#6b7280" label="No Message"        value={listDispCh.noMessage}            />
          <RagRow dot="#5B21B6" label="Not Processed"     value={listDispCh.notProcessed}         />
        </RagSection>

        {/* SECTION 2 — Channel Msg Count */}
        <RagSection borderColor="#5a9e2f" titleColor="#3B6D11" title="Channel Msg Count" badge={listShowAnyTabs ? null : <DeltaBadge hasDelta={ch.hasDelta} />}>
          <RagRow dot="#16a34a" label="Processed"    value={listDispCh.processedCount}    large subText={chDiffText} subColor={chDiffColor} />
          <RagRow dot="#d97706" label="In Progress"  value={listDispCh.inProgressCount}   />
          <RagRow dot="#dc2626" label="Conflict"     value={listDispCh.conflictCount}     />
          <RagRow dot="#6b7280" label="Not Processed" value={listDispCh.notProcessedCount} />
        </RagSection>

        {/* SECTION 3 & 4 — DMS (only if showDms) */}
        {showDms && (
          <RagSection borderColor="#7F77DD" titleColor="#534AB7" title="DMS Status" badge={listShowAnyTabs ? null : <DeltaBadge hasDelta={dms.hasDelta} />}>
            <RagRow dot="#7F77DD" label="Total"            value={listDispDms.total}                />
            <RagRow dot="#16a34a" label="Completed"         value={listDispDms.completed}            />
            <RagRow dot="#d97706" label="Proc. w/ Conflict" value={listDispDms.processedWithConflict} />
            <ConflictTooltip databaseId={project.id} projectName={project.projectName} count={listDispDms.conflict}>
              <RagRow dot="#dc2626" label="Conflict"        value={listDispDms.conflict}             />
            </ConflictTooltip>
            <RagRow dot="#d97706" label="In Progress"       value={listDispDms.inProgress}           />
            <RagRow dot="#6b7280" label="No Message"        value={listDispDms.noMessage}            />
            <RagRow dot="#5B21B6" label="Not Processed"     value={listDispDms.notProcessed}         />
          </RagSection>
        )}
        {showDms && (
          <RagSection borderColor="#BA7517" titleColor="#854F0B" title="DMS Msg Count" badge={listShowAnyTabs ? null : <DeltaBadge hasDelta={dms.hasDelta} />}>
            <RagRow dot="#16a34a" label="Processed"    value={listDispDms.processedCount}    large subText={dmsDiffText} subColor={dmsDiffColor} />
            <RagRow dot="#d97706" label="In Progress"  value={listDispDms.inProgressCount}   />
            <RagRow dot="#dc2626" label="Conflict"     value={listDispDms.conflictCount}     />
            <RagRow dot="#6b7280" label="Not Processed" value={listDispDms.notProcessedCount} />
          </RagSection>
        )}

        {/* SECTION 5 & 6 — DM → Space (only if showDmToSpace) */}
        {showDmToSpace && (
          <RagSection borderColor="#0D9488" titleColor="#0F766E" title="DM → Space Status" badge={<DeltaBadge hasDelta={dmts.hasDelta} />}>
            <RagRow dot="#0D9488" label="Total"            value={dmts.total}                />
            <RagRow dot="#16a34a" label="Completed"         value={dmts.completed}            />
            <RagRow dot="#d97706" label="Proc. w/ Conflict" value={dmts.processedWithConflict} />
            <RagRow dot="#dc2626" label="Conflict"          value={dmts.conflict}             />
            <RagRow dot="#d97706" label="In Progress"       value={dmts.inProgress}           />
            <RagRow dot="#6b7280" label="No Message"        value={dmts.noMessage}            />
          </RagSection>
        )}
        {showDmToSpace && (
          <RagSection borderColor="#0D9488" titleColor="#0F766E" title="DM → Space Msgs" badge={<DeltaBadge hasDelta={dmts.hasDelta} />}>
            <RagRow dot="#16a34a" label="Processed"     value={dmts.processedCount}    large subText={dmtsDiffText} subColor={dmtsDiffColor} />
            <RagRow dot="#d97706" label="In Progress"   value={dmts.inProgressCount}   />
            <RagRow dot="#dc2626" label="Conflict"      value={dmts.conflictCount} />
            <RagRow dot="#6b7280" label="Not Processed" value={dmts.notProcessedCount} />
          </RagSection>
        )}

      </div>

      {/* Migration Progress Timeline — Collapsible */}
      <div style={{ margin: '0 16px 14px', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 10, overflow: 'hidden' }}>

        {/* Header — always visible */}
        <div
          onClick={handleTimelineToggle}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', background: timelineOpen ? 'var(--color-background-secondary)' : 'var(--color-background-primary)', cursor: 'pointer', userSelect: 'none', borderBottom: timelineOpen ? '0.5px solid var(--color-border-tertiary)' : 'none', transition: 'background 0.15s' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-chart-line" style={{ fontSize: 13, color: '#185FA5' }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)' }}>Migration Progress</span>
            {!timelineOpen && timeline.length > 0 && (() => {
              const tenMin = timeline.find(t => t.window === '10 min' && t.available);
              if (!tenMin) return null;
              return (
                <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: tenMin.isStalled ? '#FCEBEB' : '#EAF3DE', color: tenMin.isStalled ? '#791F1F' : '#27500A', border: `0.5px solid ${tenMin.isStalled ? '#F7C1C1' : '#C0DD97'}` }}>
                  {tenMin.isStalled ? '⚠ No change (10min)' : `+${tenMin.totalDiff.toLocaleString()} (10min)`}
                </span>
              );
            })()}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {timelineOpen && (
              <button
                onClick={e => { e.stopPropagation(); fetchTimeline(); }}
                disabled={timelineLoading}
                title="Refresh timeline"
                style={{ background: 'none', border: 'none', cursor: timelineLoading ? 'not-allowed' : 'pointer', color: 'var(--color-text-tertiary)', padding: 0, display: 'flex', alignItems: 'center' }}
              >
                <i className={`ti ${timelineLoading ? 'ti-loader' : 'ti-refresh'}`} style={{ fontSize: 12, animation: timelineLoading ? 'spin 0.8s linear infinite' : 'none' }} />
              </button>
            )}
            <i className={`ti ti-chevron-${timelineOpen ? 'up' : 'down'}`} style={{ fontSize: 13, color: 'var(--color-text-tertiary)', transition: 'transform 0.2s' }} />
          </div>
        </div>

        {/* Body — only when open */}
        {timelineOpen && (
          <div style={{ padding: '12px 14px', background: 'var(--color-background-secondary)' }}>
            {timelineLoading && timeline.length === 0 && (
              <div style={{ textAlign: 'center', padding: 16, fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <i className="ti ti-loader" style={{ fontSize: 14, animation: 'spin 0.8s linear infinite' }} />
                Loading timeline...
              </div>
            )}
            {!timelineLoading && timeline.length === 0 && (
              <div style={{ textAlign: 'center', padding: 12, fontSize: 11, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
                No snapshot data yet. Check back after the next cron run.
              </div>
            )}
            {timeline.length > 0 && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {timeline.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', background: item.available && item.isStalled ? '#FCEBEB' : 'var(--color-background-primary)', border: `0.5px solid ${item.available && item.isStalled ? '#F7C1C1' : 'var(--color-border-tertiary)'}`, borderRadius: 7 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 58 }}>
                        <i className="ti ti-clock" style={{ fontSize: 11, color: item.available ? (item.isStalled ? '#A32D2D' : '#185FA5') : 'var(--color-text-tertiary)' }} />
                        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)' }}>{item.window}</span>
                      </div>
                      {item.available ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, justifyContent: 'flex-end' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>CH</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: item.channelDiff > 0 ? '#3B6D11' : '#A32D2D' }}>
                              {item.channelDiff > 0 ? `+${item.channelDiff.toLocaleString()}` : '—'}
                            </span>
                          </div>
                          {showDms && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>DMS</span>
                              <span style={{ fontSize: 11, fontWeight: 600, color: item.dmsDiff > 0 ? '#3B6D11' : '#A32D2D' }}>
                                {item.dmsDiff > 0 ? `+${item.dmsDiff.toLocaleString()}` : '—'}
                              </span>
                            </div>
                          )}
                          {showDmToSpace && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>DTS</span>
                              <span style={{ fontSize: 11, fontWeight: 600, color: (item.dmToSpaceDiff || 0) > 0 ? '#3B6D11' : '#A32D2D' }}>
                                {(item.dmToSpaceDiff || 0) > 0 ? `+${item.dmToSpaceDiff.toLocaleString()}` : '—'}
                              </span>
                            </div>
                          )}
                          <div style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 10, background: item.isStalled ? '#FCEBEB' : '#EAF3DE', color: item.isStalled ? '#791F1F' : '#27500A', border: `0.5px solid ${item.isStalled ? '#F7C1C1' : '#C0DD97'}` }}>
                            {item.isStalled ? '⚠ No change' : `+${item.totalDiff.toLocaleString()} msgs`}
                          </div>
                        </div>
                      ) : (
                        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>Not enough data yet</span>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginTop: 8, textAlign: 'center' }}>
                  CH = Channel &nbsp;|&nbsp; DMS = Direct Messages &nbsp;|&nbsp; DTS = DM → Space &nbsp;|&nbsp; Refreshes every 10 min
                </div>
              </>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
