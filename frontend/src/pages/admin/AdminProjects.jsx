import { useState, useEffect } from 'react';
import axios from 'axios';
import AdminLayout from './AdminLayout';
import useAuth from '../../hooks/useAuth';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const MIGRATION_TYPES = [
  { value: 'messaging', label: 'Messaging' },
  { value: 'email',     label: 'Email' },
  { value: 'content',   label: 'Content' },
];

const CLOUD_SOURCES = {
  messaging: ['Slack', 'Google Chat', 'Teams'],
  email:     ['Gmail', 'Outlook'],
  content:   ['SharePoint', 'OneDrive', 'Google Drive'],
};

const EMPTY_FORM = {
  projectName:        '',
  metabaseDatabaseId: '',
  migrationType:      '',
  cloudSource:        '',
  combinationType:    '',
  teamsWebhookUrl:    '',
  alertEmail:         '',
};

function authHeaders() {
  const t = window.__authToken;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

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
      const res = await axios.get(`${API}/api/admin/projects`, { headers: authHeaders() });
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
      migrationType:      p.migrationType      || '',
      cloudSource:        p.cloudSource        || '',
      combinationType:    p.combinationType    || '',
      teamsWebhookUrl:    p.teamsWebhookUrl    || '',
      alertEmail:         p.alertEmail         || '',
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
        await axios.put(`${API}/api/admin/projects/${editingId}`, payload, { headers: authHeaders() });
        setSuccess('Project updated.');
      } else {
        await axios.post(`${API}/api/admin/projects`, payload, { headers: authHeaders() });
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

  async function handleDelete(p) {
    if (!window.confirm(`Delete "${p.projectName}"? This will hide it from the dashboard.`)) return;
    setError('');
    try {
      await axios.delete(`${API}/api/admin/projects/${p._id}`, { headers: authHeaders() });
      setSuccess(`"${p.projectName}" removed.`);
      await fetchProjects();
    } catch (e) {
      setError(e.response?.data?.error || 'Delete failed');
    }
  }

  const cloudOptions = CLOUD_SOURCES[form.migrationType] || [];

  return (
    <AdminLayout>
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

              {/* Cloud Source */}
              <div>
                <label style={labelStyle}>Cloud Source</label>
                <select
                  value={form.cloudSource}
                  onChange={e => setField('cloudSource', e.target.value)}
                  disabled={!form.migrationType}
                  style={{ ...inputStyle, opacity: form.migrationType ? 1 : 0.5 }}
                >
                  <option value="">— select source —</option>
                  {cloudOptions.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {!form.migrationType && (
                  <p style={helpStyle}>Select a migration type first.</p>
                )}
              </div>

              {/* Combination Type */}
              <div>
                <label style={labelStyle}>Combination Type</label>
                <input
                  value={form.combinationType}
                  onChange={e => setField('combinationType', e.target.value)}
                  placeholder="e.g. Slack → Teams"
                  style={inputStyle}
                />
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
              <div>
                <label style={labelStyle}>Alert Email</label>
                <input
                  type="email"
                  value={form.alertEmail}
                  onChange={e => setField('alertEmail', e.target.value)}
                  placeholder="alerts@company.com"
                  style={inputStyle}
                />
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
                    {['Project Name', 'DB ID', 'Type', 'Cloud Source', 'Combination', ''].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p, i) => (
                    <tr key={p._id} style={{ background: editingId === p._id ? '#EFF6FF' : i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
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
                        {p.cloudSource
                          ? <span style={{ fontSize: 12, color: '#374151' }}>{p.cloudSource}</span>
                          : <span style={{ color: '#d1d5db' }}>—</span>}
                      </td>
                      <td style={tdStyle}>
                        {p.combinationType
                          ? <span style={{ fontSize: 12, color: '#6b7280' }}>{p.combinationType}</span>
                          : <span style={{ color: '#d1d5db' }}>—</span>}
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
    </AdminLayout>
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
