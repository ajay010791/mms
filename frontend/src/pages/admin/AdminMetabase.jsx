import React, { useState, useEffect } from 'react';
import api from '../../utils/axios';
import toast from 'react-hot-toast';

import { format } from 'date-fns';

export default function AdminMetabase() {
  const [form, setForm] = useState({ url: '', username: '', password: '' });
  const [showPass, setShowPass] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [sessionInfo, setSessionInfo] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    api.get('/api/admin/config/metabase').then(r => {
      if (r.data.configured) {
        setConfigured(true);
        setForm(f => ({ ...f, url: r.data.url || '', username: r.data.username || '' }));
        setSessionInfo(r.data.sessionInfo);
      }
    }).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try { await api.post('/api/admin/config/metabase', form); toast.success('Metabase config saved'); setConfigured(true); }
    catch (e) { toast.error(e.response?.data?.error || 'Save failed'); }
    setSaving(false);
  };

  const test = async () => {
    setTesting(true);
    try { const r = await api.post('/api/admin/config/metabase/test'); toast.success(`Connected — ${r.data.databases} databases found`); }
    catch (e) { toast.error(e.response?.data?.error || 'Connection failed'); }
    setTesting(false);
  };

  const refresh = async () => {
    setRefreshing(true);
    try { await api.post('/api/admin/config/metabase/refresh'); toast.success('Session refreshed'); }
    catch (e) { toast.error('Refresh failed'); }
    setRefreshing(false);
  };

  return (
    <>
      <div style={{ maxWidth: 640 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>Metabase Configuration</h1>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: configured ? '#f0fdf4' : '#F9FAFB', color: configured ? '#16a34a' : '#6b7280', border: `1px solid ${configured ? '#bbf7d0' : '#E5E7EB'}`, fontWeight: 600 }}>{configured ? '✓ Configured' : 'Not configured'}</span>
        </div>
        {sessionInfo && sessionInfo.lastConnected && (
          <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '8px 14px', marginBottom: 16, fontSize: 12, color: '#1d4ed8' }}>
            Last connected: {format(new Date(sessionInfo.lastConnected), 'MMM d, yyyy HH:mm')}
            {sessionInfo.expiresAt && ` — Session expires: ${format(new Date(sessionInfo.expiresAt), 'MMM d, yyyy')}`}
          </div>
        )}
        <div style={{ background: '#fff', border: '0.5px solid #E5E7EB', borderRadius: 12, padding: 24 }}>
          {[['Metabase Base URL', 'url', 'text', 'https://metabase.yourcompany.com'], ['Username / Email', 'username', 'email', 'admin@yourcompany.com']].map(([label, key, type, ph]) => (
            <div key={key} style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{label}</label>
              <input type={type} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={ph}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none' }} />
            </div>
          ))}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Password</label>
            <div style={{ position: 'relative' }}>
              <input type={showPass ? 'text' : 'password'} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••"
                style={{ width: '100%', padding: '8px 36px 8px 12px', borderRadius: 7, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none' }} />
              <button type="button" onClick={() => setShowPass(v => !v)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>{showPass ? '🙈' : '👁'}</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} disabled={saving} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{saving ? 'Saving...' : 'Save'}</button>
            <button onClick={test} disabled={testing} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid #16a34a', background: '#f0fdf4', color: '#16a34a', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{testing ? 'Testing...' : 'Test connection'}</button>
            <button onClick={refresh} disabled={refreshing} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', fontSize: 13, cursor: 'pointer' }}>{refreshing ? 'Refreshing...' : 'Refresh session now'}</button>
          </div>
        </div>
      </div>
    </>
  );
}
