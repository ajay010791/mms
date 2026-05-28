import React from 'react';

const OPTIONS = [
  { value: '0', label: 'Now' },
  { value: '120', label: '2 hours ago' },
  { value: '360', label: '6 hours ago' },
  { value: '1440', label: '24 hours ago' }
];

export default function TimeFilter({ value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 12, color: '#6b7280' }}>View:</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ fontSize: 13, padding: '4px 8px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', cursor: 'pointer' }}>
        {OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
