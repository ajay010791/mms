import React from 'react';

export default function RAGMessages({ project }) {
  const diff = project.diff30min;
  const hasDiff = diff !== null && diff !== undefined;
  const increased = hasDiff && diff > 0;
  const noChange = hasDiff && diff === 0;

  return (
    <div style={{ flex: 1, background: '#fff', border: '0.5px solid #EDE9FE', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 3, height: 14, background: '#7c3aed', borderRadius: 2, display: 'inline-block' }} />
        Message Count
      </div>

      <div style={{ borderBottom: '1px solid #F3F4F6', paddingBottom: 8, marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
            <span style={{ fontSize: 13, color: '#374151' }}>Processed</span>
          </div>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{(project.processed_count || 0).toLocaleString()}</span>
        </div>
        {hasDiff && (
          <div style={{ marginTop: 3, marginLeft: 16, fontSize: 11, color: increased ? '#16a34a' : '#dc2626', fontWeight: 500 }}>
            {increased ? `↑ +${diff.toLocaleString()} vs 30 min ago` : '⚠ No change vs 30 min ago'}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #F3F4F6' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#d97706', display: 'inline-block' }} />
          <span style={{ fontSize: 13, color: '#374151' }}>In Progress</span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{(project.in_progress_count || 0).toLocaleString()}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626', display: 'inline-block' }} />
          <span style={{ fontSize: 13, color: '#374151' }}>Conflict</span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{(project.conflict_count || 0).toLocaleString()}</span>
      </div>
    </div>
  );
}
