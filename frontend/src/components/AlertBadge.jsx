import React from 'react';

export default function AlertBadge({ isStalled, hasLongConflict }) {
  if (!isStalled && !hasLongConflict) return null;
  const label = hasLongConflict ? '🔴 Conflict 4h+' : '⚠️ Stalled';
  const bg = hasLongConflict ? '#fef2f2' : '#fffbeb';
  const color = hasLongConflict ? '#dc2626' : '#d97706';
  const border = hasLongConflict ? '#fca5a5' : '#fcd34d';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: bg, color, border: `1px solid ${border}` }}>
      {label}
    </span>
  );
}
