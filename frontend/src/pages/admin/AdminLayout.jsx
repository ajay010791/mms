import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function AdminLayout() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const isSuperAdmin = user?.role === 'dev-admin';
  const isPM  = ['dev-admin', 'pm'].includes(user?.role);
  const isDM  = ['dev-admin', 'pm', 'dm'].includes(user?.role);
  const isSL  = ['dev-admin', 'pm', 'dm', 'sl'].includes(user?.role);

  const sidebarItems = [
    ...(isSL ? [{
      path:  '/admin/users',
      icon:  'ti-users',
      label: 'Users'
    }] : []),
    {
      path:  '/admin/projects',
      icon:  'ti-layout-list',
      label: 'Projects'
    },
    ...(isPM ? [{
      path:  '/admin/alertrules',
      icon:  'ti-bell',
      label: 'Alert Rules'
    }] : []),
    ...(isPM ? [{
      path:  '/admin/smtp',
      icon:  'ti-mail',
      label: 'Email / SMTP'
    }] : []),
    ...(isPM ? [{
      path:  '/admin/azure',
      icon:  'ti-brand-azure',
      label: 'Azure AD'
    }] : []),
    ...(isPM ? [{
      path:  '/admin/metabase',
      icon:  'ti-database',
      label: 'Metabase'
    }] : []),
    ...(isSuperAdmin ? [{
      path:  '/admin/domains',
      icon:  'ti-shield-check',
      label: 'Domain Whitelist'
    }] : []),
    ...(isPM ? [{
      path:  '/admin/health',
      icon:  'ti-heartbeat',
      label: 'Health'
    }] : []),
    ...(isSuperAdmin ? [{
      path:  '/admin/password',
      icon:  'ti-key',
      label: 'Password'
    }] : [])
  ];

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      fontFamily: 'var(--font-sans)',
      background: 'var(--color-background-tertiary)'
    }}>
      {/* Sidebar */}
      <div style={{
        width: '200px',
        flexShrink: 0,
        background: 'var(--color-background-primary)',
        borderRight: '0.5px solid var(--color-border-tertiary)',
        display: 'flex',
        flexDirection: 'column',
        padding: '16px 0',
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto'
      }}>
        {/* Logo */}
        <div style={{
          padding: '0 16px 16px',
          borderBottom: '0.5px solid var(--color-border-tertiary)',
          marginBottom: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <i className="ti ti-activity" style={{ fontSize: '16px', color: '#378ADD' }} />
            <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--color-text-primary)' }}>
              Migration Monitor
            </span>
          </div>
          <div style={{
            fontSize: '10px',
            background: '#2C2C2A',
            color: '#F1EFE8',
            padding: '2px 8px',
            borderRadius: '6px',
            display: 'inline-block'
          }}>
            Admin Panel
          </div>
        </div>

        {/* Nav items */}
        <div style={{ flex: 1 }}>
          {sidebarItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                fontSize: '12px',
                color: isActive ? '#185FA5' : 'var(--color-text-secondary)',
                background: isActive ? '#E6F1FB' : 'transparent',
                borderLeft: isActive ? '2px solid #378ADD' : '2px solid transparent',
                textDecoration: 'none',
                fontWeight: isActive ? '500' : '400',
                transition: 'all 0.1s'
              })}
            >
              <i className={`ti ${item.icon}`} style={{ fontSize: '14px' }} />
              {item.label}
            </NavLink>
          ))}
        </div>

        {/* Bottom — signed in as + back button */}
        <div style={{ marginTop: 'auto', padding: '0 8px' }}>
          {user && (
            <div style={{
              padding: '6px 8px', marginBottom: '6px',
              fontSize: '11px', color: 'var(--color-text-tertiary)'
            }}>
              {user.role === 'dev-admin'
                ? <span style={{ color: '#d97706' }}>⚡ Dev Admin</span>
                : user.name || user.email || 'Admin'}
            </div>
          )}
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              width: '100%',
              display: 'flex', alignItems: 'center',
              gap: '6px', padding: '8px',
              background: 'none',
              border: '0.5px solid var(--color-border-tertiary)',
              borderRadius: '6px',
              fontSize: '11px',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer'
            }}
          >
            <i className="ti ti-arrow-left" style={{ fontSize: '13px' }} />
            Back to Dashboard
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Outlet />
      </div>
    </div>
  );
}
