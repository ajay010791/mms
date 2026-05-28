import React from 'react';
import { getTypeColor } from '../utils/classifier';

const TYPE_ICONS = { messaging: '💬', email: '✉️', content: '📁' };
const TYPE_LABELS = { messaging: 'Messaging', email: 'Email', content: 'Content' };

// mode="anchor" (list view): all boxes at full opacity, clicking scrolls to section
// mode="filter" (detail view): non-active boxes dim to 0.5 when one is selected
export default function FilterBoxes({ projects, activeFilter, onFilter, mode = 'anchor' }) {
  const counts = { messaging: 0, email: 0, content: 0 };
  (projects || []).forEach(p => { if (counts[p.type] !== undefined) counts[p.type]++; });

  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
      {['messaging', 'email', 'content'].map(type => {
        const active = activeFilter === type;
        const color = getTypeColor(type);
        const dimmed = mode === 'filter' && activeFilter !== null && !active;
        return (
          <button
            key={type}
            onClick={() => onFilter(active ? null : type)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
              borderRadius: 10, border: active ? `1.5px solid ${color}` : '0.5px solid #E5E7EB',
              background: active ? color + '10' : '#fff', cursor: 'pointer',
              boxShadow: active ? `0 0 0 3px ${color}20` : '0 1px 2px rgba(0,0,0,0.05)',
              transition: 'all 0.15s',
              opacity: dimmed ? 0.5 : 1,
            }}>
            <span style={{ fontSize: 18 }}>{TYPE_ICONS[type]}</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: active ? color : '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {TYPE_LABELS[type]}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: active ? color : '#111827', lineHeight: 1 }}>
                {counts[type]}
              </div>
            </div>
            <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 20, background: active ? color : '#F3F4F6', color: active ? '#fff' : '#6b7280', fontWeight: 600 }}>
              {counts[type]} project{counts[type] !== 1 ? 's' : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}
