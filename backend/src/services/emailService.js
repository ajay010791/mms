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
 *    → Redirect URI: http://localhost:5047 (already done)
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

// ── MICROSOFT GRAPH API EMAIL ─────────────────────────────────────────────────

const getGraphEmailConfig = async () => {
  try {
    const mongoose = require('mongoose');
    const db  = mongoose.connection.db;
    const doc = await db.collection('systemconfigs').findOne({ key: 'graphEmail' });
    if (doc?.data?.clientId && doc?.data?.clientSecret && doc?.data?.tenantId && doc?.data?.senderEmail) {
      return doc.data;
    }
  } catch (e) {
    console.error('[Email] getGraphEmailConfig error:', e.message);
  }
  return null;
};

const getGraphToken = async (config) => {
  const qs   = require('querystring');
  const resp = await axios.post(
    `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
    qs.stringify({
      grant_type:    'client_credentials',
      client_id:     config.clientId,
      client_secret: config.clientSecret,
      scope:         'https://graph.microsoft.com/.default'
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  if (!resp.data.access_token) throw new Error('No access token in Graph response');
  return resp.data.access_token;
};

const sendViaGraph = async (to, subject, textBody, htmlBody, config) => {
  const token = await getGraphToken(config);

  const recipients = to
    .split(',')
    .map(e => e.trim())
    .filter(e => e.includes('@'))
    .map(address => ({ emailAddress: { address } }));

  if (recipients.length === 0) throw new Error(`No valid recipients: "${to}"`);

  try {
    await axios.post(
      `https://graph.microsoft.com/v1.0/users/${config.senderEmail}/sendMail`,
      {
        message: {
          subject,
          body:         { contentType: 'HTML', content: htmlBody || textBody.replace(/\n/g, '<br>') },
          toRecipients: recipients
        },
        saveToSentItems: true
      },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    // Extract the Graph API error message for clear diagnostics
    const graphError = err.response?.data?.error;
    if (graphError) {
      const code    = graphError.code    || err.response?.status;
      const message = graphError.message || 'Unknown Graph API error';
      console.error(`[Email] Graph API error ${code}:`, message);

      // Translate common 403 codes into actionable messages
      if (err.response?.status === 403) {
        if (code === 'Authorization_RequestDenied' || message.includes('permission')) {
          throw new Error(
            `403 Authorization_RequestDenied — The app is missing the Mail.Send Application permission or admin consent has not been granted. ` +
            `Go to Azure Portal → App registrations → API permissions → Microsoft Graph → Application permissions → Mail.Send → Grant admin consent.`
          );
        }
        if (code === 'MailboxNotEnabledForRESTAPI' || message.includes('MailboxNotEnabled')) {
          throw new Error(
            `403 MailboxNotEnabledForRESTAPI — The sender mailbox "${config.senderEmail}" does not have an active Exchange/Outlook licence. ` +
            `Assign a Microsoft 365 licence that includes Exchange Online to this account.`
          );
        }
        throw new Error(`403 ${code}: ${message}`);
      }
      throw new Error(`Graph API ${code}: ${message}`);
    }
    throw err;
  }

  console.log(`[Email] ✓ Sent via Microsoft Graph to: ${to}`);
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

  const doc = await db.collection('systemconfigs')
    .findOne({ key: 'smtp' });

  if (!doc?.data?.host) {
    throw new Error('SMTP not configured. Go to Admin → SMTP.');
  }

  const config = doc.data;

  console.log('[Email] Creating transporter:', {
    host:        config.host,
    port:        config.port,
    username:    config.username,
    authType:    'password',
    hasPassword: !!config.password
  });

  if (!config.password) {
    throw new Error(
      'SMTP password not set. Go to Admin → SMTP and enter password.'
    );
  }

  const transporter = nodemailer.createTransport({
    host:   config.host,
    port:   Number(config.port) || 587,
    secure: Number(config.port) === 465,
    auth: {
      user: config.username,
      pass: config.password
    },
    tls: { rejectUnauthorized: false }
  });

  await transporter.verify();
  console.log('[Email] ✓ SMTP verified');

  return {
    transporter,
    config: { ...config, fromName: config.fromName || 'Migration Monitor' }
  };
};

// ── SEND ALERT ────────────────────────────────────────────────────────────────

const sendAlert = async (to, subject, textBody, htmlBody) => {
  try {
    // Normalise comma-separated recipients
    const cleanTo = (to || '').toString()
      .split(',')
      .map(e => e.trim().replace(/['"]/g, ''))
      .filter(e => e.includes('@'))
      .join(', ');

    if (!cleanTo) throw new Error(`No valid email address found in: "${to}"`);

    console.log('[Email] Sending to:', cleanTo);

    // ── Route: Microsoft Graph API takes priority over SMTP ──────────────────
    const graphConfig = await getGraphEmailConfig();
    if (graphConfig) {
      console.log('[Email] Using Microsoft Graph API');
      return await sendViaGraph(cleanTo, subject, textBody, htmlBody, graphConfig);
    }

    // ── Route: SMTP fallback ──────────────────────────────────────────────────
    console.log('[Email] Using SMTP');

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
  sendViaGraph,
  getGraphEmailConfig,
  getSmtpConfig,
  createTransporter,
  refreshOAuthToken,
  getAccessToken
};
