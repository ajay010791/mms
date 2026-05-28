// Exchange authorization code for tokens DIRECTLY from the browser.
// AADSTS9002327: SPA apps must redeem authorization codes in the browser,
// not on a backend server. The backend only stores the resulting tokens.
export const exchangeCodeForTokens = async (
  code,
  codeVerifier,
  redirectUri,
  clientId,
  tenantId
) => {
  const params = new URLSearchParams({
    client_id:     clientId,
    grant_type:    'authorization_code',
    code,
    redirect_uri:  redirectUri,
    code_verifier: codeVerifier,
    scope: [
      'https://outlook.office365.com/SMTP.Send',
      'offline_access',
      'openid',
      'profile',
      'email'
    ].join(' ')
  });

  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    params.toString()
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'Token exchange failed');
  }

  return data;
};

export const decodeJwt = (token) => {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch (_) {
    return null;
  }
};
