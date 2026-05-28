import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';

const sidebarItems = [
  {
    group: 'Configuration',
    items: [
      { label: 'Azure AD',   icon: 'ti-brand-azure',  path: '/admin/azure' },
      { label: 'Metabase',   icon: 'ti-database',     path: '/admin/metabase' },
      { label: 'Email/SMTP', icon: 'ti-mail',         path: '/admin/smtp' },
    ]
  },
  {
    group: 'Projects',
    items: [
      { label: 'Projects',    icon: 'ti-folder',      path: '/admin/projects' },
      { label: 'Alert Rules', icon: 'ti-bell',        path: '/admin/alertrules' },
    ]
  },
  {
    group: 'System',
    items: [
      { label: 'Health Check', icon: 'ti-activity',    path: '/admin/health' },
      { label: 'Admin Access', icon: 'ti-shield-lock', path: '/admin/password' },
    ]
  }
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const { user } = useAuth();

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
        {sidebarItems.map(group => (
          <div key={group.group} style={{ marginBottom: '16px' }}>
            <div style={{
              fontSize: '9px', fontWeight: '500',
              color: 'var(--color-text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              padding: '0 16px',
              marginBottom: '4px'
            }}>
              {group.group}
            </div>
            {group.items.map(item => (
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
        ))}

        {/* Bottom — signed in as + back button */}
        <div style={{ marginTop: 'auto', padding: '0 8px' }}>
          {user && (
            <div style={{
              padding: '6px 8px', marginBottom: '6px',
              fontSize: '11px', color: 'var(--color-text-tertiary)'
            }}>
              {user.source === 'dev-login'
                ? <span style={{ color: '#d97706' }}>⚡ Dev Admin</span>
                : user.name || 'Admin'}
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

      {/* Main content — child route rendered here */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Outlet />
      </div>
    </div>
  );
}
