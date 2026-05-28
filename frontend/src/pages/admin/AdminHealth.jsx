import React, { useState, useEffect, useCallback } from 'react';
import api from '../../utils/axios';

import { format } from 'date-fns';

function StatusDot({ ok }) {
  return <span style={{ width: 10, height: 10, borderRadius: '50%', background: ok ? '#16a34a' : '#dc2626', display: 'inline-block', marginRight: 8 }} />;
}

function Row({ label, ok, detail }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #F3F4F6' }}>
      <StatusDot ok={ok} />
      <span style={{ fontSize: 13, fontWeight: 500, color: '#111827', flex: 1 }}>{label}</span>
      <span style={{ fontSize: 12, color: '#6b7280' }}>{detail}</span>
    </div>
  );
}

export default function AdminHealth() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);

  const check = useCallback(async () => {
    setLoading(true);
    try { const r = await api.get('/api/admin/health'); setHealth(r.data); }
    catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { check(); const t = setInterval(check, 30000); return () => clearInterval(t); }, [check]);

  return (
    <>
      <div style={{ maxWidth: 680 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>Health Check</h1>
          <button onClick={check} disabled={loading} style={{ padding: '7px 16px', borderRadius: 7, border: '1px solid #E5E7EB', background: '#fff', fontSize: 13, color: '#374151', cursor: 'pointer' }}>{loading ? 'Checking...' : 'Run check now'}</button>
        </div>
        {health ? (
          <div style={{ background: '#fff', border: '0.5px solid #E5E7EB', borderRadius: 12, padding: '8px 20px' }}>
            <Row label="Metabase connection" ok={health.metabase === 'connected'} detail={health.metabaseLastConnected ? `Last: ${format(new Date(health.metabaseLastConnected), 'HH:mm:ss')}` : 'Never connected'} />
            <Row label="MongoDB connection" ok={health.mongodb === 'connected'} detail={health.mongodb} />
            <Row label="SMTP service" ok={health.smtp === 'connected'} detail={health.smtp} />
            <Row label="Cron jobs" ok={health.cronJobs?.snapshotJob === 'running'} detail={health.cronJobs?.nextRun ? `Next: ${format(new Date(health.cronJobs.nextRun), 'HH:mm')}` : 'Not running'} />
            <Row label="Projects loaded" ok={health.snapshotMemory?.projects > 0} detail={`${health.snapshotMemory?.projects || 0} projects`} />
            <Row label="Last snapshot" ok={!!health.lastSnapshot} detail={health.lastSnapshot ? format(new Date(health.lastSnapshot), 'HH:mm:ss') : 'None yet'} />
            <div style={{ display: 'flex', alignItems: 'center', padding: '12px 0' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#2563eb', display: 'inline-block', marginRight: 8 }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: '#111827', flex: 1 }}>Snapshot memory usage</span>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{health.snapshotMemory?.projects || 0} projects × {Math.round((health.snapshotMemory?.snapshots || 0) / Math.max(health.snapshotMemory?.projects || 1, 1))} snapshots = {health.snapshotMemory?.snapshots || 0} entries</span>
            </div>
          </div>
        ) : (
          <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>{loading ? 'Running health check...' : 'Click "Run check now" to check system health'}</div>
        )}
      </div>
    </>
  );
}
