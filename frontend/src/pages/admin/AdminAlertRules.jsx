import { useState, useEffect } from 'react';
import api from '../../utils/axios';
import toast from 'react-hot-toast';

export default function AdminAlertRules() {
  const [form, setForm] = useState({
    stallIntervalMinutes:   '',
    cooldownHours:          '',
    conflictThresholdHours: '',
    enableEmailAlerts:      true,
    enableTeamsAlerts:      true
  });
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  useEffect(() => {
    const loadRules = async () => {
      try {
        setLoading(true);
        const res = await api.get('/api/admin/alerts/cron-status');

        if (res.data?.rules) {
          const r = res.data.rules;
          setForm({
            stallIntervalMinutes:   r.stallIntervalMinutes?.toString()   || '',
            cooldownHours:          r.cooldownHours?.toString()          ||
                                    (r.cooldownMinutes ? (r.cooldownMinutes / 60).toString() : ''),
            conflictThresholdHours: r.conflictThresholdHours?.toString() ||
                                    (r.conflictThresholdMinutes ? (r.conflictThresholdMinutes / 60).toString() : ''),
            enableEmailAlerts:      r.enableEmailAlerts !== false,
            enableTeamsAlerts:      r.enableTeamsAlerts !== false
          });
          setLastSaved(res.data.updatedAt || null);
          console.log('[AlertRules] Loaded from MongoDB:', r);
        }
      } catch (err) {
        console.error('[AlertRules] Load error:', err.message);
        toast.error('Failed to load alert rules');
      } finally {
        setLoading(false);
      }
    };

    loadRules();
  }, []);

  const handleSave = async () => {
    if (!form.stallIntervalMinutes || !form.cooldownHours || !form.conflictThresholdHours) {
      toast.error('All three timing fields are required');
      return;
    }

    const mins     = Number(form.stallIntervalMinutes);
    const cooldown = Number(form.cooldownHours);
    const conflict = Number(form.conflictThresholdHours);

    if (isNaN(mins) || mins < 1 || mins > 120) {
      toast.error('Check interval must be between 1 and 120 minutes');
      return;
    }
    if (isNaN(cooldown) || cooldown < 1 || cooldown > 24) {
      toast.error('Alert cooldown must be between 1 and 24 hours');
      return;
    }
    if (isNaN(conflict) || conflict < 1 || conflict > 24) {
      toast.error('Conflict threshold must be between 1 and 24 hours');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        stallIntervalMinutes:   mins,
        cooldownHours:          cooldown,
        conflictThresholdHours: conflict,
        enableEmailAlerts:      form.enableEmailAlerts,
        enableTeamsAlerts:      form.enableTeamsAlerts
      };

      console.log('[AlertRules] Saving:', payload);

      const res = await api.post('/api/admin/config/alertrules', payload);

      console.log('[AlertRules] Saved:', res.data);
      setLastSaved(res.data.updatedAt || new Date().toISOString());
      toast.success(`Alert rules saved ✓ — Cron restarted every ${mins} min`);

    } catch (err) {
      console.error('[AlertRules] Save error:', err.message);
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width:        '100%',
    padding:      '8px 10px',
    fontSize:     '12px',
    border:       '0.5px solid var(--color-border-secondary)',
    borderRadius: '7px',
    background:   'var(--color-background-secondary)',
    color:        'var(--color-text-primary)',
    outline:      'none',
    boxSizing:    'border-box'
  };

  const labelStyle = {
    fontSize:     '11px',
    fontWeight:   '500',
    color:        'var(--color-text-secondary)',
    display:      'block',
    marginBottom: '4px'
  };

  const hintStyle = {
    fontSize:  '10px',
    color:     'var(--color-text-tertiary)',
    marginTop: '3px'
  };

  if (loading) {
    return (
      <div style={{
        padding:        '32px',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            '8px',
        color:          'var(--color-text-secondary)',
        fontSize:       '13px'
      }}>
        <i className="ti ti-loader" style={{ fontSize: '18px' }} />
        Loading alert rules...
      </div>
    );
  }

  return (
    <div style={{
      padding:    '24px',
      background: 'var(--color-background-tertiary)',
      minHeight:  '100vh'
    }}>

      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{
          fontSize:     '18px',
          fontWeight:   '500',
          color:        'var(--color-text-primary)',
          marginBottom: '4px'
        }}>
          Alert Rules
        </div>
        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
          Configure when and how alerts are triggered. All values stored in MongoDB.
          {lastSaved && (
            <span style={{ marginLeft: '8px', color: '#3B6D11' }}>
              Last saved: {new Date(lastSaved).toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* Timing Settings */}
      <div style={{
        background:   'var(--color-background-primary)',
        border:       '0.5px solid var(--color-border-tertiary)',
        borderRadius: '12px',
        padding:      '20px',
        marginBottom: '14px'
      }}>
        <div style={{
          fontSize:     '13px',
          fontWeight:   '500',
          color:        'var(--color-text-primary)',
          marginBottom: '16px',
          display:      'flex',
          alignItems:   'center',
          gap:          '6px'
        }}>
          <i className="ti ti-clock" style={{ fontSize: '15px', color: '#185FA5' }} />
          Timing Configuration
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>

          <div>
            <label style={labelStyle}>
              Check Interval
              <span style={{ color: '#E24B4A' }}> *</span>
            </label>
            <input
              type="number"
              min="1"
              max="120"
              value={form.stallIntervalMinutes}
              onChange={e => setForm(p => ({ ...p, stallIntervalMinutes: e.target.value }))}
              placeholder="e.g. 30"
              style={inputStyle}
            />
            <div style={hintStyle}>How often (minutes) to check for stalls (1–120)</div>
            {form.stallIntervalMinutes && (
              <div style={{ fontSize: '10px', color: '#185FA5', marginTop: '3px', fontWeight: '500' }}>
                → Checks every {form.stallIntervalMinutes} min
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle}>
              Alert Cooldown Period
              <span style={{ color: '#E24B4A' }}> *</span>
            </label>
            <input
              type="number"
              min="1"
              max="24"
              value={form.cooldownHours}
              onChange={e => setForm(p => ({ ...p, cooldownHours: e.target.value }))}
              placeholder="e.g. 2"
              style={inputStyle}
            />
            <div style={hintStyle}>Hours before same stall alert repeats (e.g. 2)</div>
          </div>

          <div>
            <label style={labelStyle}>
              Conflict Alert Threshold
              <span style={{ color: '#E24B4A' }}> *</span>
            </label>
            <input
              type="number"
              min="1"
              max="24"
              value={form.conflictThresholdHours}
              onChange={e => setForm(p => ({ ...p, conflictThresholdHours: e.target.value }))}
              placeholder="e.g. 1"
              style={inputStyle}
            />
            <div style={hintStyle}>Hours before conflict alert repeats (e.g. 1)</div>
          </div>

        </div>
      </div>

      {/* Alert Channels */}
      <div style={{
        background:   'var(--color-background-primary)',
        border:       '0.5px solid var(--color-border-tertiary)',
        borderRadius: '12px',
        padding:      '20px',
        marginBottom: '14px'
      }}>
        <div style={{
          fontSize:     '13px',
          fontWeight:   '500',
          color:        'var(--color-text-primary)',
          marginBottom: '16px',
          display:      'flex',
          alignItems:   'center',
          gap:          '6px'
        }}>
          <i className="ti ti-bell" style={{ fontSize: '15px', color: '#185FA5' }} />
          Alert Channels
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* Email Toggle */}
          <div style={{
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'space-between',
            padding:         '12px 14px',
            background:      form.enableEmailAlerts ? '#EAF3DE' : 'var(--color-background-secondary)',
            border:          `0.5px solid ${form.enableEmailAlerts ? '#C0DD97' : 'var(--color-border-tertiary)'}`,
            borderRadius:    '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="ti ti-mail" style={{
                fontSize: '16px',
                color:    form.enableEmailAlerts ? '#3B6D11' : 'var(--color-text-tertiary)'
              }} />
              <div>
                <div style={{
                  fontSize:   '12px',
                  fontWeight: '500',
                  color:      form.enableEmailAlerts ? '#27500A' : 'var(--color-text-secondary)'
                }}>
                  Email Alerts
                </div>
                <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>
                  Send alerts via email to project recipients
                </div>
              </div>
            </div>
            <button
              onClick={() => setForm(p => ({ ...p, enableEmailAlerts: !p.enableEmailAlerts }))}
              style={{
                width:        '44px',
                height:       '24px',
                borderRadius: '12px',
                border:       'none',
                background:   form.enableEmailAlerts ? '#3B6D11' : '#D1D5DB',
                cursor:       'pointer',
                position:     'relative',
                transition:   'background 0.2s',
                flexShrink:   0
              }}
            >
              <div style={{
                width:        '18px',
                height:       '18px',
                borderRadius: '50%',
                background:   'white',
                position:     'absolute',
                top:          '3px',
                left:         form.enableEmailAlerts ? '23px' : '3px',
                transition:   'left 0.2s',
                boxShadow:    '0 1px 3px rgba(0,0,0,0.2)'
              }} />
            </button>
          </div>

          {/* Teams Toggle */}
          <div style={{
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'space-between',
            padding:         '12px 14px',
            background:      form.enableTeamsAlerts ? '#E6F1FB' : 'var(--color-background-secondary)',
            border:          `0.5px solid ${form.enableTeamsAlerts ? '#B5D4F4' : 'var(--color-border-tertiary)'}`,
            borderRadius:    '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="ti ti-brand-teams" style={{
                fontSize: '16px',
                color:    form.enableTeamsAlerts ? '#185FA5' : 'var(--color-text-tertiary)'
              }} />
              <div>
                <div style={{
                  fontSize:   '12px',
                  fontWeight: '500',
                  color:      form.enableTeamsAlerts ? '#0C447C' : 'var(--color-text-secondary)'
                }}>
                  Teams Webhook Alerts
                </div>
                <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>
                  Send alerts to project Teams channels
                </div>
              </div>
            </div>
            <button
              onClick={() => setForm(p => ({ ...p, enableTeamsAlerts: !p.enableTeamsAlerts }))}
              style={{
                width:        '44px',
                height:       '24px',
                borderRadius: '12px',
                border:       'none',
                background:   form.enableTeamsAlerts ? '#185FA5' : '#D1D5DB',
                cursor:       'pointer',
                position:     'relative',
                transition:   'background 0.2s',
                flexShrink:   0
              }}
            >
              <div style={{
                width:        '18px',
                height:       '18px',
                borderRadius: '50%',
                background:   'white',
                position:     'absolute',
                top:          '3px',
                left:         form.enableTeamsAlerts ? '23px' : '3px',
                transition:   'left 0.2s',
                boxShadow:    '0 1px 3px rgba(0,0,0,0.2)'
              }} />
            </button>
          </div>

        </div>
      </div>

      {/* Save Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding:      '9px 20px',
            background:   saving ? '#6B9DC4' : '#185FA5',
            border:       'none',
            borderRadius: '8px',
            color:        'white',
            fontSize:     '12px',
            fontWeight:   '500',
            cursor:       saving ? 'not-allowed' : 'pointer',
            display:      'flex',
            alignItems:   'center',
            gap:          '6px'
          }}
        >
          {saving ? (
            <>
              <i className="ti ti-loader" style={{ fontSize: '13px' }} />
              Saving...
            </>
          ) : (
            <>
              <i className="ti ti-device-floppy" style={{ fontSize: '13px' }} />
              Save & Apply Rules
            </>
          )}
        </button>
      </div>

    </div>
  );
}
