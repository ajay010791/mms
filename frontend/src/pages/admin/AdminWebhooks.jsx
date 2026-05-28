import { useState, useEffect } from 'react';
import api from '../../utils/axios';
import toast from 'react-hot-toast';

const PLATFORMS = ['Slack', 'Google Chat', 'Teams', 'Meta'];

const PLATFORM_COLORS = {
  'Slack':       { bg: '#E8F5E9', color: '#1B5E20' },
  'Google Chat': { bg: '#E3F2FD', color: '#0D47A1' },
  'Teams':       { bg: '#EDE7F6', color: '#4527A0' },
  'Meta':        { bg: '#E3F2FD', color: '#1565C0' },
};

const emptyForm = {
  projectName:        '',
  metabaseDatabaseId: '',
  projectId:          '',
  source:             '',
  destination:        '',
  teamsWebhookUrl:    '',
  alertEmail:         ''
};

export default function AdminWebhooks() {
  const [projects, setProjects]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm]           = useState(emptyForm);
  const [saving, setSaving]       = useState(false);
  const [testingId, setTestingId] = useState(null);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const res = await api.get('/api/admin/projects');
      console.log('[AdminWebhooks] Projects received:', res.data);
      console.log('[AdminWebhooks] Count:', res.data?.length);
      setProjects(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('[AdminWebhooks] Fetch error:', err);
      toast.error('Failed to load projects: ' + err.message);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProjects(); }, []);

  const handleSave = async () => {
    if (!form.projectName.trim())       { toast.error('Project name is required');       return; }
    if (!form.metabaseDatabaseId)       { toast.error('Metabase ID is required');        return; }
    if (!form.projectId.trim())         { toast.error('Project ID is required');         return; }
    if (!form.source)                   { toast.error('Source platform is required');    return; }
    if (!form.destination)              { toast.error('Destination platform is required'); return; }

    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/api/admin/projects/${editingId}`, form);
        toast.success('Project updated ✓');
      } else {
        await api.post('/api/admin/projects', form);
        toast.success('Project added ✓');
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      fetchProjects();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (project) => {
    setForm({
      projectName:        project.projectName,
      metabaseDatabaseId: project.metabaseDatabaseId,
      projectId:          project.projectId          || '',
      source:             project.source             || '',
      destination:        project.destination        || '',
      teamsWebhookUrl:    project.teamsWebhookUrl    || '',
      alertEmail:         project.alertEmail         || ''
    });
    setEditingId(project._id);
    setShowForm(true);
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Remove "${name}" from monitoring?`)) return;
    try {
      await api.delete(`/api/admin/projects/${id}`);
      toast.success('Project removed');
      fetchProjects();
    } catch (err) {
      toast.error('Delete failed');
    }
  };

  const handleReactivate = async (id) => {
    try {
      await api.put(`/api/admin/projects/${id}`, { isActive: true });
      toast.success('Project reactivated ✓');
      fetchProjects();
    } catch (err) {
      toast.error('Failed to reactivate');
    }
  };

  const handleTestWebhook = async (project) => {
    if (!project.teamsWebhookUrl) {
      toast.error('No webhook URL configured for this project');
      return;
    }
    setTestingId(project._id);
    try {
      await api.post('/api/admin/test/webhook', {
        webhookUrl:  project.teamsWebhookUrl,
        projectName: project.projectName
      });
      toast.success('Test message sent to Teams ✓');
    } catch (err) {
      toast.error('Webhook test failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setTestingId(null);
    }
  };

  const getProjectStatus = (project) => {
    if (project.teamsWebhookUrl && project.alertEmail)
      return { label: 'Fully configured', bg: '#EAF3DE', color: '#27500A' };
    if (project.teamsWebhookUrl)
      return { label: 'Webhook only',     bg: '#E6F1FB', color: '#0C447C' };
    if (project.alertEmail)
      return { label: 'Email only',       bg: '#FAEEDA', color: '#633806' };
    return   { label: 'No alerts set',   bg: '#FCEBEB', color: '#791F1F' };
  };

  const inputStyle = {
    width: '100%', padding: '8px 10px', fontSize: '12px',
    border: '0.5px solid var(--color-border-secondary)',
    borderRadius: '7px',
    background: 'var(--color-background-secondary)',
    color: 'var(--color-text-primary)',
    outline: 'none', boxSizing: 'border-box'
  };

  const labelStyle = {
    fontSize: '11px', fontWeight: '500',
    color: 'var(--color-text-secondary)',
    display: 'block', marginBottom: '4px'
  };

  return (
    <div style={{ padding: '24px', background: 'var(--color-background-tertiary)', minHeight: '100vh' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '18px', fontWeight: '500', color: 'var(--color-text-primary)', marginBottom: '4px' }}>
            Project Configuration
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            Manage migration projects and their alert settings
          </div>
        </div>
        <button
          onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm(true); }}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 16px', background: '#185FA5', color: 'white',
            border: 'none', borderRadius: '8px',
            fontSize: '12px', fontWeight: '500', cursor: 'pointer'
          }}
        >
          <i className="ti ti-plus" style={{ fontSize: '14px' }} />
          Add Project
        </button>
      </div>

      {/* Add / Edit Form */}
      {showForm && (
        <div style={{
          background: 'var(--color-background-primary)',
          border: '0.5px solid var(--color-border-tertiary)',
          borderRadius: '12px', padding: '20px', marginBottom: '20px'
        }}>
          <div style={{
            fontSize: '14px', fontWeight: '500', color: 'var(--color-text-primary)',
            marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <span>{editingId ? 'Edit Project' : 'Add New Project'}</span>
            <button
              onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--color-text-secondary)' }}
            >
              <i className="ti ti-x" />
            </button>
          </div>

          {/* Row 1: Project Name + Metabase ID + Project ID */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={labelStyle}>Project Name <span style={{ color: '#E24B4A' }}>*</span></label>
              <input
                type="text"
                placeholder="e.g. Acme Corp Slack Migration"
                value={form.projectName}
                onChange={e => setForm(p => ({ ...p, projectName: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Metabase ID <span style={{ color: '#E24B4A' }}>*</span></label>
              <input
                type="number"
                placeholder="e.g. 42"
                value={form.metabaseDatabaseId}
                onChange={e => setForm(p => ({ ...p, metabaseDatabaseId: e.target.value }))}
                style={inputStyle}
              />
              <div style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', marginTop: '3px' }}>
                Metabase → Admin → Databases → URL shows /database/[ID]
              </div>
            </div>
            <div>
              <label style={labelStyle}>Project ID <span style={{ color: '#E24B4A' }}>*</span></label>
              <input
                type="text"
                placeholder="e.g. PRJ-001"
                value={form.projectId}
                onChange={e => setForm(p => ({ ...p, projectId: e.target.value }))}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Row 2: Source + Destination */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={labelStyle}>Source Platform <span style={{ color: '#E24B4A' }}>*</span></label>
              <select
                value={form.source}
                onChange={e => setForm(p => ({ ...p, source: e.target.value }))}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">Select source platform...</option>
                {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Destination Platform <span style={{ color: '#E24B4A' }}>*</span></label>
              <select
                value={form.destination}
                onChange={e => setForm(p => ({ ...p, destination: e.target.value }))}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">Select destination platform...</option>
                {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Row 3: Teams Webhook + Alert Email */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>
                Teams Webhook URL
                <span style={{ fontSize: '9px', fontWeight: '400', color: 'var(--color-text-tertiary)', marginLeft: '4px' }}>(optional)</span>
              </label>
              <input
                type="url"
                placeholder="https://outlook.office.com/webhook/..."
                value={form.teamsWebhookUrl}
                onChange={e => setForm(p => ({ ...p, teamsWebhookUrl: e.target.value }))}
                style={inputStyle}
              />
              <div style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', marginTop: '3px' }}>
                Incoming webhook URL for this project's Teams channel
              </div>
            </div>
            <div>
              <label style={labelStyle}>
                Alert Email
                <span style={{ fontSize: '9px', fontWeight: '400', color: 'var(--color-text-tertiary)', marginLeft: '4px' }}>(optional)</span>
              </label>
              <input
                type="email"
                placeholder="ops@yourcompany.com"
                value={form.alertEmail}
                onChange={e => setForm(p => ({ ...p, alertEmail: e.target.value }))}
                style={inputStyle}
              />
              <div style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', marginTop: '3px' }}>
                Alert notifications for this project
              </div>
            </div>
          </div>

          {/* Source → Destination preview */}
          {form.source && form.destination && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              marginBottom: '16px', padding: '8px 12px',
              background: 'var(--color-background-secondary)',
              borderRadius: '8px', fontSize: '11px',
              color: 'var(--color-text-secondary)'
            }}>
              <i className="ti ti-info-circle" style={{ fontSize: '13px' }} />
              Migration route:
              <span style={{ fontWeight: '500', color: 'var(--color-text-primary)' }}>{form.source}</span>
              <i className="ti ti-arrow-right" style={{ fontSize: '12px' }} />
              <span style={{ fontWeight: '500', color: 'var(--color-text-primary)' }}>{form.destination}</span>
              <span style={{ marginLeft: '4px', padding: '1px 6px', background: '#E6F1FB', color: '#0C447C', borderRadius: '6px', fontSize: '10px' }}>
                Messaging
              </span>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              onClick={() => { setShowForm(false); setForm(emptyForm); }}
              style={{
                padding: '8px 16px',
                background: 'var(--color-background-secondary)',
                border: '0.5px solid var(--color-border-secondary)',
                borderRadius: '7px', fontSize: '12px',
                color: 'var(--color-text-secondary)', cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '8px 20px',
                background: saving ? '#6B9DC4' : '#185FA5',
                border: 'none', borderRadius: '7px',
                fontSize: '12px', fontWeight: '500',
                color: 'white', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              {saving && <i className="ti ti-loader" style={{ fontSize: '12px' }} />}
              {saving ? 'Saving...' : editingId ? 'Update Project' : 'Add Project'}
            </button>
          </div>
        </div>
      )}

      {/* Projects Table */}
      <div style={{
        background: 'var(--color-background-primary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: '12px', overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            <i className="ti ti-loader" style={{ fontSize: '20px', display: 'block', marginBottom: '8px' }} />
            Loading projects...
          </div>
        ) : projects.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <i className="ti ti-folder-off" style={{ fontSize: '32px', color: 'var(--color-text-tertiary)', display: 'block', marginBottom: '8px' }} />
            <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
              No projects configured yet
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
              Click "Add Project" to get started
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-secondary)' }}>
                {['Project Name', 'Project ID', 'Metabase ID', 'Migration Route', 'Alert Config', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{
                    padding: '10px 14px', textAlign: 'left',
                    fontSize: '10px', fontWeight: '500',
                    color: 'var(--color-text-secondary)',
                    textTransform: 'uppercase', letterSpacing: '0.05em'
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projects.map((project, i) => {
                const status = getProjectStatus(project);
                return (
                  <tr key={project._id} style={{
                    borderBottom: i < projects.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none',
                    opacity:      project.isActive ? 1 : 0.55,
                    background:   project.isActive ? 'transparent' : 'var(--color-background-secondary)'
                  }}>

                    {/* Project Name */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: '500', color: 'var(--color-text-primary)' }}>
                          {project.projectName}
                        </span>
                        {!project.isActive && (
                          <span style={{ fontSize: '9px', padding: '1px 5px', background: '#FCEBEB', color: '#791F1F', borderRadius: '4px' }}>
                            Inactive
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
                        Added {new Date(project.createdAt).toLocaleDateString()}
                      </div>
                    </td>

                    {/* Project ID */}
                    <td style={{ padding: '12px 14px', color: 'var(--color-text-secondary)' }}>
                      {project.projectId || '—'}
                    </td>

                    {/* Metabase ID */}
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        fontFamily: 'monospace', fontSize: '11px',
                        background: 'var(--color-background-secondary)',
                        padding: '2px 7px', borderRadius: '5px',
                        color: 'var(--color-text-secondary)'
                      }}>
                        #{project.metabaseDatabaseId}
                      </span>
                    </td>

                    {/* Migration Route */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{
                          fontSize: '10px', fontWeight: '500',
                          padding: '2px 7px', borderRadius: '6px',
                          background: PLATFORM_COLORS[project.source]?.bg || '#F3F4F6',
                          color:      PLATFORM_COLORS[project.source]?.color || '#374151'
                        }}>
                          {project.source || '—'}
                        </span>
                        <i className="ti ti-arrow-right" style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }} />
                        <span style={{
                          fontSize: '10px', fontWeight: '500',
                          padding: '2px 7px', borderRadius: '6px',
                          background: PLATFORM_COLORS[project.destination]?.bg || '#F3F4F6',
                          color:      PLATFORM_COLORS[project.destination]?.color || '#374151'
                        }}>
                          {project.destination || '—'}
                        </span>
                      </div>
                    </td>

                    {/* Alert Config */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: project.teamsWebhookUrl ? '#27500A' : 'var(--color-text-tertiary)' }}>
                          <i className={`ti ${project.teamsWebhookUrl ? 'ti-circle-check' : 'ti-circle-x'}`} />
                          Teams webhook
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: project.alertEmail ? '#27500A' : 'var(--color-text-tertiary)' }}>
                          <i className={`ti ${project.alertEmail ? 'ti-circle-check' : 'ti-circle-x'}`} />
                          {project.alertEmail || 'No email set'}
                        </div>
                      </div>
                    </td>

                    {/* Status badge */}
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: '10px', fontWeight: '500', padding: '3px 8px', borderRadius: '8px', background: status.bg, color: status.color }}>
                        {status.label}
                      </span>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: '5px' }}>
                        <button
                          onClick={() => handleEdit(project)}
                          title="Edit project"
                          style={{
                            padding: '5px 8px',
                            border: '0.5px solid var(--color-border-secondary)',
                            borderRadius: '6px', fontSize: '11px',
                            background: 'var(--color-background-secondary)',
                            color: 'var(--color-text-secondary)',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px'
                          }}
                        >
                          <i className="ti ti-pencil" style={{ fontSize: '12px' }} />
                          Edit
                        </button>
                        {project.teamsWebhookUrl && (
                          <button
                            onClick={() => handleTestWebhook(project)}
                            disabled={testingId === project._id}
                            title="Send test Teams message"
                            style={{
                              padding: '5px 8px',
                              border: '0.5px solid #C0DD97',
                              borderRadius: '6px', fontSize: '11px',
                              background: '#EAF3DE', color: '#27500A',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px'
                            }}
                          >
                            <i className={`ti ${testingId === project._id ? 'ti-loader' : 'ti-send'}`} style={{ fontSize: '12px' }} />
                            Test
                          </button>
                        )}
                        {project.isActive ? (
                          <button
                            onClick={() => handleDelete(project._id, project.projectName)}
                            title="Deactivate project"
                            style={{
                              padding: '5px 8px',
                              border: '0.5px solid #F7C1C1',
                              borderRadius: '6px', fontSize: '11px',
                              background: '#FCEBEB', color: '#791F1F',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px'
                            }}
                          >
                            <i className="ti ti-trash" style={{ fontSize: '12px' }} />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReactivate(project._id)}
                            title="Reactivate project"
                            style={{
                              padding: '5px 8px',
                              border: '0.5px solid #C0DD97',
                              borderRadius: '6px', fontSize: '11px',
                              background: '#EAF3DE', color: '#27500A',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px'
                            }}
                          >
                            <i className="ti ti-refresh" style={{ fontSize: '12px' }} />
                            Reactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
