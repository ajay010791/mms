import React from 'react';

const DOT_COLORS = {
  total: '#2563eb',
  completed: '#16a34a',
  in_progress: '#d97706',
  conflict: '#dc2626',
  no_message: '#6b7280'
};

function Row({ color, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #F3F4F6' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />
        <span style={{ fontSize: 13, color: '#374151' }}>{label}</span>
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{(value || 0).toLocaleString()}</span>
    </div>
  );
}

export default function RAGWorkspace({ project }) {
  return (
    <div style={{ flex: 1, background: '#fff', border: '0.5px solid #DBEAFE', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 3, height: 14, background: '#2563eb', borderRadius: 2, display: 'inline-block' }} />
        Workspace Status
      </div>
      <Row color={DOT_COLORS.total} label="Total Channels" value={project.total_channels} />
      <Row color={DOT_COLORS.completed} label="Completed" value={project.completed} />
      <Row color={DOT_COLORS.in_progress} label="In Progress" value={project.in_progress} />
      <Row color={DOT_COLORS.conflict} label="Conflict" value={project.conflict} />
      <Row color={DOT_COLORS.no_message} label="No Message" value={project.no_message} />
    </div>
  );
}
