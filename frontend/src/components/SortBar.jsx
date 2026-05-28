import React from 'react';

export default function SortBar({ sort, onSort }) {
  const btn = (key, label) => (
    <button
      key={key}
      onClick={() => onSort(key)}
      style={{
        padding: '5px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
        border: sort === key ? '1.5px solid #2563eb' : '1px solid #E5E7EB',
        background: sort === key ? '#EFF6FF' : '#fff',
        color: sort === key ? '#2563eb' : '#374151', fontWeight: sort === key ? 600 : 400
      }}>
      {label}
    </button>
  );
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: '#6b7280', marginRight: 4 }}>Sort:</span>
      {btn('date-desc', '📅 Date ↓')}
      {btn('date-asc', '📅 Date ↑')}
      {btn('az', '🔤 A–Z')}
      {btn('za', '🔤 Z–A')}
    </div>
  );
}
