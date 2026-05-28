import React, { useState, useEffect } from 'react';
import api from '../../utils/axios';
import toast from 'react-hot-toast';

// ─── Microsoft Graph API tab ──────────────────────────────────────────────────

function GraphEmailTab() {
  const [form, setForm] = useState({
    clientId: '', clientSecret: '', tenantId: '',
    senderEmail: '', defaultAlertEmail: '', testTo: ''
  });
  const [configured, setConfigured] = useState(false);
  const [secretSaved, setSecretSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    api.get('/api/admin/config/graph-email')
      .then(res => {
        if (res.data?.configured) {
          setConfigured(true);
          setSecretSaved(res.data.secretSaved);
          setForm(f => ({
            ...f,
            clientId:          res.data.clientId          || '',
            tenantId:          res.data.tenantId          || '',
            senderEmail:       res.data.senderEmail        || '',
            defaultAlertEmail: res.data.defaultAlertEmail  || '',
            clientSecret: ''
          }));
        }
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!form.clientId || !form.tenantId || !form.senderEmail) {
      toast.error('Client ID, Tenant ID and Sender Email are required');
      return;
    }
    if (!secretSaved && !form.clientSecret) {
      toast.error('Client Secret is required');
      return;
    }
    setSaving(true);
    try {
      await api.post('/api/admin/config/graph-email', {
        clientId:          form.clientId.trim(),
        clientSecret:      form.clientSecret.trim(),
        tenantId:          form.tenantId.trim(),
        senderEmail:       form.senderEmail.trim(),
        defaultAlertEmail: form.defaultAlertEmail.trim()
      });
      toast.success('Microsoft Graph email settings saved ✓');
      setConfigured(true);
      setSecretSaved(true);
      setForm(f => ({ ...f, clientSecret: '' }));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    const recipient = form.testTo.trim() || form.defaultAlertEmail.trim() || form.senderEmail.trim();
    if (!recipient) {
      toast.error('Enter a recipient email to test');
      return;
    }
    setTesting(true);
    try {
      const res = await api.post('/api/admin/config/graph-email/test', { to: recipient });
      toast.success(res.data.message || 'Test email sent ✓');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm('Remove Microsoft Graph email configuration?')) return;
    setRemoving(true);
    try {
      await api.delete('/api/admin/config/graph-email');
      toast.success('Graph email configuration removed');
      setConfigured(false);
      setSecretSaved(false);
      setForm({ clientId: '', clientSecret: '', tenantId: '', senderEmail: '', defaultAlertEmail: '', testTo: '' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Remove failed');
    } finally {
      setRemoving(false);
    }
  };

  const f = (label, key, type = 'text', ph = '', hint = '') => (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={e => setForm(d => ({ ...d, [key]: e.target.value }))}
        placeholder={ph}
        style={inputStyle}
      />
      {key === 'clientSecret' && secretSaved && !form.clientSecret && (
        <div style={{ fontSize: 10, color: '#3B6D11', marginTop: 3 }}>
          <i className="ti ti-circle-check" style={{ fontSize: 11 }} /> Secret saved — leave blank to keep existing
        </div>
      )}
      {hint && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>{hint}</div>}
    </div>
  );

  return (
    <div>
      {/* Azure Portal requirements notice */}
      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 12, color: '#1e40af', lineHeight: 1.6 }}>
        <strong>Azure Portal — one-time setup required:</strong>
        <ol style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
          <li>App registrations → your app → <strong>API permissions</strong> → Add → Microsoft Graph → Application permissions → <code>Mail.Send</code> → Grant admin consent</li>
          <li>The <strong>Sender Email</strong> below must be a valid mailbox in your tenant (e.g. an Outlook/Exchange account)</li>
        </ol>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        {f('Client ID *',    'clientId',    'text',     'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')}
        {f('Tenant ID *',    'tenantId',    'text',     'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')}
        {f('Client Secret *','clientSecret','password', secretSaved ? '••••••••  (saved)' : 'Paste your Azure client secret')}
        {f('Sender Email *', 'senderEmail', 'email',    'alerts@yourcompany.com',
           'The mailbox emails are sent FROM — must exist in your tenant')}
        {f('Default Alert Recipient', 'defaultAlertEmail', 'text', 'ops@yourcompany.com, manager@yourcompany.com',
           'Comma-separated. Used when a project has no alert email set')}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        <button onClick={handleSave} disabled={saving} style={btnPrimary}>
          {saving ? 'Saving…' : 'Save'}
        </button>

        {configured && (
          <>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1 }}>
              <input
                type="email"
                value={form.testTo}
                onChange={e => setForm(d => ({ ...d, testTo: e.target.value }))}
                placeholder={form.defaultAlertEmail || 'recipient@company.com'}
                style={{ ...inputStyle, flex: 1, maxWidth: 300 }}
              />
              <button onClick={handleTest} disabled={testing} style={btnGreen}>
                {testing ? 'Sending…' : 'Send test email'}
              </button>
            </div>
            <button onClick={handleRemove} disabled={removing} style={btnDanger}>
              {removing ? 'Removing…' : 'Remove config'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── SMTP Password tab ────────────────────────────────────────────────────────

function SmtpTab() {
  const [form, setForm] = useState({
    host: '', port: '587', username: '', password: '',
    fromName: 'Migration Monitor', defaultAlertEmail: ''
  });
  const [configured,    setConfigured]    = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [testing,       setTesting]       = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);

  useEffect(() => {
    api.get('/api/admin/config/smtp/direct')
      .then(res => {
        if (res.data?.raw) {
          const r = res.data.raw;
          setForm(prev => ({
            ...prev,
            host:              r.host              || '',
            port:              r.port              || 587,
            username:          r.username          || '',
            fromName:          r.fromName          || 'Migration Monitor',
            defaultAlertEmail: r.defaultAlertEmail || '',
            password:          ''
          }));
          setConfigured(true);
          setPasswordSaved(r.passwordSaved || false);
        }
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!form.host || !form.username) {
      toast.error('Host and username are required');
      return;
    }
    setSaving(true);
    try {
      await api.post('/api/admin/config/smtp/direct', {
        host:              form.host.trim(),
        port:              Number(form.port) || 587,
        username:          form.username.trim(),
        password:          form.password?.trim() || '',
        fromName:          form.fromName?.trim() || 'Migration Monitor',
        defaultAlertEmail: form.defaultAlertEmail?.trim(),
        authType:          'password'
      });
      toast.success('SMTP settings saved ✓');
      setForm(prev => ({ ...prev, password: '' }));
      setPasswordSaved(!!form.password?.trim());
      setConfigured(true);
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

  const f = (label, key, type = 'text', ph = '') => (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={e => setForm(d => ({ ...d, [key]: e.target.value }))}
        placeholder={ph}
        style={inputStyle}
      />
    </div>
  );

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        {f('SMTP Host',               'host',     'text',   'smtp.gmail.com')}
        {f('Port',                    'port',     'number', '587')}
        {f('Username / Sender Email', 'username', 'email',  'alerts@yourcompany.com')}

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Password</label>
          <input
            type="password"
            value={form.password}
            onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
            placeholder={passwordSaved ? '••••••••  (saved — leave blank to keep)' : 'Enter SMTP password'}
            style={inputStyle}
          />
          {passwordSaved && !form.password && (
            <div style={{ fontSize: 10, color: '#3B6D11', marginTop: 3 }}>
              <i className="ti ti-circle-check" style={{ fontSize: 11 }} /> Password saved — leave blank to keep existing
            </div>
          )}
        </div>

        {f('From Name',               'fromName',          'text',  'Migration Monitor')}
        {f('Default Alert Recipient', 'defaultAlertEmail', 'text',  'ops@yourcompany.com')}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleSave} disabled={saving} style={btnPrimary}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {configured && (
          <button onClick={handleTest} disabled={testing} style={btnGreen}>
            {testing ? 'Sending…' : 'Send test email'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminSmtp() {
  const [tab, setTab] = useState('graph');

  return (
    <div style={{ padding: '28px 32px', maxWidth: 700 }}>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: 0 }}>Email Configuration</h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
          Choose how Migration Monitor sends alert emails. Microsoft Graph API is recommended for Outlook / Microsoft 365.
        </p>
      </div>

      {/* Tab selector */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, background: '#F3F4F6', borderRadius: 8, padding: 3, width: 'fit-content' }}>
        {[
          { key: 'graph', label: 'Microsoft Graph API (Azure)', icon: 'ti-brand-azure' },
          { key: 'smtp',  label: 'SMTP Password',               icon: 'ti-mail' }
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6,
              background: tab === t.key ? '#fff' : 'transparent',
              color:      tab === t.key ? '#1d4ed8' : '#6b7280',
              boxShadow:  tab === t.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s'
            }}
          >
            <i className={`ti ${t.icon}`} style={{ fontSize: 13 }} />
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', border: '0.5px solid #E5E7EB', borderRadius: 12, padding: 24 }}>
        {tab === 'graph' ? <GraphEmailTab /> : <SmtpTab />}
      </div>

    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 7,
  border: '1px solid #E5E7EB', fontSize: 13, outline: 'none',
  boxSizing: 'border-box'
};
const labelStyle = {
  display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4
};
const btnPrimary = {
  padding: '8px 18px', borderRadius: 7, border: 'none',
  background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer'
};
const btnGreen = {
  padding: '8px 18px', borderRadius: 7,
  border: '1px solid #16a34a', background: '#f0fdf4',
  color: '#16a34a', fontSize: 13, fontWeight: 600, cursor: 'pointer'
};
const btnDanger = {
  padding: '8px 18px', borderRadius: 7,
  border: '1px solid #dc2626', background: '#fef2f2',
  color: '#dc2626', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginLeft: 'auto'
};
