import React, { useState, useMemo } from 'react';

export default function ProjectDropdown({ projects, selectedId, onSelect }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() =>
    (projects || []).filter(p =>
      p.projectName.toLowerCase().includes(search.toLowerCase()) ||
      (p.cloudSource || '').toLowerCase().includes(search.toLowerCase())
    ), [projects, search]);

  return (
    <div>
      <input
        type="text"
        placeholder="Search projects..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: '100%', padding: '8px 12px', fontSize: 13, outline: 'none',
          border: '1px solid #E5E7EB', borderBottom: 'none',
          borderRadius: '8px 8px 0 0', boxSizing: 'border-box', display: 'block',
          background: '#fff',
        }}
      />
      <select
        value={selectedId || ''}
        onChange={e => onSelect(e.target.value || null)}
        style={{
          width: '100%', padding: '8px 12px', fontSize: 13, outline: 'none',
          border: '1px solid #E5E7EB', borderRadius: '0 0 8px 8px',
          cursor: 'pointer', background: '#fff', display: 'block', boxSizing: 'border-box',
        }}>
        <option value="">— Select a project —</option>
        {filtered.map(p => (
          <option key={p.id} value={p.id}>
            {p.projectName}{p.cloudSource ? ` — ${p.cloudSource}` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
