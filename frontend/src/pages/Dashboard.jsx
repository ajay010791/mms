import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import TopBar from '../components/TopBar';
import ProjectCard from '../components/ProjectCard';
import TimeFilter from '../components/TimeFilter';
import ProjectDropdown from '../components/ProjectDropdown';
import useProjects, { useProjectLiveData } from '../hooks/useProjects';
import useAuth from '../hooks/useAuth';
import api from '../utils/axios';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sortConfigs(configs, sort) {
  return [...configs].sort((a, b) => {
    if (sort === 'az') return a.projectName.localeCompare(b.projectName);
    if (sort === 'za') return b.projectName.localeCompare(a.projectName);
    const aDate = new Date(a.updatedAt || 0);
    const bDate = new Date(b.updatedAt || 0);
    if (sort === 'date-asc') return aDate - bDate;
    return bDate - aDate;
  });
}

// Merge a MongoDB config + live API response into the shape ProjectCard expects
function mergeProject(config, live) {
  const base = {
    id:             String(config.metabaseDatabaseId),
    projectName:    config.projectName,
    migrationType:  config.migrationType,
    cloudSource:    config.cloudSource    || '',
    combinationType:config.combinationType|| '',
    createdAt:      config.updatedAt,
    metabaseDatabaseId: config.metabaseDatabaseId,
    // backward-compat
    project_name:   config.projectName,
    type:           config.migrationType,
  };
  const emptySection = () => ({ total: 0, completed: 0, processedWithConflict: 0, conflict: 0, inProgress: 0, noMessage: 0, processedCount: 0, inProgressCount: 0, notProcessedCount: 0, conflictCount: 0 });
  if (!live) {
    return {
      ...base,
      channels: emptySection(),
      dms:      emptySection(),
      diff:     { isStalled: false, diff: null, hasEnoughData: false, message: null },
    };
  }
  return { ...base, ...live };
}

// ─── Summary box ──────────────────────────────────────────────────────────────

const SUMMARY_CFG = {
  messaging: { gradient: 'linear-gradient(135deg, #1a5fa8 0%, #2980d9 100%)', border: '#1a5fa8', icon: 'ti-message-2', title: 'Messaging', sub: 'Slack · Google Chat · Teams' },
  email:     { gradient: 'linear-gradient(135deg, #4a3db5 0%, #7b6fe0 100%)', border: '#4a3db5', icon: 'ti-mail',      title: 'Email',     sub: 'Gmail · Outlook' },
  content:   { gradient: 'linear-gradient(135deg, #2d7a2d 0%, #4caf50 100%)', border: '#2d7a2d', icon: 'ti-files',     title: 'Content',   sub: 'SharePoint · OneDrive · Google Drive' },
};

function AnimatedCount({ value, loading }) {
  const [displayed, setDisplayed] = useState(0);
  const rafRef = useRef(null);
  useEffect(() => {
    if (loading) { setDisplayed(0); return; }
    const target = value || 0;
    const duration = 800;
    const startTime = performance.now();
    const animate = (ts) => {
      const progress = Math.min((ts - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(target * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value, loading]);
  if (loading) return <>--</>;
  return <>{displayed.toLocaleString()}</>;
}

function SummaryBox({ type, stats, loading, onClick, isActive }) {
  const [hovered, setHovered] = useState(false);
  const cfg = SUMMARY_CFG[type];
  const s   = stats || { count: 0, active: 0, stalled: 0, conflict: 0 };
  return (
    <div onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ position: 'relative', overflow: 'hidden', background: cfg.gradient, border: `1.5px solid ${cfg.border}`, borderRadius: 14, padding: '20px 24px', cursor: onClick ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 20, transition: 'transform 0.15s ease', transform: hovered && onClick ? 'translateY(-2px)' : 'translateY(0)', outline: isActive ? '2px solid rgba(255,255,255,0.55)' : 'none', outlineOffset: isActive ? -3 : 0 }}>
      <i className={`ti ${cfg.icon}`} style={{ position: 'absolute', right: -10, top: '50%', transform: 'translateY(-50%)', fontSize: 80, opacity: 0.08, color: 'white', pointerEvents: 'none' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
          <i className={`ti ${cfg.icon}`} style={{ fontSize: 22, color: 'white' }} />
        </div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.85)', marginBottom: 2 }}>{cfg.title} projects</div>
        <div style={{ fontSize: 32, fontWeight: 500, color: 'white', lineHeight: 1, marginBottom: 2 }}>
          <AnimatedCount value={s.count} loading={loading} />
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>{cfg.sub}</div>
      </div>
      <div style={{ width: 1, height: 60, background: 'rgba(255,255,255,0.2)', flexShrink: 0 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[{ num: loading ? '--' : s.active, label: 'Active' }, { num: loading ? '--' : s.stalled, label: 'Stalled' }, { num: loading ? '--' : s.conflict, label: 'Conflict' }].map(({ num, label }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: 'white' }}>{num}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.65)' }}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', bottom: 12, right: 14, fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>View all →</div>
    </div>
  );
}

// ─── Time filter options ──────────────────────────────────────────────────────

const TIME_OPTIONS = [
  { label: 'Now',        value: 'now',  minutes: 0    },
  { label: '2 hrs ago',  value: '2hr',  minutes: 120  },
  { label: '6 hrs ago',  value: '6hr',  minutes: 360  },
  { label: '24 hrs ago', value: '24hr', minutes: 1440 }
];

// ─── Per-card live data wrapper (list view) ───────────────────────────────────

function LiveProjectCard({ config, token, onLoaded, historicalSnapshot, isHistorical, historicalTime }) {
  const { data, loading, error, refetch } = useProjectLiveData(config.metabaseDatabaseId);

  useEffect(() => {
    if (data && onLoaded) onLoaded(config.metabaseDatabaseId, data);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) {
    return (
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '18px 20px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#111827', marginBottom: 4 }}>{config.projectName}</div>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>Fetching live data from Metabase…</div>
        </div>
        <div style={{ width: 18, height: 18, border: '2px solid #E5E7EB', borderTop: '2px solid #378ADD', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: 10, padding: '14px 20px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        <i className="ti ti-wifi-off" style={{ fontSize: 18, color: '#dc2626', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{config.projectName}</div>
          <div style={{ fontSize: 12, color: '#dc2626' }}>{error}</div>
        </div>
        <button onClick={refetch} style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer' }}>Retry</button>
      </div>
    );
  }

  const displayData = isHistorical ? (historicalSnapshot || data) : data;

  return (
    <ProjectCard
      key={config.metabaseDatabaseId}
      project={mergeProject(config, displayData)}
      token={token}
      layout="list"
      isHistorical={isHistorical && !!historicalSnapshot}
      historicalTime={historicalTime}
      onRefresh={refetch}
    />
  );
}

// ─── Empty / loading / error states ──────────────────────────────────────────

function LoadingState() {
  return (
    <div style={{ textAlign: 'center', padding: '60px 24px' }}>
      <div style={{ width: 28, height: 28, border: '2.5px solid #E5E7EB', borderTop: '2.5px solid #378ADD', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
      <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>Loading projects…</p>
    </div>
  );
}

function ErrorState({ error, onRetry }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 24px' }}>
      <i className="ti ti-wifi-off" style={{ fontSize: 36, color: '#dc2626', display: 'block', marginBottom: 12 }} />
      <div style={{ fontSize: 15, fontWeight: 500, color: '#111827', marginBottom: 4 }}>Could not load projects</div>
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
        Check your MongoDB connection or Admin → Projects configuration.
      </div>
      {error && <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>{error}</div>}
      <button onClick={onRetry} style={{ padding: '6px 16px', fontSize: 13, borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', cursor: 'pointer' }}>Retry</button>
    </div>
  );
}

function NoProjects() {
  return (
    <div style={{ textAlign: 'center', padding: '60px 24px', background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB' }}>
      <i className="ti ti-database-off" style={{ fontSize: 36, color: '#d1d5db', display: 'block', marginBottom: 12 }} />
      <div style={{ fontSize: 15, fontWeight: 500, color: '#374151', marginBottom: 4 }}>No projects configured</div>
      <div style={{ fontSize: 13, color: '#6b7280' }}>
        Add projects in <a href="/admin/projects" style={{ color: '#2563eb' }}>Admin → Projects</a> to see live data here.
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { token } = useAuth();
  const { projects: projectConfigs, loading: configsLoading, error: configsError, refetch: refetchConfigs, lastFetched } = useProjects(0);

  const [layout, setLayout]               = useState('list');
  const [selectedType, setSelectedType]   = useState('messaging');
  const [sort, setSort]                   = useState('date-desc');
  const [sortBy, setSortBy]               = useState('name');
  const [sortDir, setSortDir]             = useState('asc');
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [timeFilter, setTimeFilter]         = useState('now');
  const [historicalData, setHistoricalData] = useState({});
  const [selectedProject, setSelectedProject] = useState(null);
  const [projectData, setProjectData]         = useState({});
  const [now, setNow]                     = useState(new Date());
  const [liveDataMap, setLiveDataMap]     = useState({});

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchHistoricalData = async (databaseId, minutesAgo) => {
    if (minutesAgo === 0) return null;
    try {
      const res = await api.get(`/api/projects/snapshot/${databaseId}?minutesAgo=${minutesAgo}`);
      return res.data;
    } catch (err) {
      console.log(`[TimeFilter] No snapshot at ${minutesAgo} min:`, err.message);
      return null;
    }
  };

  const handleTimeFilterChange = async (value) => {
    setTimeFilter(value);
    if (value === 'now') {
      setHistoricalData({});
      return;
    }
    const option = TIME_OPTIONS.find(o => o.value === value);
    if (!option) return;
    const loadedIds = Object.keys(liveDataMap);
    for (const dbId of loadedIds) {
      const snap = await fetchHistoricalData(dbId, option.minutes);
      if (snap) {
        setHistoricalData(prev => ({ ...prev, [dbId]: snap }));
      }
    }
  };

  const handleTypeClick = useCallback((type) => {
    if (layout === 'detail') {
      setSelectedType(type);
      setSelectedProject(null);
    }
  }, [layout]);

  // ── Stats by type — derived from live data when available ────────────────────
  const statsByType = useMemo(() => {
    const result = {};
    for (const type of ['messaging', 'email', 'content']) {
      const typed = projectConfigs.filter(p => p.migrationType === type);
      let active = 0, stalled = 0, conflict = 0;
      for (const p of typed) {
        const live = liveDataMap[p.metabaseDatabaseId];
        if (live) {
          const isStalled   = live.diff?.isStalled === true;
          const hasConflict = (live.channels?.conflict || 0) > 0 || (live.dms?.conflict || 0) > 0;
          if (isStalled) stalled++;
          if (hasConflict) conflict++;
          if (!isStalled && !hasConflict) active++;
        }
      }
      result[type] = { count: typed.length, active, stalled, conflict };
    }
    return result;
  }, [projectConfigs, liveDataMap]);

  // ── Sorted configs for list view ──────────────────────────────────────────
  const sortedConfigs = useMemo(() => sortConfigs(projectConfigs, sort), [projectConfigs, sort]);

  // ── Detail view ───────────────────────────────────────────────────────────
  const detailConfigs = useMemo(
    () => projectConfigs.filter(p => p.migrationType === selectedType),
    [projectConfigs, selectedType]
  );

  const detailDropdownProjects = useMemo(
    () => detailConfigs.map(p => ({ id: String(p.metabaseDatabaseId), projectName: p.projectName, migrationType: p.migrationType, cloudSource: p.cloudSource || '', source: p.source || '', destination: p.destination || '' })),
    [detailConfigs]
  );

  const loadProjectData = async (databaseId) => {
    const id = Number(databaseId);
    console.log('[Dashboard] Loading data for DB:', id);
    setProjectData(prev => ({ ...prev, [id]: { status: 'loading', data: null, error: null } }));
    try {
      const res = await api.get(`/api/projects/live/${id}`);
      console.log('[Dashboard] Data loaded for DB:', id, res.data);
      setProjectData(prev => ({ ...prev, [id]: { status: 'loaded', data: res.data, error: null, loadedAt: new Date() } }));
    } catch (err) {
      console.error('[Dashboard] Load error for DB:', id, err.message);
      setProjectData(prev => ({ ...prev, [id]: { status: 'error', data: null, error: err.response?.data?.error || err.message } }));
    }
  };

  const getSortedProjects = (projectList) => {
    if (!projectList?.length) return [];
    return [...projectList].sort((a, b) => {
      if (sortBy === 'date') {
        const aDate = new Date(a.createdAt || 0);
        const bDate = new Date(b.createdAt || 0);
        return sortDir === 'asc' ? aDate - bDate : bDate - aDate;
      }
      const aName = (a.projectName || '').toLowerCase();
      const bName = (b.projectName || '').toLowerCase();
      return sortDir === 'asc' ? aName.localeCompare(bName) : bName.localeCompare(aName);
    });
  };

  const handleRefreshAll = async () => {
    if (refreshingAll) return;
    setRefreshingAll(true);
    try {
      const toRefresh = projectConfigs.filter(p =>
        projectData[p.metabaseDatabaseId]?.status === 'loaded'
      );
      const list = toRefresh.length > 0 ? toRefresh : projectConfigs;
      await Promise.allSettled(list.map(p => loadProjectData(p.metabaseDatabaseId)));
      toast.success(`Refreshed ${list.length} project(s) ✓`);
    } catch (err) {
      toast.error('Refresh failed');
    } finally {
      setRefreshingAll(false);
    }
  };

  const handleProjectSelect = async (project) => {
    console.log('[Detail] Project selected:', project.projectName, 'DB ID:', project.metabaseDatabaseId);
    setSelectedProject(project);
    const existing = projectData[project.metabaseDatabaseId];
    console.log('[Detail] Existing data status:', existing?.status || 'none');
    await loadProjectData(project.metabaseDatabaseId);
  };

  const exportAll = useCallback(async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/reports/all`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      const html2pdf = (await import('html2pdf.js')).default;
      const html = `<div style="font-family:Arial,sans-serif;padding:20px;"><h1 style="color:#2563eb;">Migration Monitor — All Projects Report</h1><p>Generated: ${new Date(data.generatedAt).toLocaleString()}</p><hr/>${(data.reports || []).map(r => `<h3>${r.project_name}</h3><p>Type: ${r.type} | Progress: ${r.progress}% | Status: ${r.status}</p><p>Processed: ${(r.processed_count || 0).toLocaleString()} | Conflict: ${(r.conflict || 0).toLocaleString()}</p><hr/>`).join('')}</div>`;
      html2pdf().set({ filename: 'all-projects-report.pdf' }).from(html).save();
      toast.success('Exporting all projects…');
    } catch {
      toast.error('Export failed');
    }
  }, [token]);

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <TopBar layout={layout} onLayoutChange={setLayout} onExportAll={exportAll} />

      <div style={{ padding: '20px 24px', maxWidth: 1200, margin: '0 auto' }}>

        {/* Summary boxes */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
          {['messaging', 'email', 'content'].map(type => (
            <SummaryBox
              key={type}
              type={type}
              stats={statsByType[type]}
              loading={configsLoading}
              onClick={layout === 'detail' ? () => handleTypeClick(type) : null}
              isActive={layout === 'detail' && selectedType === type}
            />
          ))}
        </div>

        {/* ── LIST VIEW ── */}
        {layout === 'list' && (
          <>
            {configsLoading ? (
              <LoadingState />
            ) : configsError ? (
              <ErrorState error={configsError} onRetry={refetchConfigs} />
            ) : sortedConfigs.length === 0 ? (
              <NoProjects />
            ) : (
              <>
                {timeFilter !== 'now' && (
                  <div style={{ background: '#FAEEDA', border: '0.5px solid #FAC775', borderRadius: '8px', padding: '8px 14px', marginBottom: '12px', fontSize: '12px', color: '#633806', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ti ti-clock" style={{ fontSize: '14px' }} />
                    Showing data from {TIME_OPTIONS.find(o => o.value === timeFilter)?.label}
                    {' '}— click &quot;Now&quot; to return to live data
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', padding: '10px 14px', background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Sort:</span>
                    <button
                      onClick={() => { if (sortBy === 'name') { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); } else { setSortBy('name'); setSortDir('asc'); } }}
                      style={{ padding: '4px 10px', fontSize: '11px', border: '0.5px solid var(--color-border-secondary)', borderRadius: '6px', cursor: 'pointer', background: sortBy === 'name' ? '#185FA5' : 'var(--color-background-primary)', color: sortBy === 'name' ? 'white' : 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: sortBy === 'name' ? '500' : '400' }}
                    >
                      <i className="ti ti-sort-a-z" style={{ fontSize: '12px' }} />
                      A–Z
                      {sortBy === 'name' && <i className={`ti ti-arrow-${sortDir === 'asc' ? 'up' : 'down'}`} style={{ fontSize: '10px' }} />}
                    </button>
                    <button
                      onClick={() => { if (sortBy === 'date') { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); } else { setSortBy('date'); setSortDir('desc'); } }}
                      style={{ padding: '4px 10px', fontSize: '11px', border: '0.5px solid var(--color-border-secondary)', borderRadius: '6px', cursor: 'pointer', background: sortBy === 'date' ? '#185FA5' : 'var(--color-background-primary)', color: sortBy === 'date' ? 'white' : 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: sortBy === 'date' ? '500' : '400' }}
                    >
                      <i className="ti ti-calendar" style={{ fontSize: '12px' }} />
                      Date
                      {sortBy === 'date' && <i className={`ti ti-arrow-${sortDir === 'asc' ? 'up' : 'down'}`} style={{ fontSize: '10px' }} />}
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                      {projectConfigs.length} project{projectConfigs.length !== 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={handleRefreshAll}
                      disabled={refreshingAll}
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', background: refreshingAll ? '#6B9DC4' : '#185FA5', border: 'none', borderRadius: '7px', color: 'white', fontSize: '11px', fontWeight: '500', cursor: refreshingAll ? 'not-allowed' : 'pointer' }}
                    >
                      <i className={`ti ${refreshingAll ? 'ti-loader' : 'ti-refresh'}`} style={{ fontSize: '13px', animation: refreshingAll ? 'spin 0.8s linear infinite' : 'none' }} />
                      {refreshingAll ? 'Refreshing...' : 'Refresh All'}
                    </button>
                  </div>
                </div>
                {getSortedProjects(projectConfigs).map(config => (
                  <LiveProjectCard
                    key={config._id}
                    config={config}
                    token={token}
                    onLoaded={(dbId, live) => setLiveDataMap(prev => ({ ...prev, [dbId]: live }))}
                    historicalSnapshot={historicalData[config.metabaseDatabaseId]}
                    isHistorical={timeFilter !== 'now'}
                    historicalTime={TIME_OPTIONS.find(o => o.value === timeFilter)?.label || ''}
                  />
                ))}
              </>
            )}
          </>
        )}

        {/* ── DETAIL VIEW ── */}
        {layout === 'detail' && (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', padding: '10px 14px', background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '10px' }}>
                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="ti ti-layout-grid" style={{ fontSize: '13px', color: '#185FA5' }} />
                  {projectConfigs.length} project{projectConfigs.length !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={handleRefreshAll}
                  disabled={refreshingAll}
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', background: refreshingAll ? '#6B9DC4' : '#185FA5', border: 'none', borderRadius: '7px', color: 'white', fontSize: '11px', fontWeight: '500', cursor: refreshingAll ? 'not-allowed' : 'pointer' }}
                >
                  <i className={`ti ${refreshingAll ? 'ti-loader' : 'ti-refresh'}`} style={{ fontSize: '13px', animation: refreshingAll ? 'spin 0.8s linear infinite' : 'none' }} />
                  {refreshingAll ? 'Refreshing...' : 'Refresh All'}
                </button>
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Select project ({selectedType})
              </div>
              <ProjectDropdown
                projects={detailDropdownProjects}
                selectedId={selectedProject ? String(selectedProject.metabaseDatabaseId) : null}
                onSelect={id => {
                  if (!id) { setSelectedProject(null); return; }
                  const config = detailConfigs.find(p => String(p.metabaseDatabaseId) === id);
                  if (config) handleProjectSelect(config);
                  else setSelectedProject(null);
                }}
              />
            </div>

            {configsLoading ? (
              <LoadingState />
            ) : configsError ? (
              <ErrorState error={configsError} onRetry={refetchConfigs} />
            ) : !selectedProject ? (
              <div style={{ textAlign: 'center', padding: '80px 24px', color: '#9ca3af' }}>
                <div style={{ fontSize: 36, marginBottom: 16, opacity: 0.35, lineHeight: 1 }}>↑</div>
                <div style={{ fontSize: 15, fontWeight: 500, color: '#6b7280' }}>
                  Select a project above to view live Metabase data
                </div>
                {detailDropdownProjects.length === 0 && (
                  <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 8 }}>
                    No {selectedType} projects configured. <a href="/admin/projects" style={{ color: '#2563eb' }}>Add one in Admin</a>.
                  </div>
                )}
              </div>
            ) : (() => {
              const dbId     = Number(selectedProject.metabaseDatabaseId);
              const entry    = projectData[dbId];
              const status   = entry?.status || 'idle';
              const liveData = entry?.data   || null;
              const error    = entry?.error  || null;

              console.log('[Detail] Rendering project card:', {
                project: selectedProject.projectName,
                dbId,
                status,
                hasData: !!liveData,
                error
              });

              return (
                <div>
                  {status === 'loading' && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px', background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '12px', gap: '12px' }}>
                      <div style={{ width: '36px', height: '36px', border: '3px solid #E6F1FB', borderTop: '3px solid #185FA5', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                        Fetching live data from Metabase...
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                        Database ID: {dbId}
                      </div>
                    </div>
                  )}

                  {status === 'error' && (
                    <div style={{ padding: '32px', background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '12px', textAlign: 'center' }}>
                      <i className="ti ti-wifi-off" style={{ fontSize: '32px', color: '#A32D2D', display: 'block', marginBottom: '12px' }} />
                      <div style={{ fontSize: '13px', fontWeight: '500', color: '#791F1F', marginBottom: '8px' }}>
                        Failed to load project data
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '16px', padding: '8px 12px', background: '#FCEBEB', borderRadius: '6px' }}>
                        {error}
                      </div>
                      <button
                        onClick={() => loadProjectData(dbId)}
                        style={{ padding: '8px 16px', background: '#185FA5', color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: '12px', fontWeight: '500', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <i className="ti ti-refresh" style={{ fontSize: '13px' }} />
                        Retry
                      </button>
                    </div>
                  )}

                  {status === 'loaded' && liveData && (
                    <ProjectCard
                      project={mergeProject(selectedProject, liveData)}
                      layout="detail"
                      onRefresh={() => loadProjectData(dbId)}
                    />
                  )}

                  {status === 'idle' && (
                    <div style={{ padding: '48px', textAlign: 'center', background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '12px' }}>
                      <i className="ti ti-database" style={{ fontSize: '28px', color: 'var(--color-text-tertiary)', display: 'block', marginBottom: '8px' }} />
                      <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                        Loading data...
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )}

      </div>
    </div>
  );
}
