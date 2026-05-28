import React, { useState, useEffect } from 'react';
import api from '../utils/axios';
import toast from 'react-hot-toast';
import TopBar from '../components/TopBar';
import useProjects from '../hooks/useProjects';

export default function Settings() {
  const { projects } = useProjects(0);
  const [configs, setConfigs] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});

  useEffect(() => {
    api.get('/api/alerts').then(r => setConfigs(r.data)).catch(() => {});
  }, []);

  const getConfig = (projectName) => configs.find(c => c.projectName === projectName) || {};

  const startEdit = (project) => {
    const cfg = getConfig(project.projectName);
    setEditingId(project.id);
    setEditData({ teamsWebhookUrl: cfg.teamsWebhookUrl || '', alertEmail: cfg.alertEmail || '', migrationType: project.migrationType });
  };

  const saveEdit = async (project) => {
    try {
      const cfg = getConfig(project.projectName);
      if (cfg._id) {
        await api.put(`/api/alerts/${cfg._id}`, { ...editData, projectName: project.projectName });
      } else {
        await api.post('/api/alerts', { ...editData, projectName: project.projectName });
      }
      const r = await api.get('/api/alerts');
      setConfigs(r.data);
      setEditingId(null);
      toast.success('Saved');
    } catch (e) {
      toast.error('Save failed');
    }
  };

  const getStatus = (cfg) => {
    const hasWeb = !!(cfg.teamsWebhookUrl);
    const hasEmail = !!(cfg.alertEmail);
    if (hasWeb && hasEmail) return { label: 'Ready', color: '#16a34a', bg: '#f0fdf4' };
    if (hasEmail) return { label: 'Email only', color: '#d97706', bg: '#fffbeb' };
    if (hasWeb) return { label: 'Webhook only', color: '#d97706', bg: '#fffbeb' };
    return { label: 'Not configured', color: '#dc2626', bg: '#fef2f2' };
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB' }}>
      <TopBar />
      <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Alert Settings</h1>
        <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 20 }}>Configure Teams webhook URLs and alert emails per project.</p>
        <div style={{ background: '#fff', border: '0.5px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                {['Project', 'Type', 'Teams Webhook URL', 'Alert Email', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projects.map(p => {
                const cfg = getConfig(p.projectName);
                const isEditing = editingId === p.id;
                const status = getStatus(cfg);
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 500, color: '#111827' }}>{p.projectName}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: p.migrationType === 'messaging' ? '#F5F3FF' : p.migrationType === 'email' ? '#EFF6FF' : '#F0FDF4', color: p.migrationType === 'messaging' ? '#7c3aed' : p.migrationType === 'email' ? '#2563eb' : '#16a34a' }}>{p.migrationType}</span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {isEditing ? (
                        <input value={editData.teamsWebhookUrl} onChange={e => setEditData(d => ({ ...d, teamsWebhookUrl: e.target.value }))}
                          placeholder="https://..." style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 12 }} />
                      ) : (
                        <span style={{ fontSize: 12, color: cfg.teamsWebhookUrl ? '#374151' : '#9ca3af' }}>{cfg.teamsWebhookUrl ? '✓ Set' : '—'}</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {isEditing ? (
                        <input value={editData.alertEmail} onChange={e => setEditData(d => ({ ...d, alertEmail: e.target.value }))}
                          placeholder="alerts@..." style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 12 }} />
                      ) : (
                        <span style={{ fontSize: 12, color: cfg.alertEmail ? '#374151' : '#9ca3af' }}>{cfg.alertEmail || '—'}</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: status.bg, color: status.color }}>{status.label}</span>
                    </td>
                    <td style={{ padding: '10px 14px', display: 'flex', gap: 6 }}>
                      {isEditing ? (
                        <>
                          <button onClick={() => saveEdit(p)} style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>Save</button>
                          <button onClick={() => setEditingId(null)} style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', cursor: 'pointer' }}>Cancel</button>
                        </>
                      ) : (
                        <button onClick={() => startEdit(p)} style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', cursor: 'pointer' }}>Edit</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
