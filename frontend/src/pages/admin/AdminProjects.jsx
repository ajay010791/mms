import { useState, useEffect } from 'react';
import api from '../../utils/axios';
import useAuth from '../../hooks/useAuth';

const PLATFORMS = ['Slack', 'Google Chat', 'Teams', 'Meta'];

const MIGRATION_TYPES = [
  { value: 'messaging', label: 'Messaging' },
  { value: 'email',     label: 'Email' },
  { value: 'content',   label: 'Content' },
];

const STATUS_OPTIONS = [
  { value: 'active',   label: 'Active',   color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  { value: 'inactive', label: 'Inactive', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  { value: 'on_hold',  label: 'On Hold',  color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
];

const getStatusMeta = v => STATUS_OPTIONS.find(s => s.value === v) || STATUS_OPTIONS[0];

const EMPTY_FORM = {
  projectName:        '',
  metabaseDatabaseId: '',
  projectId:          '',
  source:             '',
  destination:        '',
  migrationType:      '',
  teamsWebhookUrl:    '',
  alertEmail:         '',
  status:             'active',
  showDms:            false,
  showDmToSpace:      false,
  alertsEnabled:      true,
  alertChannels:      false,
  alertDms:           false,
  alertDmToSpace:     false,
};

export default function AdminProjects() {
  const { user } = useAuth();
  const [projects, setProjects]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');

  useEffect(() => { fetchProjects(); }, []);

  async function fetchProjects() {
    setLoading(true);
    try {
      const res = await api.get('/api/admin/projects');
      setProjects(res.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }

  function setField(name, value) {
    setForm(f => {
      const next = { ...f, [name]: value };
      // Reset cloud source when migration type changes
      if (name === 'migrationType') next.cloudSource = '';
      return next;
    });
  }

  function startEdit(p) {
    setEditingId(p._id);
    setForm({
      projectName:        p.projectName        || '',
      metabaseDatabaseId: p.metabaseDatabaseId != null ? String(p.metabaseDatabaseId) : '',
      projectId:          p.projectId          || '',
      source:             p.source             || '',
      destination:        p.destination        || '',
      migrationType:      p.migrationType      || '',
      teamsWebhookUrl:    p.teamsWebhookUrl    || '',
      alertEmail:         p.alertEmail         || '',
      status:             p.status             || 'active',
      showDms:            p.showDms            !== false,
      showDmToSpace:      p.showDmToSpace      === true,
      alertsEnabled:      p.alertsEnabled      !== false,
      alertChannels:      p.alertChannels      !== false,
      alertDms:           p.alertDms           !== false,
      alertDmToSpace:     p.alertDmToSpace     !== false,
    });
    setError('');
    setSuccess('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const payload = {
        ...form,
        metabaseDatabaseId: Number(form.metabaseDatabaseId),
      };
      if (editingId) {
        await api.put(`/api/admin/projects/${editingId}`, payload);
        setSuccess('Project updated.');
      } else {
        await api.post('/api/admin/projects', payload);
        setSuccess('Project added.');
      }
      setEditingId(null);
      setForm(EMPTY_FORM);
      await fetchProjects();
    } catch (e) {
      setError(e.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(p, newStatus) {
    setError('');
    try {
      await api.put(`/api/admin/projects/${p._id}`, { status: newStatus });
      await fetchProjects();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to update status');
    }
  }

  async function handleToggleSection(p, field) {
    setError('');
    try {
      await api.put(`/api/admin/projects/${p._id}`, { [field]: p[field] === false });
      await fetchProjects();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to update alert setting');
    }
  }

  async function handleDelete(p) {
    if (!window.confirm(`Delete "${p.projectName}"? This will hide it from the dashboard.`)) return;
    setError('');
    try {
      await api.delete(`/api/admin/projects/${p._id}`);
      setSuccess(`"${p.projectName}" removed.`);
      await fetchProjects();
    } catch (e) {
      setError(e.response?.data?.error || 'Delete failed');
    }
  }

  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ maxWidth: 820 }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>Projects</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
            Each project maps to a Metabase database. Live data is fetched using the Database ID.
          </p>
        </div>

        {/* Form card */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginTop: 0, marginBottom: 20 }}>
            {editingId ? 'Edit Project' : 'Add Project'}
          </h2>

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px' }}>

              {/* Project Name */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Project Name *</label>
                <input
                  value={form.projectName}
                  onChange={e => setField('projectName', e.target.value)}
                  required
                  placeholder="e.g. Acme Corp — Slack to Teams"
                  style={inputStyle}
                />
              </div>

              {/* Metabase Database ID */}
              <div>
                <label style={labelStyle}>Metabase Database ID *</label>
                <input
                  type="number"
                  min="1"
                  value={form.metabaseDatabaseId}
                  onChange={e => setField('metabaseDatabaseId', e.target.value)}
                  required
                  placeholder="e.g. 42"
                  style={inputStyle}
                />
                <p style={helpStyle}>
                  Find it in Metabase: Admin → Databases → click your database → the ID is in the URL: <code style={{ fontSize: 11 }}>/database/[ID]</code>
                </p>
              </div>

              {/* Project ID */}
              <div>
                <label style={labelStyle}>Project ID *</label>
                <input
                  value={form.projectId}
                  onChange={e => setField('projectId', e.target.value)}
                  required
                  placeholder="e.g. PROJ-001"
                  style={inputStyle}
                />
                <p style={helpStyle}>Internal identifier for this project.</p>
              </div>

              {/* Project Status */}
              <div>
                <label style={labelStyle}>Project Status</label>
                <select
                  value={form.status}
                  onChange={e => setField('status', e.target.value)}
                  style={{
                    ...inputStyle,
                    color:      getStatusMeta(form.status).color,
                    fontWeight: 500,
                    border:     `1px solid ${getStatusMeta(form.status).border}`,
                    background: getStatusMeta(form.status).bg,
                    cursor: 'pointer'
                  }}
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <p style={helpStyle}>Inactive / On Hold: hidden from dashboard, no Metabase hits.</p>
              </div>

              {/* Migration Type */}
              <div>
                <label style={labelStyle}>Migration Type *</label>
                <select
                  value={form.migrationType}
                  onChange={e => setField('migrationType', e.target.value)}
                  required
                  style={inputStyle}
                >
                  <option value="">— select type —</option>
                  {MIGRATION_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Source Platform */}
              <div>
                <label style={labelStyle}>Source Platform *</label>
                <select
                  value={form.source}
                  onChange={e => setField('source', e.target.value)}
                  required
                  style={inputStyle}
                >
                  <option value="">— select source —</option>
                  {PLATFORMS.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <p style={helpStyle}>Platform messages are migrating FROM.</p>
              </div>

              {/* Destination Platform */}
              <div>
                <label style={labelStyle}>Destination Platform *</label>
                <select
                  value={form.destination}
                  onChange={e => setField('destination', e.target.value)}
                  required
                  style={inputStyle}
                >
                  <option value="">— select destination —</option>
                  {PLATFORMS.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <p style={helpStyle}>Platform messages are migrating TO.</p>
              </div>

              {/* Teams Webhook URL */}
              <div>
                <label style={labelStyle}>Teams Webhook URL</label>
                <input
                  value={form.teamsWebhookUrl}
                  onChange={e => setField('teamsWebhookUrl', e.target.value)}
                  placeholder="https://outlook.office.com/webhook/..."
                  style={inputStyle}
                />
                <p style={helpStyle}>Incoming webhook URL for this project's Teams alert channel.</p>
              </div>

              {/* Alert Email */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Alert Email(s)</label>
                <input
                  type="text"
                  value={form.alertEmail}
                  onChange={e => setField('alertEmail', e.target.value)}
                  placeholder="alerts@company.com, manager@company.com, team@company.com"
                  style={inputStyle}
                />
                <p style={helpStyle}>Separate multiple addresses with a comma. All listed addresses will receive stall and conflict alerts for this project.</p>
              </div>

            </div>

            {/* MessageWorkSpace Configuration */}
            <div style={{ marginTop: 22, borderTop: '1px solid #F3F4F6', paddingTop: 18 }}>
              <div style={{ marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>MessageWorkSpace Column Config</span>
                <p style={{ ...helpStyle, marginTop: 3 }}>
                  Main table: <code style={{ fontSize: 11 }}>MessageWorkSpace</code>. Select which column sections to include for this project.
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* DirectOrGroupMessage */}
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', padding: '12px 14px', border: `1px solid ${form.showDms ? '#BFDBFE' : '#E5E7EB'}`, borderRadius: 8, background: form.showDms ? '#EFF6FF' : '#FAFAFA' }}>
                  <input
                    type="checkbox"
                    checked={form.showDms}
                    onChange={e => setField('showDms', e.target.checked)}
                    style={{ marginTop: 2, accentColor: '#2563eb', width: 15, height: 15, flexShrink: 0 }}
                  />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', marginBottom: 2 }}>
                      DirectOrGroupMessage — Include DM Records
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>
                      When <strong>enabled</strong>: rows where <code style={{ fontSize: 10 }}>DirectOrGroupMessage = True</code> are pulled and shown as the <em>Direct Messages</em> section.<br />
                      When <strong>disabled</strong>: DMS section is hidden for this project.
                    </div>
                  </div>
                </label>

                {/* DmToSpace */}
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', padding: '12px 14px', border: `1px solid ${form.showDmToSpace ? '#D1FAE5' : '#E5E7EB'}`, borderRadius: 8, background: form.showDmToSpace ? '#F0FDF4' : '#FAFAFA' }}>
                  <input
                    type="checkbox"
                    checked={form.showDmToSpace}
                    onChange={e => setField('showDmToSpace', e.target.checked)}
                    style={{ marginTop: 2, accentColor: '#16a34a', width: 15, height: 15, flexShrink: 0 }}
                  />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', marginBottom: 2 }}>
                      DmToSpace — Include DM → Space Migration
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>
                      When <strong>enabled</strong>: rows where <code style={{ fontSize: 10 }}>DmToSpace = True</code> are pulled and shown as a separate <em>DM → Space</em> section.<br />
                      When <strong>disabled</strong>: DM → Space section is hidden for this project.
                    </div>
                  </div>
                </label>

              </div>
            </div>

            {/* Alert Notifications */}
            <div style={{ marginTop: 22, borderTop: '1px solid #F3F4F6', paddingTop: 18 }}>
              <div style={{ marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Alert Notifications per Section</span>
                <p style={{ ...helpStyle, marginTop: 3 }}>
                  Disable alerts for sections that have not been initiated yet. Stall and conflict alerts will only fire for enabled sections.
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                {/* Channels */}
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', padding: '10px 14px', border: `1px solid ${form.alertChannels ? '#BFDBFE' : '#E5E7EB'}`, borderRadius: 8, background: form.alertChannels ? '#EFF6FF' : '#FAFAFA' }}>
                  <input
                    type="checkbox"
                    checked={form.alertChannels}
                    onChange={e => setField('alertChannels', e.target.checked)}
                    style={{ marginTop: 2, accentColor: '#2563eb', width: 15, height: 15, flexShrink: 0 }}
                  />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', marginBottom: 2 }}>
                      Channels — Alert on stall or conflict
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>
                      Send alerts when channel migration stalls or has conflicts.
                    </div>
                  </div>
                </label>

                {/* DMs */}
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', padding: '10px 14px', border: `1px solid ${form.alertDms ? '#D1FAE5' : '#E5E7EB'}`, borderRadius: 8, background: form.alertDms ? '#F0FDF4' : '#FAFAFA' }}>
                  <input
                    type="checkbox"
                    checked={form.alertDms}
                    onChange={e => setField('alertDms', e.target.checked)}
                    style={{ marginTop: 2, accentColor: '#16a34a', width: 15, height: 15, flexShrink: 0 }}
                  />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', marginBottom: 2 }}>
                      Direct Messages — Alert on stall or conflict
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>
                      Disable if DM migration has not been initiated yet to avoid false stall alerts.
                    </div>
                  </div>
                </label>

                {/* DmToSpace */}
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', padding: '10px 14px', border: `1px solid ${form.alertDmToSpace ? '#CCFBF1' : '#E5E7EB'}`, borderRadius: 8, background: form.alertDmToSpace ? '#F0FDFA' : '#FAFAFA' }}>
                  <input
                    type="checkbox"
                    checked={form.alertDmToSpace}
                    onChange={e => setField('alertDmToSpace', e.target.checked)}
                    style={{ marginTop: 2, accentColor: '#0d9488', width: 15, height: 15, flexShrink: 0 }}
                  />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', marginBottom: 2 }}>
                      DM → Space — Alert on stall or conflict
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>
                      Disable if DM→Space migration has not been initiated yet.
                    </div>
                  </div>
                </label>

              </div>
            </div>

            {/* Feedback */}
            {error && (
              <div style={{ marginTop: 14, padding: '8px 12px', borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 12, color: '#dc2626' }}>
                {error}
              </div>
            )}
            {success && (
              <div style={{ marginTop: 14, padding: '8px 12px', borderRadius: 6, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 12, color: '#16a34a' }}>
                {success}
              </div>
            )}

            <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
              <button type="submit" disabled={saving} style={primaryBtn}>
                {saving ? 'Saving…' : editingId ? 'Update Project' : 'Add Project'}
              </button>
              {editingId && (
                <button type="button" onClick={cancelEdit} style={secondaryBtn}>Cancel</button>
              )}
            </div>
          </form>
        </div>

        {/* Project table */}
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
              {loading ? 'Loading…' : `${projects.length} project${projects.length !== 1 ? 's' : ''}`}
            </span>
          </div>

          {!loading && projects.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>
              No projects yet. Add one above.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#F9FAFB' }}>
                    {['Project Name', 'DB ID', 'Type', 'Source → Destination', 'Sections', 'Alerts', 'Status', ''].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p, i) => (
                    <tr key={p._id} style={{
                      background: editingId === p._id ? '#EFF6FF' : i % 2 === 0 ? '#fff' : '#FAFAFA',
                      opacity: (p.status === 'inactive' || p.status === 'on_hold') ? 0.6 : 1
                    }}>
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 500, color: '#111827' }}>{p.projectName}</span>
                      </td>
                      <td style={tdStyle}>
                        <code style={{ background: '#F3F4F6', padding: '2px 7px', borderRadius: 4, fontSize: 12, color: '#374151' }}>
                          {p.metabaseDatabaseId}
                        </code>
                      </td>
                      <td style={tdStyle}>
                        <TypeBadge type={p.migrationType} />
                      </td>
                      <td style={tdStyle}>
                        {p.source || p.destination
                          ? <span style={{ fontSize: 12, color: '#374151' }}>{p.source || '?'} → {p.destination || '?'}</span>
                          : <span style={{ color: '#d1d5db' }}>—</span>}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {p.showDms !== false && (
                            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: '#EFF6FF', color: '#1d4ed8', border: '1px solid #BFDBFE' }}>DMS</span>
                          )}
                          {p.showDmToSpace === true && (
                            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: '#F0FDF4', color: '#15803d', border: '1px solid #BBF7D0' }}>DM→Space</span>
                          )}
                          {p.showDms === false && p.showDmToSpace !== true && (
                            <span style={{ fontSize: 10, color: '#9ca3af' }}>CH only</span>
                          )}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {[
                            { field: 'alertChannels',  label: 'CH',  title: 'Channel alerts' },
                            { field: 'alertDms',        label: 'DM',  title: 'Direct Message alerts' },
                            { field: 'alertDmToSpace',  label: 'DTS', title: 'DM→Space alerts' },
                          ].map(({ field, label, title }) => {
                            const on = p[field] !== false;
                            return (
                              <button
                                key={field}
                                onClick={() => handleToggleSection(p, field)}
                                title={`${title}: ${on ? 'ON — click to disable' : 'OFF — click to enable'}`}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  padding: '2px 7px', borderRadius: 10,
                                  border: `1px solid ${on ? '#bbf7d0' : '#e5e7eb'}`,
                                  background: on ? '#f0fdf4' : '#f9fafb',
                                  color: on ? '#16a34a' : '#9ca3af',
                                  fontSize: 10, fontWeight: 500, cursor: 'pointer'
                                }}
                              >
                                <i className={`ti ${on ? 'ti-bell' : 'ti-bell-off'}`} style={{ fontSize: 10 }} />
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        {(() => {
                          const sm = getStatusMeta(p.status || 'active');
                          return (
                            <select
                              value={p.status || 'active'}
                              onChange={e => handleStatusChange(p, e.target.value)}
                              style={{
                                padding: '3px 8px', borderRadius: 10,
                                border: `1px solid ${sm.border}`,
                                background: sm.bg, color: sm.color,
                                fontSize: 11, fontWeight: 600,
                                cursor: 'pointer', outline: 'none'
                              }}
                            >
                              {STATUS_OPTIONS.map(s => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                              ))}
                            </select>
                          );
                        })()}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button onClick={() => startEdit(p)} style={iconBtn('#2563eb')}>Edit</button>
                        <button onClick={() => handleDelete(p)} style={{ ...iconBtn('#dc2626'), marginLeft: 6 }}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

function TypeBadge({ type }) {
  const map = {
    messaging: { bg: '#E0F2FE', color: '#075985', label: 'Messaging' },
    email:     { bg: '#EDE9FE', color: '#4C1D95', label: 'Email' },
    content:   { bg: '#DCFCE7', color: '#166534', label: 'Content' },
  };
  const c = map[type] || { bg: '#F3F4F6', color: '#374151', label: type };
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 500, background: c.bg, color: c.color }}>
      {c.label}
    </span>
  );
}

const cardStyle = {
  background: '#fff', border: '1px solid #E5E7EB',
  borderRadius: 10, padding: '24px 28px',
  marginBottom: 28, boxShadow: '0 1px 6px rgba(0,0,0,0.05)'
};

const labelStyle = { display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 5 };
const helpStyle  = { fontSize: 11, color: '#9ca3af', marginTop: 4, marginBottom: 0 };

const inputStyle = {
  width: '100%', padding: '8px 10px',
  border: '1px solid #E5E7EB', borderRadius: 7,
  fontSize: 13, color: '#111827', background: '#fff',
  outline: 'none', boxSizing: 'border-box'
};

const primaryBtn   = { padding: '9px 20px', borderRadius: 7, border: 'none', background: '#1f2937', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const secondaryBtn = { padding: '9px 20px', borderRadius: 7, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const thStyle      = { padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #E5E7EB' };
const tdStyle      = { padding: '11px 16px', borderBottom: '1px solid #F3F4F6', verticalAlign: 'middle' };
const iconBtn      = (color) => ({ padding: '4px 10px', borderRadius: 5, border: `1px solid ${color}20`, background: `${color}10`, color, fontSize: 12, fontWeight: 500, cursor: 'pointer' });
