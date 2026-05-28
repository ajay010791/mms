import React from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth';

export default function TopBar({ layout, onLayoutChange, onExportAll }) {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const initials = user?.name ? user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : 'U';
  const isDev = user?.source === 'dev-login';

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', height: 56, background: '#fff', borderBottom: '0.5px solid #E5E7EB', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Migration Monitor</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {onLayoutChange && (
          <>
            <button onClick={() => onLayoutChange('list')} title="List view"
              style={{ padding: '5px 10px', fontSize: 12, borderRadius: 6, border: layout === 'list' ? '1.5px solid #2563eb' : '1px solid #E5E7EB', background: layout === 'list' ? '#EFF6FF' : '#fff', color: layout === 'list' ? '#2563eb' : '#374151', cursor: 'pointer', fontWeight: layout === 'list' ? 600 : 400 }}>
              ≡ List
            </button>
            <button onClick={() => onLayoutChange('detail')} title="Detail view"
              style={{ padding: '5px 10px', fontSize: 12, borderRadius: 6, border: layout === 'detail' ? '1.5px solid #2563eb' : '1px solid #E5E7EB', background: layout === 'detail' ? '#EFF6FF' : '#fff', color: layout === 'detail' ? '#2563eb' : '#374151', cursor: 'pointer', fontWeight: layout === 'detail' ? 600 : 400 }}>
              ⊡ Detail
            </button>
          </>
        )}
        {onExportAll && (
          <button onClick={onExportAll}
            style={{ padding: '5px 12px', fontSize: 12, borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', cursor: 'pointer' }}>
            ↓ Export all
          </button>
        )}
        {isAdmin && (
          <button onClick={() => navigate('/admin')}
            style={{ padding: '5px 12px', fontSize: 12, borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', cursor: 'pointer' }}>
            ⚙ Admin
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {isDev && (
          <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: '#2C2C2A', color: '#F1EFE8', letterSpacing: '0.05em' }}>Dev Admin</span>
        )}
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: isDev ? '#2C2C2A' : '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>
          {isDev ? 'DA' : initials}
        </div>
        <span style={{ fontSize: 13, color: '#374151', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</span>
        <button onClick={logout}
          style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', color: '#6b7280', cursor: 'pointer' }}>
          Sign out
        </button>
      </div>
    </div>
  );
}
