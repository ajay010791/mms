import { useState, useEffect } from 'react';
import api from '../../utils/axios';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const ROLES = [
  { value: 'pm',  label: 'Project Manager', color: '#185FA5', bg: '#E6F1FB' },
  { value: 'dm',  label: 'Duty Manager',    color: '#3B6D11', bg: '#EAF3DE' },
  { value: 'sl',  label: 'Shift Lead',      color: '#BA7517', bg: '#FAEEDA' },
  { value: 'eng', label: 'Engineer',        color: '#534AB7', bg: '#EEEDFE' }
];

const getRoleMeta = (role) => ROLES.find(r => r.value === role) || ROLES[3];

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [form, setForm] = useState({ email: '', name: '', role: 'eng' });

  const canAdd    = ['dev-admin', 'pm'].includes(currentUser?.role);
  const canDelete = ['dev-admin', 'pm'].includes(currentUser?.role);
  const canEdit   = ['dev-admin', 'pm', 'dm'].includes(currentUser?.role);

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/api/users');
      setUsers(res.data);
    } catch (err) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!form.email?.trim()) { toast.error('Email is required'); return; }
    setSaving(true);
    try {
      await api.post('/api/users', form);
      toast.success('User added ✓');
      setShowAdd(false);
      setForm({ email: '', name: '', role: 'eng' });
      loadUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await api.put(`/api/users/${userId}`, { role: newRole });
      toast.success('Role updated ✓');
      loadUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update role');
    }
  };

  const handleToggleActive = async (userId, isActive) => {
    try {
      await api.put(`/api/users/${userId}`, { isActive: !isActive });
      toast.success(isActive ? 'User deactivated' : 'User activated');
      loadUsers();
    } catch (err) {
      toast.error('Failed to update user');
    }
  };

  const handleDelete = async (userId, email) => {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;
    try {
      await api.delete(`/api/users/${userId}`);
      toast.success('User deleted');
      loadUsers();
    } catch (err) {
      toast.error('Failed to delete user');
    }
  };

  const getAvailableRoles = (targetUser) => {
    if (currentUser?.role === 'dm') {
      if (targetUser.role !== 'eng') return null;
      return ROLES.filter(r => ['dm', 'sl', 'eng'].includes(r.value));
    }
    return ROLES;
  };

  const inputStyle = {
    width: '100%', padding: '8px 10px', fontSize: '12px',
    border: '0.5px solid var(--color-border-secondary)',
    borderRadius: '7px',
    background: 'var(--color-background-secondary)',
    color: 'var(--color-text-primary)',
    outline: 'none', boxSizing: 'border-box'
  };

  const labelStyle = {
    fontSize: '11px', fontWeight: '500',
    color: 'var(--color-text-secondary)',
    display: 'block', marginBottom: '4px'
  };

  return (
    <div style={{ padding: '24px', background: 'var(--color-background-tertiary)', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '18px', fontWeight: '500', color: 'var(--color-text-primary)', marginBottom: '3px' }}>
            User Management
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            {users.length} user{users.length !== 1 ? 's' : ''} registered
          </div>
        </div>
        {canAdd && (
          <button
            onClick={() => setShowAdd(!showAdd)}
            style={{
              padding: '8px 16px', background: '#185FA5',
              border: 'none', borderRadius: '8px',
              color: 'white', fontSize: '12px', fontWeight: '500',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <i className="ti ti-user-plus" style={{ fontSize: '14px' }} />
            Add User
          </button>
        )}
      </div>

      {/* Add User Form */}
      {showAdd && (
        <div style={{
          background: 'var(--color-background-primary)',
          border: '0.5px solid var(--color-border-tertiary)',
          borderRadius: '12px', padding: '20px', marginBottom: '16px'
        }}>
          <div style={{
            fontSize: '13px', fontWeight: '500',
            color: 'var(--color-text-primary)',
            marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px'
          }}>
            <i className="ti ti-user-plus" style={{ fontSize: '14px', color: '#185FA5' }} />
            Add New User
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: '2fr 2fr 1fr',
            gap: '12px', marginBottom: '14px'
          }}>
            <div>
              <label style={labelStyle}>Email Address *</label>
              <input
                type="email" value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="user@cloudfuze.com"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Name</label>
              <input
                type="text" value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Full name"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Role</label>
              <select
                value={form.role}
                onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                style={inputStyle}
              >
                {ROLES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleAdd} disabled={saving}
              style={{
                padding: '8px 16px',
                background: saving ? '#6B9DC4' : '#185FA5',
                border: 'none', borderRadius: '7px',
                color: 'white', fontSize: '12px', fontWeight: '500',
                cursor: saving ? 'not-allowed' : 'pointer'
              }}
            >
              {saving ? 'Adding...' : 'Add User'}
            </button>
            <button
              onClick={() => { setShowAdd(false); setForm({ email: '', name: '', role: 'eng' }); }}
              style={{
                padding: '8px 14px',
                background: 'var(--color-background-secondary)',
                border: '0.5px solid var(--color-border-secondary)',
                borderRadius: '7px',
                color: 'var(--color-text-secondary)',
                fontSize: '12px', cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div style={{
        background: 'var(--color-background-primary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: '12px', overflow: 'hidden'
      }}>
        {/* Table header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr',
          padding: '10px 16px',
          background: 'var(--color-background-secondary)',
          borderBottom: '0.5px solid var(--color-border-tertiary)',
          fontSize: '10px', fontWeight: '500',
          color: 'var(--color-text-secondary)',
          textTransform: 'uppercase', letterSpacing: '0.05em'
        }}>
          <div>User</div>
          <div>Email</div>
          <div>Role</div>
          <div>Status</div>
          <div>Actions</div>
        </div>

        {loading && (
          <div style={{
            padding: '32px', textAlign: 'center',
            color: 'var(--color-text-secondary)', fontSize: '13px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
          }}>
            <i className="ti ti-loader" style={{ fontSize: '16px' }} />
            Loading users...
          </div>
        )}

        {!loading && users.length === 0 && (
          <div style={{
            padding: '32px', textAlign: 'center',
            color: 'var(--color-text-tertiary)', fontSize: '13px'
          }}>
            No users yet. Add the first user above.
          </div>
        )}

        {!loading && users.map((u, idx) => {
          const meta           = getRoleMeta(u.role);
          const availableRoles = getAvailableRoles(u);
          const isCurrentUser  = u.email === currentUser?.email;

          return (
            <div
              key={u._id}
              style={{
                display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr',
                padding: '12px 16px',
                borderBottom: idx < users.length - 1
                  ? '0.5px solid var(--color-border-tertiary)' : 'none',
                alignItems: 'center',
                opacity:    u.isActive ? 1 : 0.5,
                background: isCurrentUser
                  ? 'var(--color-background-secondary)' : 'transparent'
              }}
            >
              {/* Name */}
              <div>
                <div style={{
                  fontSize: '12px', fontWeight: '500',
                  color: 'var(--color-text-primary)',
                  display: 'flex', alignItems: 'center', gap: '6px'
                }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%',
                    background: meta.bg, border: `1px solid ${meta.color}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '11px', fontWeight: '600', color: meta.color, flexShrink: 0
                  }}>
                    {(u.name || u.email)[0].toUpperCase()}
                  </div>
                  <div>
                    <div>{u.name || '—'}</div>
                    {isCurrentUser && (
                      <div style={{ fontSize: '9px', color: '#185FA5' }}>(you)</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Email */}
              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                {u.email}
              </div>

              {/* Role */}
              <div>
                {canEdit && availableRoles && !isCurrentUser ? (
                  <select
                    value={u.role}
                    onChange={e => handleRoleChange(u._id, e.target.value)}
                    style={{
                      fontSize: '11px', padding: '3px 6px',
                      border: `1px solid ${meta.color}`,
                      borderRadius: '6px', background: meta.bg,
                      color: meta.color, cursor: 'pointer',
                      fontWeight: '500', outline: 'none'
                    }}
                  >
                    {availableRoles.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                ) : (
                  <span style={{
                    fontSize: '10px', fontWeight: '500',
                    padding: '2px 8px', borderRadius: '6px',
                    background: meta.bg, color: meta.color
                  }}>
                    {meta.label}
                  </span>
                )}
              </div>

              {/* Status */}
              <div>
                <span style={{
                  fontSize: '10px', fontWeight: '500',
                  padding: '2px 8px', borderRadius: '6px',
                  background: u.isActive ? '#EAF3DE' : '#F3F4F6',
                  color:      u.isActive ? '#27500A' : '#6b7280'
                }}>
                  {u.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {canDelete && !isCurrentUser && (
                  <>
                    <button
                      onClick={() => handleToggleActive(u._id, u.isActive)}
                      title={u.isActive ? 'Deactivate user' : 'Activate user'}
                      style={{
                        background: 'none',
                        border: '0.5px solid var(--color-border-secondary)',
                        borderRadius: '6px', padding: '4px 8px',
                        cursor: 'pointer',
                        color: u.isActive ? '#854F0B' : '#3B6D11',
                        fontSize: '11px'
                      }}
                    >
                      <i className={`ti ${u.isActive ? 'ti-user-off' : 'ti-user-check'}`}
                         style={{ fontSize: '13px' }} />
                    </button>
                    <button
                      onClick={() => handleDelete(u._id, u.email)}
                      title="Delete user"
                      style={{
                        background: 'none',
                        border: '0.5px solid #F7C1C1',
                        borderRadius: '6px', padding: '4px 8px',
                        cursor: 'pointer', color: '#A32D2D', fontSize: '11px'
                      }}
                    >
                      <i className="ti ti-trash" style={{ fontSize: '13px' }} />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
        fontSize: '10px', color: 'var(--color-text-tertiary)',
        marginTop: '10px', textAlign: 'right'
      }}>
        Users auto-register as Engineer on first MS365 login
      </div>
    </div>
  );
}
