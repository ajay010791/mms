import React, { useState, useEffect } from 'react';
import api from '../../utils/axios';
import toast from 'react-hot-toast';


export default function AdminPassword() {
  const [credForm, setCredForm] = useState({ username: '', password: '', confirmPassword: '' });
  const [devEnabled, setDevEnabled] = useState(true);
  const [showPass, setShowPass] = useState(false);
  const [adminEmails, setAdminEmails] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingEmails, setSavingEmails] = useState(false);

  useEffect(() => {
    api.get('/api/admin/config/devadmin').then(r => {
      setCredForm(f => ({ ...f, username: r.data.username || 'devadmin' }));
      setDevEnabled(r.data.devLoginEnabled);
    }).catch(() => {});
    api.get('/api/admin/config/adminemails').then(r => {
      setAdminEmails((r.data.emails || []).join('\n'));
    }).catch(() => {});
  }, []);

  const saveCreds = async () => {
    if (credForm.password && credForm.password !== credForm.confirmPassword) { toast.error('Passwords do not match'); return; }
    setSaving(true);
    try { await api.post('/api/admin/config/devadmin', credForm); toast.success('Dev credentials saved'); }
    catch (e) { toast.error(e.response?.data?.error || 'Save failed'); }
    setSaving(false);
  };

  const toggleDev = async () => {
    const newVal = !devEnabled;
    try { await api.post('/api/admin/config/devadmin/toggle', { enabled: newVal }); setDevEnabled(newVal); toast.success(newVal ? 'Dev login enabled' : 'Dev login disabled'); }
    catch (e) { toast.error('Failed to toggle'); }
  };

  const saveEmails = async () => {
    setSavingEmails(true);
    try {
      const emails = adminEmails.split('\n').map(e => e.trim()).filter(Boolean);
      await api.post('/api/admin/config/adminemails', { emails });
      toast.success('Admin emails saved');
    } catch (e) { toast.error('Save failed'); }
    setSavingEmails(false);
  };

  return (
    <>
      <div style={{ maxWidth: 560 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 24 }}>Admin Access</h1>

        <div style={{ background: '#fff', border: '0.5px solid #E5E7EB', borderRadius: 12, padding: 24, marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 16 }}>Dev Login Credentials</h2>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Username</label>
            <input value={credForm.username} onChange={e => setCredForm(f => ({ ...f, username: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none' }} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>New Password</label>
            <div style={{ position: 'relative' }}>
              <input type={showPass ? 'text' : 'password'} value={credForm.password} onChange={e => setCredForm(f => ({ ...f, password: e.target.value }))} placeholder="Leave blank to keep current"
                style={{ width: '100%', padding: '8px 36px 8px 12px', borderRadius: 7, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none' }} />
              <button type="button" onClick={() => setShowPass(v => !v)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>{showPass ? '🙈' : '👁'}</button>
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Confirm Password</label>
            <input type="password" value={credForm.confirmPassword} onChange={e => setCredForm(f => ({ ...f, confirmPassword: e.target.value }))} placeholder="Confirm new password"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none' }} />
          </div>
          <button onClick={saveCreds} disabled={saving} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{saving ? 'Saving...' : 'Save dev credentials'}</button>
        </div>

        <div style={{ background: '#fff', border: '0.5px solid #E5E7EB', borderRadius: 12, padding: 24, marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Dev Login Control</h2>
          <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400e', marginBottom: 14 }}>
            Dev login bypasses MS authentication. Disable in production.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>Enable dev login</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>When disabled, dev section is hidden on login page</div>
            </div>
            <button onClick={toggleDev}
              style={{ width: 44, height: 24, borderRadius: 12, border: 'none', background: devEnabled ? '#2563eb' : '#E5E7EB', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
              <span style={{ position: 'absolute', top: 2, left: devEnabled ? 20 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', display: 'block' }} />
            </button>
          </div>
        </div>

        <div style={{ background: '#fff', border: '0.5px solid #E5E7EB', borderRadius: 12, padding: 24 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 8 }}>MS Admin Access</h2>
          <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>MS users with these emails get admin access. One email per line.</p>
          <textarea value={adminEmails} onChange={e => setAdminEmails(e.target.value)} rows={5}
            placeholder="admin@yourcompany.com&#10;manager@yourcompany.com"
            style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'monospace' }} />
          <button onClick={saveEmails} disabled={savingEmails} style={{ marginTop: 10, padding: '8px 18px', borderRadius: 7, border: 'none', background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{savingEmails ? 'Saving...' : 'Save admin emails'}</button>
        </div>
      </div>
    </>
  );
}
