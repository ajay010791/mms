import { useState, useEffect } from 'react';
import api from '../../utils/axios';
import toast from 'react-hot-toast';

export default function AdminDomains() {
  const [domains,   setDomains]   = useState([]);
  const [newDomain, setNewDomain] = useState('');
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);

  useEffect(() => { loadDomains(); }, []);

  const loadDomains = async () => {
    try {
      setLoading(true);
      const res = await api.get('/api/admin/config/domains');
      setDomains(res.data?.domains || []);
    } catch (err) {
      toast.error('Failed to load domains');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    const domain = newDomain.toLowerCase().trim().replace(/^@/, '');
    if (!domain || !domain.includes('.')) {
      toast.error('Enter a valid domain (e.g. cloudfuze.com)');
      return;
    }
    if (domains.includes(domain)) {
      toast.error('Domain already in list');
      return;
    }
    const updated = [...domains, domain];
    await saveDomains(updated);
    setNewDomain('');
  };

  const handleRemove = async (domain) => {
    if (!confirm(`Remove ${domain} from whitelist?`)) return;
    const updated = domains.filter(d => d !== domain);
    await saveDomains(updated);
  };

  const saveDomains = async (list) => {
    setSaving(true);
    try {
      await api.post('/api/admin/config/domains', { domains: list });
      setDomains(list);
      toast.success('Domain whitelist updated ✓');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '24px', background: 'var(--color-background-tertiary)', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '18px', fontWeight: '500', color: 'var(--color-text-primary)', marginBottom: '4px' }}>
          Domain Whitelist
        </div>
        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
          Only users from these domains can login via MS365. Multiple domains supported.
        </div>
      </div>

      {/* Add domain */}
      <div style={{
        background: 'var(--color-background-primary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: '12px', padding: '16px 20px', marginBottom: '14px'
      }}>
        <div style={{
          fontSize: '12px', fontWeight: '500',
          color: 'var(--color-text-primary)', marginBottom: '10px'
        }}>
          Add Domain
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{
              position: 'absolute', left: '10px', top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-text-tertiary)', fontSize: '12px'
            }}>
              @
            </span>
            <input
              type="text"
              value={newDomain}
              onChange={e => setNewDomain(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              placeholder="cloudfuze.com"
              style={{
                width: '100%', padding: '8px 10px 8px 24px', fontSize: '12px',
                border: '0.5px solid var(--color-border-secondary)',
                borderRadius: '7px',
                background: 'var(--color-background-secondary)',
                color: 'var(--color-text-primary)',
                outline: 'none', boxSizing: 'border-box'
              }}
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={saving || !newDomain.trim()}
            style={{
              padding: '8px 16px',
              background: saving ? '#6B9DC4' : '#185FA5',
              border: 'none', borderRadius: '7px',
              color: 'white', fontSize: '12px', fontWeight: '500',
              cursor: saving ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            Add Domain
          </button>
        </div>
      </div>

      {/* Domain list */}
      <div style={{
        background: 'var(--color-background-primary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: '12px', overflow: 'hidden'
      }}>
        <div style={{
          padding: '10px 16px',
          background: 'var(--color-background-secondary)',
          borderBottom: '0.5px solid var(--color-border-tertiary)',
          fontSize: '11px', fontWeight: '500',
          color: 'var(--color-text-secondary)',
          display: 'flex', alignItems: 'center', gap: '6px'
        }}>
          <i className="ti ti-shield-check" style={{ fontSize: '13px', color: '#185FA5' }} />
          Whitelisted Domains ({domains.length})
        </div>

        {loading && (
          <div style={{
            padding: '24px', textAlign: 'center',
            fontSize: '12px', color: 'var(--color-text-secondary)'
          }}>
            Loading...
          </div>
        )}

        {!loading && domains.length === 0 && (
          <div style={{
            padding: '24px', textAlign: 'center',
            fontSize: '12px', color: 'var(--color-text-tertiary)'
          }}>
            <i className="ti ti-alert-triangle" style={{
              fontSize: '20px', color: '#BA7517',
              display: 'block', marginBottom: '8px'
            }} />
            No domains whitelisted.<br />
            <span style={{ fontSize: '11px' }}>
              All MS365 users can login until a domain is added.
            </span>
          </div>
        )}

        {domains.map((domain, idx) => (
          <div
            key={domain}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: idx < domains.length - 1
                ? '0.5px solid var(--color-border-tertiary)' : 'none'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '8px',
                background: '#E6F1FB',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <i className="ti ti-world" style={{ fontSize: '14px', color: '#185FA5' }} />
              </div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: '500', color: 'var(--color-text-primary)' }}>
                  @{domain}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>
                  All @{domain} accounts can login
                </div>
              </div>
            </div>
            <button
              onClick={() => handleRemove(domain)}
              style={{
                background: 'none', border: '0.5px solid #F7C1C1',
                borderRadius: '6px', padding: '5px 10px',
                cursor: 'pointer', color: '#A32D2D', fontSize: '11px',
                display: 'flex', alignItems: 'center', gap: '4px'
              }}
            >
              <i className="ti ti-trash" style={{ fontSize: '12px' }} />
              Remove
            </button>
          </div>
        ))}
      </div>

      <div style={{
        fontSize: '10px', color: 'var(--color-text-tertiary)', marginTop: '10px'
      }}>
        ⚠️ If no domains are whitelisted all MS365 users can login.
        Add at least one domain to restrict access.
      </div>
    </div>
  );
}
