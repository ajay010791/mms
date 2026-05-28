import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../utils/axios';
import { exchangeCodeForTokens, decodeJwt } from '../../utils/smtpOAuth';

export default function SmtpOAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const [status,  setStatus]  = useState('processing');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const code  = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      setStatus('error');
      setMessage(searchParams.get('error_description') || error);
      return;
    }

    if (!code) {
      setStatus('error');
      setMessage('No authorization code received');
      return;
    }

    const handleCallback = async () => {
      try {
        setMessage('Verifying with Microsoft...');

        // Step 1: Retrieve PKCE verifier + config from backend
        const configRes = await api.get(
          `/api/admin/config/smtp/oauth2/pkce?state=${state}`
        );
        const { codeVerifier, redirectUri, clientId, tenantId } = configRes.data;

        if (!codeVerifier) {
          throw new Error('PKCE verifier not found. Please try connecting again.');
        }

        setMessage('Exchanging authorization code...');

        // Step 2: Exchange code IN THE BROWSER — required for SPA (AADSTS9002327)
        const tokens = await exchangeCodeForTokens(
          code, codeVerifier, redirectUri, clientId, tenantId
        );

        console.log('[SmtpCallback] Tokens received:', {
          hasAccessToken:  !!tokens.access_token,
          hasRefreshToken: !!tokens.refresh_token,
          expiresIn:       tokens.expires_in
        });

        setMessage('Saving configuration...');

        // Step 3: Decode id_token for email
        const payload   = decodeJwt(tokens.id_token);
        const userEmail = payload?.email || payload?.preferred_username || '';

        // Step 4: Send tokens to backend for storage — no Azure calls on server side
        await api.post('/api/admin/config/smtp/oauth2/save-tokens', {
          accessToken:  tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresIn:    tokens.expires_in,
          userEmail,
          clientId,
          tenantId
        });

        setStatus('success');
        setMessage(`Connected: ${userEmail}`);
        setTimeout(() => navigate('/admin/smtp'), 2000);

      } catch (err) {
        console.error('[SmtpCallback] Error:', err);
        setStatus('error');
        setMessage(err.message || 'Connection failed');
      }
    };

    handleCallback();
  }, []);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-sans)',
      background: 'var(--color-background-secondary, #f9fafb)'
    }}>
      <div style={{
        background: '#fff',
        border: '0.5px solid #E5E7EB',
        borderRadius: '12px',
        padding: '40px',
        textAlign: 'center',
        maxWidth: '420px',
        width: '100%',
        boxShadow: '0 1px 8px rgba(0,0,0,0.06)'
      }}>
        {status === 'processing' && (
          <>
            <div style={{
              width: '44px', height: '44px',
              border: '3px solid #E6F1FB',
              borderTop: '3px solid #185FA5',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 16px'
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <div style={{ fontSize: '15px', fontWeight: '500', color: '#111827', marginBottom: '6px' }}>
              Connecting Microsoft Account
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>
              {message || 'Please wait...'}
            </div>
          </>
        )}

        {status === 'success' && (
          <>
            <i className="ti ti-circle-check" style={{
              fontSize: '44px', color: '#3B6D11',
              display: 'block', marginBottom: '16px'
            }} />
            <div style={{ fontSize: '15px', fontWeight: '500', color: '#27500A', marginBottom: '8px' }}>
              Connected Successfully!
            </div>
            <div style={{ fontSize: '12px', color: '#374151', marginBottom: '6px' }}>
              {message}
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af' }}>
              Redirecting to SMTP settings...
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <i className="ti ti-circle-x" style={{
              fontSize: '44px', color: '#A32D2D',
              display: 'block', marginBottom: '16px'
            }} />
            <div style={{ fontSize: '15px', fontWeight: '500', color: '#791F1F', marginBottom: '8px' }}>
              Connection Failed
            </div>
            <div style={{
              fontSize: '11px', color: '#6b7280', marginBottom: '20px',
              padding: '10px 14px', background: '#FCEBEB',
              borderRadius: '8px', textAlign: 'left'
            }}>
              {message}
            </div>
            <button
              onClick={() => navigate('/admin/smtp')}
              style={{
                padding: '9px 20px', background: '#185FA5',
                color: 'white', border: 'none',
                borderRadius: '7px', cursor: 'pointer',
                fontSize: '12px', fontWeight: '500'
              }}
            >
              Back to SMTP Settings
            </button>
          </>
        )}
      </div>
    </div>
  );
}
