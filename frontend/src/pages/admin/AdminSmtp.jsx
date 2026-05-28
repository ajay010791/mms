import React, { useState, useEffect } from 'react';
import api from '../../utils/axios';
import toast from 'react-hot-toast';

export default function AdminSmtp() {
  const [form, setForm] = useState({
    host: '', port: '587', username: '', password: '',
    fromName: 'Migration Monitor', defaultAlertEmail: ''
  });
  const [showPass,      setShowPass]      = useState(false);
  const [configured,    setConfigured]    = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [testing,       setTesting]       = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [oauthStatus,   setOauthStatus]   = useState(null);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const [smtpRes, oauthRes] = await Promise.all([
          api.get('/api/admin/config/smtp/direct'),
          api.get('/api/admin/config/smtp/oauth2/status').catch(() => ({ data: null }))
        ]);

        if (smtpRes.data?.raw) {
          setForm(prev => ({
            ...prev,
            host:              smtpRes.data.raw.host || '',
            port:              String(smtpRes.data.raw.port || 587),
            username:          smtpRes.data.raw.username || '',
            fromName:          smtpRes.data.raw.fromName || 'Migration Monitor',
            defaultAlertEmail: smtpRes.data.raw.defaultAlertEmail || '',
            password:          ''
          }));
          setConfigured(true);
          if (smtpRes.data.raw.passwordSaved) setPasswordSaved(true);
        }

        if (oauthRes.data) setOauthStatus(oauthRes.data);

      } catch (e) {
        console.error('Failed to load SMTP config:', e);
      }
    };
    loadConfig();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      const payload = {
        host:              form.host.trim(),
        port:              Number(form.port) || 587,
        username:          form.username.trim(),
        fromName:          form.fromName || 'Migration Monitor',
        defaultAlertEmail: form.defaultAlertEmail.trim()
      };

      if (form.password?.trim()) {
        payload.password = form.password.trim();
      } else if (passwordSaved) {
        const existing = await api.get('/api/admin/config/smtp/direct');
        payload.password = existing.data?.raw?.password || '';
      }

      await api.post('/api/admin/config/smtp/direct', payload);
      toast.success('SMTP config saved ✓');
      setPasswordSaved(!!payload.password);
      setConfigured(true);
      setForm(prev => ({ ...prev, password: '' }));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const r = await api.post('/api/admin/config/smtp/test');
      toast.success(r.data.message);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleConnectMS = async () => {
    try {
      const res = await api.get('/api/admin/config/smtp/oauth2/auth-url');
      console.log('[SMTP OAuth] Auth details:', {
        redirectUri: res.data.redirectUri,
        clientId:    res.data.clientId?.substring(0, 8) + '...',
        tenantId:    res.data.tenantId?.substring(0, 8) + '...'
      });
      // Full-page redirect — OAuth2 authorization code flow cannot use a popup
      window.location.href = res.data.authUrl;
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to get auth URL');
    }
  };

  const handleDisconnect = async () => {
    try {
      await api.post('/api/admin/config/smtp/oauth2/disconnect');
      setOauthStatus({ connected: false, authType: 'password' });
      setPasswordSaved(false);
      toast.success('Microsoft account disconnected');
    } catch (err) {
      toast.error('Disconnect failed');
    }
  };

  const isOAuth = oauthStatus?.connected;
  const inputStyle = {
    width: '100%', padding: '8px 12px', borderRadius: 7,
    border: '1px solid #E5E7EB', fontSize: 13, outline: 'none',
    boxSizing: 'border-box'
  };
  const labelStyle = {
    display: 'block', fontSize: 12, fontWeight: 600,
    color: '#374151', marginBottom: 4
  };

  const f = (label, key, type = 'text', ph = '') => (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={(key === 'password' && !showPass) ? 'password' : type}
          value={form[key]}
          onChange={e => setForm(d => ({ ...d, [key]: e.target.value }))}
          placeholder={ph}
          style={{ ...inputStyle, paddingRight: key === 'password' ? 36 : 12 }}
        />
        {key === 'password' && (
          <button type="button" onClick={() => setShowPass(v => !v)}
            style={{
              position: 'absolute', right: 8, top: '50%',
              transform: 'translateY(-50%)', background: 'none',
              border: 'none', cursor: 'pointer', color: '#9ca3af'
            }}>
            {showPass ? '🙈' : '👁'}
          </button>
        )}
      </div>
      {key === 'password' && passwordSaved && form.password === '' && (
        <div style={{ fontSize: 10, color: '#3B6D11', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
          <i className="ti ti-circle-check" style={{ fontSize: 12 }} />
          Password saved — leave blank to keep existing
        </div>
      )}
    </div>
  );

  return (
    <>
      <div style={{ maxWidth: 640 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>
            Email / SMTP Configuration
          </h1>
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600,
            background: isOAuth ? '#EAF3DE' : configured ? '#f0fdf4' : '#F9FAFB',
            color:      isOAuth ? '#27500A' : configured ? '#16a34a' : '#6b7280',
            border: `1px solid ${isOAuth ? '#C0DD97' : configured ? '#bbf7d0' : '#E5E7EB'}`
          }}>
            {isOAuth ? '✓ OAuth2 Connected' : configured ? '✓ Configured' : 'Not configured'}
          </span>
        </div>

        <div style={{ background: '#fff', border: '0.5px solid #E5E7EB', borderRadius: 12, padding: 24 }}>

          {/* ── OAuth2 Connection ── */}
          <div style={{
            background: isOAuth ? '#EAF3DE' : '#F9FAFB',
            border: `0.5px solid ${isOAuth ? '#C0DD97' : '#E5E7EB'}`,
            borderRadius: 8,
            padding: '12px 14px',
            marginBottom: 20
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{
                  fontSize: 12, fontWeight: 600,
                  color: isOAuth ? '#27500A' : '#374151',
                  marginBottom: 3,
                  display: 'flex', alignItems: 'center', gap: 6
                }}>
                  <i className={`ti ${isOAuth ? 'ti-circle-check' : 'ti-brand-office'}`}
                    style={{ fontSize: 14 }} />
                  {isOAuth
                    ? `Connected: ${oauthStatus.connectedEmail}`
                    : 'Microsoft OAuth2 (Recommended)'}
                </div>
                <div style={{ fontSize: 10, color: '#6b7280' }}>
                  {isOAuth
                    ? `Connected: ${new Date(oauthStatus.connectedAt).toLocaleDateString()}`
                    : 'More secure than password — no credentials stored locally'}
                </div>
              </div>

              {isOAuth ? (
                <button
                  onClick={handleDisconnect}
                  style={{
                    padding: '5px 10px', flexShrink: 0,
                    background: '#FCEBEB', border: '0.5px solid #F7C1C1',
                    borderRadius: 6, fontSize: 11, color: '#791F1F', cursor: 'pointer'
                  }}
                >
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={handleConnectMS}
                  style={{
                    padding: '6px 12px', flexShrink: 0,
                    background: '#185FA5', border: 'none',
                    borderRadius: 6, fontSize: 11, fontWeight: 500,
                    color: 'white', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 21 21">
                    <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                    <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                    <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                    <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                  </svg>
                  Connect Microsoft Account
                </button>
              )}
            </div>
          </div>

          {/* ── SMTP Fields ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            {f('SMTP Host', 'host', 'text',
              isOAuth ? 'smtp.office365.com' : 'smtp.gmail.com')}
            {f('Port', 'port', 'number', '587')}
            {f('Username / Sender Email', 'username', 'email', 'alerts@yourcompany.com')}

            {/* Hide password when OAuth2 is active */}
            {!isOAuth && f('Password', 'password', 'password', '••••••••')}

            {f('From Name', 'fromName', 'text', 'Migration Monitor')}
            {f('Default Alert Recipient', 'defaultAlertEmail', 'email', 'ops-team@yourcompany.com')}
          </div>

          {isOAuth && (
            <div style={{
              fontSize: 11, color: '#6b7280',
              background: '#F9FAFB', border: '0.5px solid #E5E7EB',
              borderRadius: 6, padding: '8px 12px', marginBottom: 16
            }}>
              🔐 Using OAuth2 — password field not required.
              SMTP will authenticate via Microsoft access tokens.
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '8px 18px', borderRadius: 7, border: 'none',
                background: saving ? '#93c5fd' : '#2563eb',
                color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer'
              }}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={handleTest}
              disabled={testing}
              style={{
                padding: '8px 18px', borderRadius: 7,
                border: '1px solid #16a34a', background: '#f0fdf4',
                color: '#16a34a', fontSize: 13, fontWeight: 600, cursor: 'pointer'
              }}
            >
              {testing ? 'Sending...' : 'Send test email'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
