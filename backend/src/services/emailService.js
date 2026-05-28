/*
 * AZURE PORTAL SETUP REQUIRED (one-time, done by INFRA team):
 *
 * 1. Azure Portal → App registrations → Your App
 *    → API Permissions → Add a permission
 *    → APIs my organization uses
 *    → Search: "Office 365 Exchange Online"
 *    → Delegated permissions → SMTP.Send
 *    → Grant admin consent
 *
 * 2. Authentication → Advanced settings
 *    → Allow public client flows: YES
 *
 * 3. Authentication → Platform: Single-page application
 *    → Redirect URI: http://localhost:3000 (already done)
 */

const nodemailer = require('nodemailer');
const axios      = require('axios');

// In-memory access token cache
let cachedAccessToken = null;
let tokenCacheExpiry  = null;

// ── REFRESH OAUTH2 ACCESS TOKEN ──────────────────────────────────────────────

const refreshOAuthToken = async () => {
  const mongoose = require('mongoose');
  const db = mongoose.connection.db;

  const doc = await db.collection('systemconfigs').findOne({ key: 'smtp' });

  if (!doc?.data?.refreshToken) {
    throw new Error(
      'No OAuth2 refresh token. Go to Admin → SMTP → Connect Microsoft Account'
    );
  }

  const { clientId, tenantId, refreshToken } = doc.data;

  console.log('[Email] Refreshing OAuth2 token...');

  const qs   = require('querystring');
  const resp = await axios.post(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    qs.stringify({
      client_id:     clientId,
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      scope:         'https://outlook.office365.com/SMTP.Send offline_access'
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const { access_token, refresh_token, expires_in } = resp.data;

  // Save new tokens to MongoDB
  await db.collection('systemconfigs').findOneAndUpdate(
    { key: 'smtp' },
    {
      $set: {
        'data.accessToken':  access_token,
        'data.tokenExpiry':  new Date(Date.now() + expires_in * 1000).toISOString(),
        ...(refresh_token ? { 'data.refreshToken': refresh_token } : {})
      }
    }
  );

  // Update cache
  cachedAccessToken = access_token;
  tokenCacheExpiry  = Date.now() + (expires_in - 60) * 1000;

  console.log('[Email] ✓ Token refreshed successfully');
  return access_token;
};

// ── GET VALID ACCESS TOKEN ────────────────────────────────────────────────────

const getAccessToken = async () => {
  if (cachedAccessToken && tokenCacheExpiry && Date.now() < tokenCacheExpiry) {
    return cachedAccessToken;
  }

  const mongoose = require('mongoose');
  const db       = mongoose.connection.db;
  const doc      = await db.collection('systemconfigs').findOne({ key: 'smtp' });

  if (doc?.data?.accessToken && doc?.data?.tokenExpiry) {
    const expiry = new Date(doc.data.tokenExpiry).getTime();
    if (expiry - Date.now() > 5 * 60 * 1000) {
      cachedAccessToken = doc.data.accessToken;
      tokenCacheExpiry  = expiry - 5 * 60 * 1000;
      return cachedAccessToken;
    }
  }

  return refreshOAuthToken();
};

// ── GET SMTP CONFIG ───────────────────────────────────────────────────────────

const getSmtpConfig = async () => {
  try {
    const mongoose = require('mongoose');
    const db  = mongoose.connection.db;
    const doc = await db.collection('systemconfigs').findOne({ key: 'smtp' });

    if (doc?.data?.host) {
      return {
        host:              doc.data.host,
        port:              Number(doc.data.port) || 587,
        username:          doc.data.username,
        password:          doc.data.password,
        fromName:          doc.data.fromName || 'Migration Monitor',
        defaultAlertEmail: doc.data.defaultAlertEmail || '',
        authType:          doc.data.authType || 'password',
        clientId:          doc.data.clientId,
        tenantId:          doc.data.tenantId,
        refreshToken:      doc.data.refreshToken,
        accessToken:       doc.data.accessToken,
        tokenExpiry:       doc.data.tokenExpiry
      };
    }
  } catch (e) {
    console.error('[Email] getSmtpConfig error:', e.message);
  }

  // .env fallback
  return {
    host:              process.env.SMTP_HOST,
    port:              Number(process.env.SMTP_PORT) || 587,
    username:          process.env.SMTP_USER,
    password:          process.env.SMTP_PASS,
    fromName:          'Migration Monitor',
    defaultAlertEmail: process.env.DEFAULT_ALERT_EMAIL || '',
    authType:          'password'
  };
};

// ── CREATE TRANSPORTER ────────────────────────────────────────────────────────

const createTransporter = async () => {
  const mongoose = require('mongoose');
  const db = mongoose.connection.db;

  // Load SMTP config directly from MongoDB
  const doc = await db.collection('systemconfigs').findOne({ key: 'smtp' });

  if (!doc?.data?.host) {
    throw new Error('SMTP not configured in Admin → SMTP');
  }

  const config = doc.data;

  console.log('[Email] Creating transporter:', {
    host:            config.host,
    port:            config.port,
    username:        config.username,
    authType:        config.authType || 'password',
    hasPassword:     !!config.password,
    hasRefreshToken: !!config.refreshToken,
    hasAccessToken:  !!config.accessToken
  });

  // ── OAUTH2 ──────────────────────────────────────────────
  if (config.authType === 'oauth2') {
    console.log('[Email] Using OAuth2 auth');

    // Check if stored access token is still valid
    let accessToken = config.accessToken;
    const tokenExpiry = config.tokenExpiry ? new Date(config.tokenExpiry).getTime() : 0;
    const isExpired   = tokenExpiry - Date.now() < 5 * 60 * 1000;

    if (isExpired || !accessToken) {
      console.log('[Email] Access token expired — refreshing');
      accessToken = await refreshOAuthToken();
    }

    const transporter = nodemailer.createTransport({
      host:   config.host   || 'smtp.office365.com',
      port:   Number(config.port) || 587,
      secure: false,
      auth: {
        type:         'OAuth2',
        user:         config.username,
        accessToken,
        clientId:     config.clientId,
        tenantId:     config.tenantId,
        refreshToken: config.refreshToken
      },
      tls: { rejectUnauthorized: false }
    });

    // Verify connection — retry with fresh token on failure
    try {
      await transporter.verify();
      console.log('[Email] ✓ OAuth2 SMTP verified');
    } catch (verifyErr) {
      console.error('[Email] OAuth2 verify failed:', verifyErr.message);
      console.log('[Email] Refreshing token and retrying...');
      const newToken = await refreshOAuthToken();

      const transporter2 = nodemailer.createTransport({
        host:   config.host || 'smtp.office365.com',
        port:   Number(config.port) || 587,
        secure: false,
        auth: {
          type:         'OAuth2',
          user:         config.username,
          accessToken:  newToken,
          clientId:     config.clientId,
          tenantId:     config.tenantId,
          refreshToken: config.refreshToken
        },
        tls: { rejectUnauthorized: false }
      });
      await transporter2.verify();
      console.log('[Email] ✓ OAuth2 SMTP verified after refresh');
      return { transporter: transporter2, config: { ...config, fromName: config.fromName || 'Migration Monitor' } };
    }

    return { transporter, config: { ...config, fromName: config.fromName || 'Migration Monitor' } };
  }

  // ── PASSWORD AUTH ────────────────────────────────────────
  console.log('[Email] Using password auth');

  if (!config.password) {
    throw new Error(
      'SMTP password not configured. Go to Admin → SMTP or connect Microsoft account.'
    );
  }

  const transporter = nodemailer.createTransport({
    host:   config.host,
    port:   Number(config.port) || 587,
    secure: config.port === 465,
    auth:   { user: config.username, pass: config.password },
    tls:    { rejectUnauthorized: false }
  });

  await transporter.verify();
  console.log('[Email] ✓ Password SMTP verified');

  return { transporter, config: { ...config, fromName: config.fromName || 'Migration Monitor' } };
};

// ── SEND ALERT ────────────────────────────────────────────────────────────────

const sendAlert = async (to, subject, textBody, htmlBody) => {
  try {
    // Validate and log full email before anything else
    console.log('[Email] Sending to:', JSON.stringify(to));
    console.log('[Email] Email length:', to?.length);
    console.log('[Email] Email chars:', [...(to || '')]);

    const cleanTo = (to || '').toString().trim().replace(/['"]/g, '');

    console.log('[Email] Clean email:', cleanTo);

    if (!cleanTo || !cleanTo.includes('@')) {
      throw new Error(`Invalid email address: "${cleanTo}"`);
    }

    const { transporter, config } = await createTransporter();

    const fromAddress = `"${config.fromName || 'Migration Monitor'}" <${config.username}>`;

    console.log('[Email] From:', fromAddress);
    console.log('[Email] To:', cleanTo);
    console.log('[Email] Subject:', subject);

    const info = await transporter.sendMail({
      from:    fromAddress,
      to:      cleanTo,
      subject,
      text:    textBody,
      html:    htmlBody || textBody.replace(/\n/g, '<br>')
    });

    console.log('[Email] ✓ Sent successfully');
    console.log('[Email] Message ID:', info.messageId);
    console.log('[Email] Accepted:', info.accepted);
    console.log('[Email] Rejected:', info.rejected);
    return true;

  } catch (err) {
    console.error('[Email] ✗ Failed:', err.message);

    // OAuth2: clear cache and retry once on auth failure
    if (
      err.message.includes('401') ||
      err.message.includes('token') ||
      err.message.includes('authentication')
    ) {
      console.log('[Email] Auth error — refreshing token and retrying...');
      try {
        cachedAccessToken = null;
        tokenCacheExpiry  = null;
        await refreshOAuthToken();
        const { transporter: t2, config: c2 } = await createTransporter();
        await t2.sendMail({
          from:    `"${c2.fromName || 'Migration Monitor'}" <${c2.username}>`,
          to:      (to || '').toString().trim().replace(/['"]/g, ''),
          subject,
          text:    textBody,
          html:    htmlBody || textBody.replace(/\n/g, '<br>')
        });
        console.log('[Email] ✓ Sent after token refresh');
        return true;
      } catch (retryErr) {
        console.error('[Email] Retry failed:', retryErr.message);
        throw retryErr;
      }
    }

    throw err;
  }
};

module.exports = {
  sendAlert,
  getSmtpConfig,
  createTransporter,
  refreshOAuthToken,
  getAccessToken
};
