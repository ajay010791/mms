import { useState, useEffect } from 'react';
import { useNavigate }         from 'react-router-dom';
import axios                   from 'axios';
import { useAuth }             from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function Login() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();

  const [username,   setUsername]   = useState('');
  const [password,   setPassword]   = useState('');
  const [showPass,   setShowPass]   = useState(false);
  const [devLoading, setDevLoading] = useState(false);
  const [msLoading,  setMsLoading]  = useState(false);
  const [devError,   setDevError]   = useState('');
  const [msError,    setMsError]    = useState('');

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true });
  }, [isAuthenticated]);

  // ── MS LOGIN ──────────────────────────────────────────────────────────────

  const handleMsLogin = async () => {
    setMsError('');
    setMsLoading(true);

    try {
      const configRes = await axios.get(`${API_URL}/api/auth/azure-config`);
      const { clientId, tenantId, configured } = configRes.data;

      if (!configured || !clientId || !tenantId) {
        setMsError('Azure AD not configured. Go to Admin → Azure AD first.');
        return;
      }

      // Dynamic import keeps MSAL out of module scope — it must never run
      // at load time or it will try to process redirect responses on every render.
      const { PublicClientApplication } = await import('@azure/msal-browser');

      const msal = new PublicClientApplication({
        auth: {
          clientId,
          authority:                 `https://login.microsoftonline.com/${tenantId}`,
          redirectUri:               window.location.origin,
          postLogoutRedirectUri:     window.location.origin,
          navigateToLoginRequestUrl: false
        },
        cache: {
          cacheLocation:          'sessionStorage',
          storeAuthStateInCookie: false
        },
        system: {
          allowRedirectInIframe: false,
          loggerOptions: {
            loggerCallback:    () => {},
            piiLoggingEnabled: false
          }
        }
      });

      await msal.initialize();

      // Wipe stale MSAL keys before popup — prevents interaction_in_progress errors
      Object.keys(sessionStorage)
        .filter(k => k.startsWith('msal.') && !k.includes('mm_auth'))
        .forEach(k => sessionStorage.removeItem(k));

      console.log('[Login] Opening MS popup...');

      const result = await msal.loginPopup({
        scopes:      ['openid', 'profile', 'email', 'User.Read'],
        redirectUri: window.location.origin,
        prompt:      'select_account'
      });

      console.log('[Login] Popup success:', result?.account?.username);

      // Clear ALL MSAL session state immediately after popup succeeds.
      // This is the critical step — without it MSAL finds its state on the
      // next render and triggers another cycle.
      Object.keys(sessionStorage)
        .filter(k => k.startsWith('msal.') && !k.includes('mm_auth'))
        .forEach(k => sessionStorage.removeItem(k));

      if (!result?.accessToken) {
        setMsError('No access token received from Microsoft');
        return;
      }

      const authRes = await axios.post(
        `${API_URL}/api/auth/ms-login`,
        { accessToken: result.accessToken },
        { headers: { 'Content-Type': 'application/json' } }
      );

      const { token, user } = authRes.data;
      console.log('[Login] Backend verified:', user.name, user.role);

      login(token, user);
      navigate('/dashboard', { replace: true });

    } catch (err) {
      console.error('[Login] MS error code:', err.errorCode);
      console.error('[Login] MS error:', err.errorMessage || err.message);

      // Clear MSAL state on any error too
      Object.keys(sessionStorage)
        .filter(k => k.startsWith('msal.') && !k.includes('mm_auth'))
        .forEach(k => sessionStorage.removeItem(k));

      if (err.errorCode === 'user_cancelled' ||
          err.errorCode === 'access_denied') {
        setMsError('Login cancelled');
      } else if (err.errorCode === 'popup_window_error' ||
                 err.errorCode === 'empty_window_error') {
        setMsError('Popup blocked. Please allow popups for this site.');
      } else if (err.errorCode === 'interaction_in_progress') {
        setMsError('Please refresh the page and try again.');
      } else {
        setMsError(
          err.response?.data?.error ||
          err.errorMessage ||
          err.message ||
          'Microsoft login failed. Please try again.'
        );
      }
    } finally {
      setMsLoading(false);
    }
  };

  // ── DEV LOGIN ─────────────────────────────────────────────────────────────

  const handleDevLogin = async (e) => {
    e.preventDefault();
    setDevError('');
    setDevLoading(true);
    try {
      const res = await axios.post(
        `${API_URL}/api/auth/dev-login`,
        { username: username.trim(), password },
        { headers: { 'Content-Type': 'application/json' } }
      );
      const { token, user, role, name } = res.data;
      login(token, user || { name: name || username, role: role || 'dev-admin', source: 'dev-login' });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setDevError(err.response?.data?.error || err.message || 'Login failed');
    } finally {
      setDevLoading(false);
    }
  };

  // ── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #EFF6FF 0%, #F9FAFB 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '52px', height: '52px', background: '#E6F1FB', borderRadius: '14px',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px'
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#185FA5" strokeWidth="2.5">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <div style={{ fontSize: '22px', fontWeight: '600', color: '#111827', marginBottom: '4px' }}>
            Migration Monitor
          </div>
          <div style={{ fontSize: '13px', color: '#6b7280' }}>Sign in to continue</div>
        </div>

        {/* MS Login */}
        <div style={{
          background: '#fff', border: '0.5px solid #E5E7EB',
          borderRadius: '10px', padding: '20px', marginBottom: '12px',
          boxShadow: '0 1px 8px rgba(0,0,0,0.06)'
        }}>
          <button
            onClick={handleMsLogin}
            disabled={msLoading}
            style={{
              width: '100%', padding: '10px 16px',
              border: '0.5px solid #E5E7EB', borderRadius: '8px',
              background: msLoading ? '#F9FAFB' : '#fff',
              cursor: msLoading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '10px', fontSize: '13px', fontWeight: '500', color: '#374151'
            }}
          >
            {msLoading ? (
              <>
                <div style={{
                  width: '16px', height: '16px',
                  border: '2px solid #E6F1FB', borderTop: '2px solid #185FA5',
                  borderRadius: '50%', animation: 'spin 0.8s linear infinite'
                }} />
                Connecting to Microsoft...
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 21 21">
                  <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                  <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                  <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                </svg>
                Sign in with Microsoft
              </>
            )}
          </button>

          {msError && (
            <div style={{
              marginTop: '10px', padding: '8px 10px',
              background: '#FCEBEB', border: '0.5px solid #F7C1C1',
              borderRadius: '6px', fontSize: '11px', color: '#A32D2D'
            }}>
              {msError}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '16px 0' }}>
          <div style={{ flex: 1, height: '0.5px', background: '#E5E7EB' }} />
          <span style={{ fontSize: '11px', color: '#9ca3af' }}>or dev access</span>
          <div style={{ flex: 1, height: '0.5px', background: '#E5E7EB' }} />
        </div>

        {/* Dev Login */}
        <div style={{ background: '#1e1e1e', borderRadius: '10px', padding: '20px', boxShadow: '0 1px 8px rgba(0,0,0,0.12)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
            <span style={{ fontSize: '12px', fontWeight: '500', color: '#9ca3af' }}>Dev / Admin login</span>
          </div>

          <form onSubmit={handleDevLogin}>
            <div style={{ marginBottom: '10px' }}>
              <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Username</label>
              <input
                type="text" value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="devadmin" required
                style={{
                  width: '100%', padding: '8px 10px',
                  background: '#2c2c2c', border: '0.5px solid #3f3f3f',
                  borderRadius: '6px', color: '#f1efe8',
                  fontSize: '12px', outline: 'none', boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required
                  style={{
                    width: '100%', padding: '8px 36px 8px 10px',
                    background: '#2c2c2c', border: '0.5px solid #3f3f3f',
                    borderRadius: '6px', color: '#f1efe8',
                    fontSize: '12px', outline: 'none', boxSizing: 'border-box'
                  }}
                />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  style={{
                    position: 'absolute', right: '8px', top: '50%',
                    transform: 'translateY(-50%)', background: 'none',
                    border: 'none', cursor: 'pointer', color: '#9ca3af',
                    padding: '0', fontSize: '14px', lineHeight: 1
                  }}
                >
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {devError && (
              <div style={{
                marginBottom: '12px', padding: '8px 10px',
                borderRadius: '6px', background: '#3b1a1a',
                border: '0.5px solid #7f1d1d', fontSize: '12px', color: '#fca5a5'
              }}>
                {devError}
              </div>
            )}

            <button type="submit" disabled={devLoading}
              style={{
                width: '100%', padding: '9px', borderRadius: '6px', border: 'none',
                background: devLoading ? '#374151aa' : '#374151',
                color: '#fff', fontSize: '13px', fontWeight: '500',
                cursor: devLoading ? 'not-allowed' : 'pointer'
              }}
            >
              {devLoading ? 'Signing in...' : 'Sign in as Dev Admin'}
            </button>
          </form>
        </div>

      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
