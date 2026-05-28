import React, { useState, useEffect } from 'react';
import api from '../../utils/axios';
import toast from 'react-hot-toast';


export default function AdminAzure() {
  const [form, setForm] = useState({ clientId: '', tenantId: '', clientSecret: '', redirectUri: '' });
  const [showSecret, setShowSecret] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/admin/config/azure').then(r => {
      if (r.data.configured) {
        setConfigured(true);
        setForm(f => ({ ...f, clientId: r.data.clientId || '', tenantId: r.data.tenantId || '', redirectUri: r.data.redirectUri || '' }));
      }
    }).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.post('/api/admin/config/azure', form);
      toast.success('Azure config saved');
      setConfigured(true);
    } catch (e) { toast.error(e.response?.data?.error || 'Save failed'); }
    setSaving(false);
  };

  const test = async () => {
    setTesting(true);
    try {
      const r = await api.post('/api/admin/config/azure/test');
      toast.success(`Connected — Tenant: ${r.data.tenantId}`);
    } catch (e) { toast.error(e.response?.data?.error || 'Test failed'); }
    setTesting(false);
  };

  const field = (label, key, type = 'text', placeholder = '') => (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input type={(key === 'clientSecret' && !showSecret) ? 'password' : type} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none', paddingRight: key === 'clientSecret' ? 36 : 12 }} />
        {key === 'clientSecret' && (
          <button type="button" onClick={() => setShowSecret(v => !v)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>{showSecret ? '🙈' : '👁'}</button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div style={{ maxWidth: 640 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>Azure AD Configuration</h1>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: configured ? '#f0fdf4' : '#F9FAFB', color: configured ? '#16a34a' : '#6b7280', border: `1px solid ${configured ? '#bbf7d0' : '#E5E7EB'}`, fontWeight: 600 }}>
            {configured ? '✓ Configured' : 'Not configured'}
          </span>
        </div>
        <div style={{ background: '#fff', border: '0.5px solid #E5E7EB', borderRadius: 12, padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            {field('Client ID', 'clientId', 'text', 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')}
            {field('Tenant ID', 'tenantId', 'text', 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')}
            {field('Client Secret', 'clientSecret', 'password', '••••••••')}
            {field('Redirect URI', 'redirectUri', 'text', 'http://localhost:5047/auth/callback')}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={save} disabled={saving} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{saving ? 'Saving...' : 'Save'}</button>
            <button onClick={test} disabled={testing} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid #16a34a', background: '#f0fdf4', color: '#16a34a', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{testing ? 'Testing...' : 'Test connection'}</button>
          </div>
        </div>
      </div>
    </>
  );
}
