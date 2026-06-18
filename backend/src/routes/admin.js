const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');
const auth    = require('../middleware/auth');
const adminAuth  = require('../middleware/adminAuth');
const { getConfig, saveConfig, hasConfig } = require('../services/configService');
const { testConnection, getSessionInfo, resetToken } = require('../services/metabase');
const emailService  = require('../services/emailService');
const teamsService  = require('../services/teamsService');
const ProjectConfig = require('../models/ProjectConfig');
const AdminLog      = require('../models/AdminLog');
const snapshotStore = require('../services/snapshotStore');
const cronService   = require('../services/cronService');

// Temporary store for PKCE code verifiers during SMTP OAuth2 flow.
// Keyed by state parameter; entries expire after 10 minutes.
const pkceStore = new Map();
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [key, val] of pkceStore.entries()) {
    if (val.timestamp < cutoff) pkceStore.delete(key);
  }
}, 10 * 60 * 1000);

router.use(auth, adminAuth);

async function logAction(user, action, route, details = {}) {
  await AdminLog.create({ action, user: user.email, source: user.source, route, details });
}

// ── Azure AD ──────────────────────────────────────────────────────────────────

router.get('/config/azure', async (req, res) => {
  const config = await getConfig('azure');
  if (!config) return res.json({ configured: false });
  res.json({ configured: true, clientId: config.clientId, tenantId: config.tenantId, redirectUri: config.redirectUri });
});

router.post('/config/azure', async (req, res) => {
  try {
    const { clientId, tenantId, clientSecret, redirectUri } = req.body;
    await saveConfig('azure', { clientId, tenantId, redirectUri }, { clientSecret }, req.user.email);
    await logAction(req.user, 'save_azure_config', '/admin/config/azure');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/config/azure/test', async (req, res) => {
  try {
    const config = await getConfig('azure');
    if (!config || !config.tenantId || !config.clientId) return res.status(400).json({ error: 'Azure not configured' });
    res.json({ success: true, message: 'Azure config loaded successfully', tenantId: config.tenantId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/config/azure/direct', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const db = mongoose.connection.db;
    const { clientId, tenantId, redirectUri } = req.body;

    if (!clientId || !tenantId) {
      return res.status(400).json({ error: 'clientId and tenantId are required' });
    }

    await db.collection('systemconfigs').findOneAndUpdate(
      { key: 'azure' },
      {
        $set: {
          key:  'azure',
          data: {
            clientId:    clientId.trim(),
            tenantId:    tenantId.trim(),
            redirectUri: redirectUri?.trim() || 'http://localhost:5047'
          },
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    const saved = await db.collection('systemconfigs').findOne({ key: 'azure' });
    console.log('[Azure Save] Saved:', saved?.data);
    res.json({ success: true, saved: saved?.data });
  } catch (err) {
    console.error('[Azure Save] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/config/azure/direct', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const db = mongoose.connection.db;
    const doc = await db.collection('systemconfigs').findOne({ key: 'azure' });
    res.json({ exists: !!doc, data: doc?.data || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Metabase ──────────────────────────────────────────────────────────────────

router.get('/config/metabase', async (req, res) => {
  const config = await getConfig('metabase');
  if (!config) return res.json({ configured: false });
  const sessionInfo = getSessionInfo();
  res.json({ configured: true, url: config.url, username: config.username, sessionInfo });
});

router.post('/config/metabase', async (req, res) => {
  try {
    const { url, username, password } = req.body;
    await saveConfig('metabase', { url, username }, { password }, req.user.email);
    resetToken(); // force re-auth with new credentials
    await logAction(req.user, 'save_metabase_config', '/admin/config/metabase');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/config/metabase/test', async (req, res) => {
  try {
    const result = await testConnection();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/config/metabase/refresh', async (req, res) => {
  try {
    const { getSession } = require('../services/metabase');
    await getSession(true);
    res.json({ success: true, message: 'Session refreshed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SMTP ──────────────────────────────────────────────────────────────────────

router.get('/config/smtp', async (req, res) => {
  const config = await getConfig('smtp');
  if (!config) return res.json({ configured: false });
  res.json({
    configured:        true,
    host:              config.host,
    port:              config.port,
    username:          config.username,
    fromName:          config.fromName,
    defaultAlertEmail: config.defaultAlertEmail
  });
});

router.get('/config/smtp/debug', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const db = mongoose.connection.db;
    const doc = await db.collection('systemconfigs').findOne({ key: 'smtp' });
    res.json({
      exists:            !!doc,
      host:              doc?.data?.host,
      port:              doc?.data?.port,
      username:          doc?.data?.username,
      passwordSaved:     !!doc?.data?.password,
      passwordLength:    doc?.data?.password?.length || 0,
      fromName:          doc?.data?.fromName,
      defaultAlertEmail: doc?.data?.defaultAlertEmail,
      updatedAt:         doc?.updatedAt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/config/smtp/direct', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const db = mongoose.connection.db;

    const smtpData = {
      host:              req.body.host?.trim(),
      port:              Number(req.body.port) || 587,
      username:          req.body.username?.trim(),
      password:          req.body.password?.trim(),
      fromName:          req.body.fromName?.trim() || 'Migration Monitor',
      defaultAlertEmail: req.body.defaultAlertEmail?.trim()
    };

    console.log('[SMTP Direct Save] Saving:', {
      ...smtpData,
      password: smtpData.password ? '***SET***' : 'NOT SET'
    });

    await db.collection('systemconfigs').findOneAndUpdate(
      { key: 'smtp' },
      {
        $set: {
          key:          'smtp',
          data:          smtpData,
          encryptedData: null,
          updatedAt:     new Date()
        }
      },
      { upsert: true }
    );

    const saved = await db.collection('systemconfigs').findOne({ key: 'smtp' });

    console.log('[SMTP Direct Save] Verified:', {
      host:              saved?.data?.host,
      passwordSaved:     !!saved?.data?.password,
      defaultAlertEmail: saved?.data?.defaultAlertEmail
    });

    res.json({
      success: true,
      verified: {
        host:              saved?.data?.host,
        username:          saved?.data?.username,
        passwordSaved:     !!saved?.data?.password,
        defaultAlertEmail: saved?.data?.defaultAlertEmail
      }
    });
  } catch (err) {
    console.error('[SMTP Direct Save] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/config/smtp/direct', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const db = mongoose.connection.db;

    const doc = await db.collection('systemconfigs').findOne({ key: 'smtp' });

    res.json({
      exists:  !!doc,
      raw: doc ? {
        host:              doc.data?.host,
        port:              doc.data?.port,
        username:          doc.data?.username,
        passwordSaved:     !!doc.data?.password,
        passwordLength:    doc.data?.password?.length || 0,
        fromName:          doc.data?.fromName,
        defaultAlertEmail: doc.data?.defaultAlertEmail,
        updatedAt:         doc.updatedAt
      } : null,
      allKeys: doc ? Object.keys(doc.data || {}) : []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/config/smtp', async (req, res) => {
  try {
    const { host, port, username, password, fromName, defaultAlertEmail } = req.body;

    console.log('[SMTP Save] Fields received:', {
      host: !!host, port: !!port, username: !!username,
      password: !!password, fromName: !!fromName,
      defaultAlertEmail: !!defaultAlertEmail
    });

    const SystemConfig = require('../models/SystemConfig');
    const saved = await SystemConfig.findOneAndUpdate(
      { key: 'smtp' },
      {
        $set: {
          key:                    'smtp',
          'data.host':              host?.trim(),
          'data.port':              Number(port) || 587,
          'data.username':          username?.trim(),
          'data.password':          password?.trim(),
          'data.fromName':          fromName?.trim() || 'Migration Monitor',
          'data.defaultAlertEmail': defaultAlertEmail?.trim() || '',
          encryptedData:            null,
          updatedAt:                new Date()
        }
      },
      { upsert: true, new: true }
    );

    console.log('[SMTP Save] Saved document data:', {
      host:              saved.data?.host,
      username:          saved.data?.username,
      passwordSaved:     !!saved.data?.password,
      defaultAlertEmail: saved.data?.defaultAlertEmail
    });

    await logAction(req.user, 'save_smtp_config', '/admin/config/smtp');
    res.json({
      success: true,
      saved: {
        host:              saved.data?.host,
        username:          saved.data?.username,
        passwordSaved:     !!saved.data?.password,
        defaultAlertEmail: saved.data?.defaultAlertEmail
      }
    });
  } catch (err) {
    console.error('[SMTP Save] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const getSmtpErrorHint = (errMsg) => {
  if (errMsg.includes('535') || errMsg.includes('authentication')) {
    return 'Gmail: Use App Password not your regular password. ' +
           'Go to Google Account → Security → App passwords';
  }
  if (errMsg.includes('534') || errMsg.includes('less secure')) {
    return 'Gmail: Enable 2FA and use App Password';
  }
  if (errMsg.includes('ECONNREFUSED')) {
    return 'Cannot connect to SMTP server. Check host and port.';
  }
  if (errMsg.includes('ETIMEDOUT')) {
    return 'Connection timed out. Check host and port.';
  }
  if (errMsg.includes('certificate')) {
    return 'SSL certificate error. Try port 587 with TLS.';
  }
  return 'Check SMTP credentials in Admin → Email/SMTP';
};

router.post('/config/smtp/test', async (req, res) => {
  try {
    const config = await emailService.getSmtpConfig();

    console.log('[SMTP Test] Config loaded:', {
      host:              config?.host,
      port:              config?.port,
      username:          config?.username,
      passwordSet:       !!config?.password,
      defaultAlertEmail: config?.defaultAlertEmail
    });

    if (!config?.host) {
      return res.status(400).json({
        success: false,
        error: 'SMTP not configured. Go to Admin → Email/SMTP first.'
      });
    }

    const testEmail = req.body?.testEmail || config.defaultAlertEmail;

    if (!testEmail) {
      return res.status(400).json({
        success: false,
        error: 'No recipient email. Set Default Alert Email in SMTP config.'
      });
    }

    await emailService.sendAlert(
      testEmail,
      '✅ Test Email — Migration Monitor Alert System',
      `This is a test email from Migration Monitor.

SMTP Configuration:
  Host:     ${config.host}
  Port:     ${config.port}
  Username: ${config.username}

If you received this, email alerts are working correctly.
Time: ${new Date().toLocaleString()}`
    );

    res.json({ success: true, message: `Test email sent to ${testEmail}` });

  } catch (err) {
    console.error('[SMTP Test] Failed:', err.message);
    res.status(400).json({
      success: false,
      error: err.message,
      hint: getSmtpErrorHint(err.message)
    });
  }
});

router.post('/config/test/smtp', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const db = mongoose.connection.db;
    const doc = await db.collection('systemconfigs').findOne({ key: 'smtp' });

    console.log('[SMTP Test] MongoDB doc:', {
      exists:            !!doc,
      host:              doc?.data?.host,
      username:          doc?.data?.username,
      passwordSaved:     !!doc?.data?.password,
      defaultAlertEmail: doc?.data?.defaultAlertEmail
    });

    if (!doc?.data?.host) {
      return res.status(400).json({ success: false, error: 'SMTP not configured in MongoDB' });
    }

    if (!doc?.data?.password) {
      return res.status(400).json({ success: false, error: 'SMTP password not saved. Re-save in Admin → SMTP' });
    }

    const to = req.body?.testEmail || doc.data.defaultAlertEmail || doc.data.username;

    if (!to) {
      return res.status(400).json({ success: false, error: 'No recipient email found in config' });
    }

    console.log('[SMTP Test] Sending to:', to);

    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host:   doc.data.host,
      port:   Number(doc.data.port) || 587,
      secure: false,
      auth:   { user: doc.data.username, pass: doc.data.password },
      tls:    { rejectUnauthorized: false }
    });

    console.log('[SMTP Test] Verifying connection...');
    await transporter.verify();
    console.log('[SMTP Test] Connection verified ✓');

    const info = await transporter.sendMail({
      from:    `"${doc.data.fromName || 'Migration Monitor'}" <${doc.data.username}>`,
      to,
      subject: '✅ Test Email — Migration Monitor Alert System',
      text: `SMTP is working correctly!

Configuration:
  Host:     ${doc.data.host}
  Port:     ${doc.data.port}
  Username: ${doc.data.username}

Sent at: ${new Date().toLocaleString()}

If you received this, email alerts will work correctly.`,
      html: `
<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;">
  <div style="background:#185FA5;color:white;padding:16px;border-radius:8px 8px 0 0;">
    <h2 style="margin:0;font-size:16px;">✅ Migration Monitor — SMTP Test</h2>
  </div>
  <div style="background:#f9f9f9;padding:20px;border:1px solid #ddd;border-top:none;border-radius:0 0 8px 8px;">
    <p><strong>SMTP is working correctly!</strong></p>
    <table style="width:100%;font-size:13px;">
      <tr><td style="color:#666;padding:4px 0;">Host:</td><td><strong>${doc.data.host}</strong></td></tr>
      <tr><td style="color:#666;padding:4px 0;">Port:</td><td><strong>${doc.data.port}</strong></td></tr>
      <tr><td style="color:#666;padding:4px 0;">Username:</td><td><strong>${doc.data.username}</strong></td></tr>
      <tr><td style="color:#666;padding:4px 0;">Sent at:</td><td><strong>${new Date().toLocaleString()}</strong></td></tr>
    </table>
    <p style="color:#666;font-size:12px;margin-top:16px;">Migration Monitor — Automated Alert System</p>
  </div>
</div>`
    });

    console.log('[SMTP Test] ✓ Email sent:', info.messageId);
    res.json({ success: true, message: `Test email sent successfully to ${to}`, messageId: info.messageId });

  } catch (err) {
    console.error('[SMTP Test] Failed:', err.message);
    let hint = '';
    if (err.message.includes('535') || err.message.includes('authentication')) {
      hint = 'Authentication failed. Check username and password.';
    } else if (err.message.includes('ECONNREFUSED')) {
      hint = 'Cannot connect to SMTP server. Check host and port.';
    } else if (err.message.includes('ETIMEDOUT')) {
      hint = 'Connection timed out. Check host and port.';
    } else if (err.message.includes('certificate') || err.message.includes('SSL')) {
      hint = 'SSL error. The config uses TLS disabled — try port 465.';
    } else if (err.message.includes('credentials') || err.message.includes('password')) {
      hint = 'Invalid credentials. Re-enter password in Admin → SMTP.';
    }
    res.status(400).json({ success: false, error: err.message, hint });
  }
});

// ── SMTP OAuth2 ───────────────────────────────────────────────────────────────

router.get('/config/smtp/oauth2/status', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const db  = mongoose.connection.db;
    const doc = await db.collection('systemconfigs').findOne({ key: 'smtp' });

    const isOAuth   = doc?.data?.authType === 'oauth2';
    const expiry    = doc?.data?.tokenExpiry;
    const isExpired = expiry ? new Date(expiry) < new Date() : false;

    res.json({
      connected:      isOAuth,
      connectedEmail: doc?.data?.connectedEmail || null,
      connectedAt:    doc?.data?.connectedAt    || null,
      tokenExpiry:    expiry || null,
      isExpired,
      authType:       doc?.data?.authType || 'password'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/config/smtp/oauth2/auth-url', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const db = mongoose.connection.db;
    const azureDoc = await db.collection('systemconfigs').findOne({ key: 'azure' });

    if (!azureDoc?.data?.clientId) {
      return res.status(400).json({
        error: 'Azure AD not configured. Go to Admin → Azure first.'
      });
    }

    const { clientId, tenantId } = azureDoc.data;

    const origin      = req.headers.origin || 'http://localhost:5047';
    const redirectUri = `${origin}/admin/smtp/callback`;

    // Generate PKCE pair
    const { generateCodeVerifier, generateCodeChallenge } = require('../utils/pkce');
    const codeVerifier  = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state         = crypto.randomBytes(16).toString('hex');

    // Store verifier + config so frontend can retrieve everything needed for token exchange
    pkceStore.set(state, { codeVerifier, redirectUri, clientId, tenantId, timestamp: Date.now() });

    console.log('[SMTP OAuth] auth-url:', {
      redirectUri,
      state: state.substring(0, 8) + '...',
      challengeLen: codeChallenge.length
    });

    const params = new URLSearchParams({
      client_id:             clientId,
      response_type:         'code',
      redirect_uri:          redirectUri,
      scope: [
        'https://outlook.office365.com/SMTP.Send',
        'offline_access',
        'openid',
        'profile',
        'email'
      ].join(' '),
      response_mode:         'query',
      prompt:                'select_account',
      state,
      code_challenge:        codeChallenge,
      code_challenge_method: 'S256'
    });

    const authUrl =
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;

    res.json({ authUrl, state, redirectUri });

  } catch (err) {
    console.error('[SMTP OAuth] auth-url error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Return PKCE verifier + config so the browser can exchange the code itself.
// The old /callback endpoint called Azure from the server, which fails for SPA
// apps (AADSTS9002327). Now the browser does the token exchange directly.
router.get('/config/smtp/oauth2/pkce', async (req, res) => {
  try {
    const { state } = req.query;
    if (!state) return res.status(400).json({ error: 'State parameter required' });

    const stored = pkceStore.get(state);
    if (!stored) {
      return res.status(404).json({
        error: 'PKCE verifier not found or expired. Please try connecting again.'
      });
    }

    console.log('[SMTP OAuth] PKCE retrieved for state:', state.substring(0, 8) + '...');

    res.json({
      codeVerifier: stored.codeVerifier,
      redirectUri:  stored.redirectUri,
      clientId:     stored.clientId,
      tenantId:     stored.tenantId
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Receive tokens from the browser after it completes the exchange directly with Azure.
// Backend's only job here is to persist them — no outbound Azure calls.
router.post('/config/smtp/oauth2/save-tokens', async (req, res) => {
  try {
    const { accessToken, refreshToken, expiresIn, userEmail, clientId, tenantId } = req.body;

    if (!accessToken || !refreshToken) {
      return res.status(400).json({ error: 'Access token and refresh token required' });
    }

    const mongoose = require('mongoose');
    const db = mongoose.connection.db;
    const smtpDoc = await db.collection('systemconfigs').findOne({ key: 'smtp' });

    await db.collection('systemconfigs').findOneAndUpdate(
      { key: 'smtp' },
      {
        $set: {
          key: 'smtp',
          data: {
            ...(smtpDoc?.data || {}),
            host:              'smtp.office365.com',
            port:              587,
            username:          userEmail || smtpDoc?.data?.username || '',
            fromName:          smtpDoc?.data?.fromName || 'Migration Monitor',
            defaultAlertEmail: smtpDoc?.data?.defaultAlertEmail || userEmail,
            authType:          'oauth2',
            clientId,
            tenantId,
            refreshToken,
            accessToken,
            tokenExpiry:    new Date(Date.now() + (expiresIn || 3600) * 1000).toISOString(),
            connectedAt:    new Date().toISOString(),
            connectedEmail: userEmail
          },
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    // Clean up pkceStore entries for this client (already consumed)
    for (const [key, val] of pkceStore.entries()) {
      if (val.clientId === clientId) pkceStore.delete(key);
    }

    console.log('[SMTP OAuth] ✓ Tokens saved for:', userEmail);

    res.json({ success: true, message: 'Microsoft account connected', connectedEmail: userEmail });

  } catch (err) {
    console.error('[SMTP OAuth] save-tokens error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/config/smtp/oauth2/refresh', async (req, res) => {
  try {
    const newToken = await emailService.refreshOAuthToken();
    res.json({
      success:   true,
      message:   'Access token refreshed',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/config/smtp/oauth2/disconnect', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const db = mongoose.connection.db;
    await db.collection('systemconfigs').findOneAndUpdate(
      { key: 'smtp' },
      {
        $unset: {
          'data.authType':       '',
          'data.refreshToken':   '',
          'data.accessToken':    '',
          'data.tokenExpiry':    '',
          'data.connectedAt':    '',
          'data.connectedEmail': '',
          'data.clientId':       '',
          'data.tenantId':       ''
        }
      }
    );
    res.json({ success: true, message: 'OAuth2 disconnected — reverted to password auth' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Switch to password auth ───────────────────────────────────────────────────

router.post('/config/smtp/switch-to-password', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const db = mongoose.connection.db;

    await db.collection('systemconfigs').findOneAndUpdate(
      { key: 'smtp' },
      {
        $set:   { 'data.authType': 'password' },
        $unset: {
          'data.refreshToken':   '',
          'data.accessToken':    '',
          'data.tokenExpiry':    '',
          'data.connectedAt':    '',
          'data.connectedEmail': ''
        }
      }
    );

    res.json({ success: true, message: 'Switched to password authentication' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Microsoft Graph Email ─────────────────────────────────────────────────────

router.get('/config/graph-email', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const db  = mongoose.connection.db;
    const doc = await db.collection('systemconfigs').findOne({ key: 'graphEmail' });
    if (!doc?.data) return res.json({ configured: false });
    res.json({
      configured:        !!(doc.data.clientId && doc.data.clientSecret && doc.data.tenantId),
      clientId:          doc.data.clientId          || '',
      tenantId:          doc.data.tenantId          || '',
      senderEmail:       doc.data.senderEmail        || '',
      defaultAlertEmail: doc.data.defaultAlertEmail  || '',
      secretSaved:       !!doc.data.clientSecret
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/config/graph-email', async (req, res) => {
  try {
    const { clientId, clientSecret, tenantId, senderEmail, defaultAlertEmail } = req.body;
    if (!clientId || !tenantId || !senderEmail) {
      return res.status(400).json({ error: 'clientId, tenantId and senderEmail are required' });
    }
    const mongoose = require('mongoose');
    const db  = mongoose.connection.db;

    const existing = await db.collection('systemconfigs').findOne({ key: 'graphEmail' });
    const update   = {
      clientId:          clientId.trim(),
      tenantId:          tenantId.trim(),
      senderEmail:       senderEmail.trim(),
      defaultAlertEmail: (defaultAlertEmail || '').trim(),
      // Only overwrite secret if a new one is provided
      clientSecret: clientSecret?.trim()
        ? clientSecret.trim()
        : (existing?.data?.clientSecret || '')
    };

    await db.collection('systemconfigs').findOneAndUpdate(
      { key: 'graphEmail' },
      { $set: { key: 'graphEmail', data: update, updatedAt: new Date() } },
      { upsert: true }
    );

    await logAction(req.user, 'save_graph_email', '/admin/config/graph-email');
    res.json({ success: true });
  } catch (err) {
    console.error('[GraphEmail] Save error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/config/graph-email/test', async (req, res) => {
  try {
    const { to } = req.body;
    const mongoose = require('mongoose');
    const db  = mongoose.connection.db;
    const doc = await db.collection('systemconfigs').findOne({ key: 'graphEmail' });

    if (!doc?.data?.clientId || !doc?.data?.clientSecret || !doc?.data?.tenantId || !doc?.data?.senderEmail) {
      return res.status(400).json({ error: 'Graph Email not fully configured. Save settings first.' });
    }

    const recipient = (to || doc.data.defaultAlertEmail || '').trim();
    if (!recipient) return res.status(400).json({ error: 'Provide a recipient email address' });

    const { sendViaGraph } = require('../services/emailService');
    await sendViaGraph(
      recipient,
      '✅ Migration Monitor — Graph API Test',
      'This is a test email sent via Microsoft Graph API from Migration Monitor.',
      '<p>This is a <strong>test email</strong> sent via <strong>Microsoft Graph API</strong> from Migration Monitor.</p><p>If you received this, your Azure email configuration is working correctly.</p>',
      doc.data
    );

    res.json({ success: true, message: `Test email sent to ${recipient} via Microsoft Graph API ✓` });
  } catch (err) {
    console.error('[GraphEmail] Test error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/config/graph-email', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const db = mongoose.connection.db;
    await db.collection('systemconfigs').deleteOne({ key: 'graphEmail' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Alert rules ───────────────────────────────────────────────────────────────

router.get('/config/alertrules', async (req, res) => {
  const rules = await getConfig('alertRules');
  res.json(rules || { stall: 30, conflict: 4, cooldown: 2, emailEnabled: true, teamsEnabled: true });
});

router.post('/config/alertrules', async (req, res) => {
  try {
    const {
      stallIntervalMinutes,
      dataRefreshIntervalMinutes,
      cooldownHours,
      conflictThresholdHours,
      enableEmailAlerts,
      enableTeamsAlerts
    } = req.body;

    if (!stallIntervalMinutes || !cooldownHours || !conflictThresholdHours) {
      return res.status(400).json({ error: 'All fields required' });
    }

    const mongoose = require('mongoose');
    const db = mongoose.connection.db;

    const refreshMins = Number(dataRefreshIntervalMinutes || stallIntervalMinutes);

    const rules = {
      stallIntervalMinutes:       Number(stallIntervalMinutes),
      dataRefreshIntervalMinutes: refreshMins,
      cooldownHours:              Number(cooldownHours),
      conflictThresholdHours:     Number(conflictThresholdHours),
      enableEmailAlerts:          enableEmailAlerts !== false,
      enableTeamsAlerts:          enableTeamsAlerts !== false
    };

    await db.collection('systemconfigs').findOneAndUpdate(
      { key: 'alertRules' },
      {
        $set: {
          key:       'alertRules',
          data:      rules,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    console.log('[AlertRules] Saved:', rules);

    await cronService.restartCron();

    await logAction(req.user, 'save_alert_rules', '/admin/config/alertrules');

    res.json({
      success:        true,
      message:        'Alert rules saved and cron restarted',
      rules,
      cronExpression: cronService.buildCronExpression(refreshMins)
    });

  } catch (err) {
    console.error('[AlertRules] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Webhooks ──────────────────────────────────────────────────────────────────

router.get('/webhooks', async (req, res) => {
  try {
    const configs = await ProjectConfig.find({}).sort({ projectName: 1 });
    res.json(configs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/webhooks/:id', async (req, res) => {
  try {
    const doc = await ProjectConfig.findByIdAndUpdate(req.params.id, { ...req.body, updatedBy: req.user.email }, { new: true });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/webhooks/test-webhook', async (req, res) => {
  try {
    const { webhookUrl, projectName } = req.body;
    if (!webhookUrl) return res.status(400).json({ error: 'webhookUrl required' });
    await teamsService.sendTestMessage(webhookUrl, projectName || 'Test Project');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/webhooks/test-email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });
    await emailService.sendAlert(
      email,
      '✅ Test Email — Migration Monitor Alert System',
      `This is a test email from Migration Monitor.\nTime: ${new Date().toLocaleString()}`
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Health ────────────────────────────────────────────────────────────────────

router.get('/health', async (req, res) => {
  const mongoose = require('mongoose');
  const jobStatus = cronService.getJobStatus();
  const sessionInfo = getSessionInfo();
  const snapshotCount = snapshotStore.getSnapshotCount();
  const projectCount = snapshotStore.getProjectCount();
  const lastSnap = snapshotStore.getLastSnapshotTime();

  let metabaseOk = false;
  try { await testConnection(); metabaseOk = true; } catch (e) {}
  let smtpOk = false;
  try { await emailService.createTransporter(); smtpOk = true; } catch (e) {}

  res.json({
    mongodb:              mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    metabase:             metabaseOk ? 'connected' : 'error',
    metabaseLastConnected: sessionInfo.lastConnected,
    smtp:                 smtpOk ? 'connected' : 'error',
    cronJobs:             jobStatus,
    snapshotMemory:       { projects: projectCount, snapshots: snapshotCount },
    lastSnapshot:         lastSnap
  });
});

// ── Dev admin credentials ─────────────────────────────────────────────────────

router.get('/config/devadmin', async (req, res) => {
  const config = await getConfig('devAdmin');
  const devLoginCfg = await getConfig('devLoginEnabled');

  let devLoginEnabled;
  if (devLoginCfg === null) {
    devLoginEnabled = process.env.ENABLE_DEV_LOGIN !== 'false';
  } else if (typeof devLoginCfg === 'boolean') {
    devLoginEnabled = devLoginCfg;
  } else {
    devLoginEnabled = devLoginCfg?.enabled !== false;
  }

  res.json({
    username:        (config && config.username) || process.env.DEV_ADMIN_USER || 'devadmin',
    devLoginEnabled
  });
});

router.post('/config/devadmin', async (req, res) => {
  try {
    const { username, password, enableDevLogin } = req.body;

    console.log('[AdminConfig] Saving dev admin config...');
    console.log('[AdminConfig] Username:', username);
    console.log('[AdminConfig] Password provided:', !!password);
    console.log('[AdminConfig] EnableDevLogin:', enableDevLogin);

    if (!username || !username.trim()) {
      return res.status(400).json({ error: 'Username is required' });
    }
    if (!password || !password.trim()) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const passwordHash = await bcrypt.hash(password.trim(), 12);
    console.log('[AdminConfig] Password hashed successfully');
    console.log('[AdminConfig] Hash prefix:', passwordHash.substring(0, 10) + '...');

    // Write directly to SystemConfig.data — no encryption layer — so auth.js can read it plainly
    const SystemConfig = require('../models/SystemConfig');
    await SystemConfig.findOneAndUpdate(
      { key: 'devAdmin' },
      {
        key: 'devAdmin',
        data: {
          username:       username.trim(),
          passwordHash:   passwordHash,
          enableDevLogin: enableDevLogin !== false
        },
        encryptedData: null,
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );

    console.log('[AdminConfig] ✓ Dev admin config saved to MongoDB');
    await logAction(req.user, 'update_dev_credentials', '/admin/config/devadmin');
    res.json({ success: true, message: 'Dev admin credentials updated successfully', username: username.trim() });
  } catch (err) {
    console.error('[AdminConfig] Save devadmin error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/config/devadmin/toggle', async (req, res) => {
  try {
    const { enabled } = req.body;
    await saveConfig('devLoginEnabled', { enabled }, {}, req.user.email);
    await logAction(req.user, enabled ? 'enable_dev_login' : 'disable_dev_login', '/admin/config/devadmin');
    res.json({ success: true, enabled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin emails ──────────────────────────────────────────────────────────────

router.get('/config/adminemails', async (req, res) => {
  const config = await getConfig('adminEmails');
  // Handle both legacy (raw array) and new ({emails: [...]}) formats
  const emails = Array.isArray(config) ? config : (config?.emails || []);
  res.json({ emails });
});

router.post('/config/adminemails', async (req, res) => {
  try {
    const { emails } = req.body;
    await saveConfig('adminEmails', { emails: emails || [] }, {}, req.user.email);
    await logAction(req.user, 'update_admin_emails', '/admin/config/adminemails');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Project management ────────────────────────────────────────────────────────

const PLATFORMS = ['Slack', 'Google Chat', 'Teams', 'Meta'];

router.get('/projects', async (req, res) => {
  try {
    // ?activeOnly=true  →  only active projects (used by dashboard)
    // no param          →  all projects (used by admin panel)
    const filter = req.query.activeOnly === 'true'
      ? { status: { $nin: ['inactive', 'on_hold'] } }
      : {};
    const projects = await ProjectConfig.find(filter).sort({ createdAt: -1 });
    console.log('[Admin] Total projects in MongoDB:', projects.length);
    projects.forEach(p => {
      console.log(`  - ${p.projectName} (DB: ${p.metabaseDatabaseId}, active: ${p.isActive})`);
    });
    res.json(projects);
  } catch (err) {
    console.error('[Admin] Get projects error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/projects/all', async (req, res) => {
  try {
    const projects = await ProjectConfig.find({});
    res.json({
      total: projects.length,
      projects: projects.map(p => ({
        id:                 p._id,
        projectName:        p.projectName,
        metabaseDatabaseId: p.metabaseDatabaseId,
        projectId:          p.projectId,
        source:             p.source,
        destination:        p.destination,
        isActive:           p.isActive,
        createdAt:          p.createdAt
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/projects', async (req, res) => {
  try {
    const { projectName, metabaseDatabaseId, projectId, source, destination, teamsWebhookUrl, alertEmail, showDms, showDmToSpace } = req.body;

    if (!projectName || !metabaseDatabaseId || !projectId || !source || !destination) {
      return res.status(400).json({ error: 'projectName, metabaseDatabaseId, projectId, source and destination are required' });
    }

    if (!PLATFORMS.includes(source)) {
      return res.status(400).json({ error: `Invalid source. Must be one of: ${PLATFORMS.join(', ')}` });
    }
    if (!PLATFORMS.includes(destination)) {
      return res.status(400).json({ error: `Invalid destination. Must be one of: ${PLATFORMS.join(', ')}` });
    }

    const existing = await ProjectConfig.findOne({ metabaseDatabaseId: Number(metabaseDatabaseId) });
    if (existing) {
      return res.status(400).json({ error: `Metabase ID ${metabaseDatabaseId} already exists as "${existing.projectName}"` });
    }

    const project = new ProjectConfig({
      projectName,
      metabaseDatabaseId: Number(metabaseDatabaseId),
      projectId,
      source,
      destination,
      migrationType:   'messaging',
      teamsWebhookUrl: teamsWebhookUrl || '',
      alertEmail:      alertEmail      || '',
      showDms:         showDms         !== undefined ? Boolean(showDms)       : true,
      showDmToSpace:   showDmToSpace   !== undefined ? Boolean(showDmToSpace) : false,
      isActive:        true,
      status:          'active',
      updatedAt:       new Date()
    });

    await project.save();
    console.log(`[Admin] Project added: ${projectName} (DB: ${metabaseDatabaseId})`);
    await logAction(req.user, 'create_project', '/admin/projects', { projectName, metabaseDatabaseId });
    res.json({ success: true, project });
  } catch (err) {
    console.error('[Admin] Add project error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/projects/:id', async (req, res) => {
  try {
    const { projectName, metabaseDatabaseId, projectId, source, destination, teamsWebhookUrl, alertEmail, isActive, status, alertsEnabled, alertChannels, alertDms, alertDmToSpace, showDms, showDmToSpace } = req.body;

    if (source && !PLATFORMS.includes(source)) {
      return res.status(400).json({ error: 'Invalid source platform' });
    }
    if (destination && !PLATFORMS.includes(destination)) {
      return res.status(400).json({ error: 'Invalid destination platform' });
    }

    if (metabaseDatabaseId) {
      const existing = await ProjectConfig.findOne({
        metabaseDatabaseId: Number(metabaseDatabaseId),
        _id: { $ne: req.params.id }
      });
      if (existing) {
        return res.status(409).json({ error: `Metabase ID ${metabaseDatabaseId} is already used by "${existing.projectName}"` });
      }
    }

    const update = { updatedAt: new Date() };
    if (projectName        !== undefined) update.projectName        = projectName;
    if (metabaseDatabaseId !== undefined) update.metabaseDatabaseId = Number(metabaseDatabaseId);
    if (projectId          !== undefined) update.projectId          = projectId;
    if (source             !== undefined) update.source             = source;
    if (destination        !== undefined) update.destination        = destination;
    if (teamsWebhookUrl    !== undefined) update.teamsWebhookUrl    = teamsWebhookUrl || '';
    if (alertEmail         !== undefined) update.alertEmail         = alertEmail      || '';
    if (isActive           !== undefined) update.isActive           = isActive;
    if (status             !== undefined) update.status             = status;
    if (alertsEnabled      !== undefined) update.alertsEnabled      = Boolean(alertsEnabled);
    if (alertChannels      !== undefined) update.alertChannels      = Boolean(alertChannels);
    if (alertDms           !== undefined) update.alertDms           = Boolean(alertDms);
    if (alertDmToSpace     !== undefined) update.alertDmToSpace     = Boolean(alertDmToSpace);
    if (showDms            !== undefined) update.showDms            = Boolean(showDms);
    if (showDmToSpace      !== undefined) update.showDmToSpace      = Boolean(showDmToSpace);

    const project = await ProjectConfig.findByIdAndUpdate(req.params.id, update, { new: true });

    if (!project) return res.status(404).json({ error: 'Project not found' });
    await logAction(req.user, 'update_project', '/admin/projects/' + req.params.id, { projectName: project.projectName });
    res.json({ success: true, project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/projects/:id',
  require('../middleware/roles').requireDeleteAccess,
  async (req, res) => {
    try {
      const doc = await ProjectConfig.findByIdAndDelete(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Project not found' });
      await logAction(req.user, 'delete_project', '/admin/projects/' + req.params.id, { projectName: doc.projectName });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Generic test endpoint used by AdminWebhooks
router.post('/test/webhook', async (req, res) => {
  try {
    const { webhookUrl, projectName } = req.body;
    if (!webhookUrl) return res.status(400).json({ error: 'webhookUrl required' });
    await teamsService.sendTestMessage(webhookUrl, projectName || 'Test Project');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Debug helpers ─────────────────────────────────────────────────────────────

router.get('/debug/metabase/:databaseId', async (req, res) => {
  try {
    const dbId = Number(req.params.databaseId);
    const metabase = require('../services/metabase');

    console.log(`[Debug] Testing Metabase DB: ${dbId}`);

    if (!metabase.getToken()) {
      await metabase.authenticate();
    }

    // Get database metadata — metabaseRequest already returns response.data
    const meta = await metabase.metabaseRequest('GET', `/api/database/${dbId}/metadata`);
    const tables = meta.tables || [];

    const tableInfo = [];
    for (const table of tables) {
      try {
        const queryResult = await metabase.metabaseRequest('POST', '/api/dataset', {
          database:   dbId,
          type:       'query',
          query:      { 'source-table': table.id },
          parameters: []
        });
        // metabaseRequest returns response.data; Metabase puts rows inside .data
        const rows = queryResult.data?.rows || [];
        const cols = queryResult.data?.cols || [];
        tableInfo.push({
          id:        table.id,
          name:      table.name,
          rowCount:  rows.length,
          columns:   cols.map(c => c.name),
          sampleRow: rows[0] || null
        });
      } catch (e) {
        tableInfo.push({ id: table.id, name: table.name, error: e.message });
      }
    }

    res.json({
      databaseId:   dbId,
      databaseName: meta.name,
      totalTables:  tables.length,
      tables:       tableInfo
    });
  } catch (err) {
    res.status(500).json({ error: err.message, hint: err.response?.data || null });
  }
});

// ── Debug emails ──────────────────────────────────────────────────────────────

router.get('/debug/emails', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const db = mongoose.connection.db;

    const projects = await db.collection('projectconfigs').find({ status: { $nin: ['inactive', 'on_hold'] } }).toArray();
    const smtpDoc  = await db.collection('systemconfigs').findOne({ key: 'smtp' });

    res.json({
      defaultAlertEmail: {
        raw:    smtpDoc?.data?.defaultAlertEmail,
        length: smtpDoc?.data?.defaultAlertEmail?.length,
        chars:  [...(smtpDoc?.data?.defaultAlertEmail || '')]
      },
      projectEmails: projects.map(p => ({
        project:  p.projectName,
        email:    p.alertEmail,
        emailRaw: JSON.stringify(p.alertEmail),
        length:   p.alertEmail?.length,
        hasAt:    p.alertEmail?.includes('@'),
        hasDot:   p.alertEmail?.includes('.')
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Alert cron status ─────────────────────────────────────────────────────────

router.get('/alerts/cron-status', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const db = mongoose.connection.db;

    const rulesDoc = await db.collection('systemconfigs')
      .findOne({ key: 'alertRules' });

    if (!rulesDoc) {
      return res.json({
        rules:     null,
        updatedAt: null,
        message:   'No alert rules configured yet'
      });
    }

    const d = rulesDoc.data;

    // Normalize to new schema (supports old hours-based records)
    const rules = {
      stallIntervalMinutes: Number(d.stallIntervalMinutes || 30),
      dataRefreshIntervalMinutes: Number(d.dataRefreshIntervalMinutes || d.stallIntervalMinutes || 30),
      cooldownMinutes: Number(
        d.cooldownMinutes ||
        (d.cooldownHours ? d.cooldownHours * 60 : 120)
      ),
      conflictThresholdMinutes: Number(
        d.conflictThresholdMinutes ||
        (d.conflictThresholdHours ? d.conflictThresholdHours * 60 : 60)
      ),
      cooldownHours:          Number(d.cooldownHours          || (d.cooldownMinutes          ? d.cooldownMinutes / 60          : 2)),
      conflictThresholdHours: Number(d.conflictThresholdHours || (d.conflictThresholdMinutes ? d.conflictThresholdMinutes / 60 : 1)),
      enableEmailAlerts: d.enableEmailAlerts !== false,
      enableTeamsAlerts: d.enableTeamsAlerts !== false
    };

    res.json({
      rules,
      cronExpression: cronService.buildCronExpression(rules.dataRefreshIntervalMinutes),
      updatedAt:      rulesDoc.updatedAt,
      serverTime:     new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Alert test ────────────────────────────────────────────────────────────────

router.post('/alerts/test', async (req, res) => {
  try {
    const { projectId, alertType } = req.body;

    const project = projectId
      ? await ProjectConfig.findById(projectId)
      : await ProjectConfig.findOne({ status: { $nin: ['inactive', 'on_hold'] } });

    if (!project) {
      return res.status(404).json({ error: 'No active project found' });
    }

    const metabase      = require('../services/metabase');
    const snapshotStore = require('../services/snapshotStore');
    const {
      buildStallTextBody, buildStallHtmlBody, buildStallTeamsPayload,
      buildConflictTextBody, buildConflictHtmlBody, buildConflictTeamsPayload
    } = require('../services/cronService');

    const data = await metabase.fetchProjectData(project.metabaseDatabaseId);
    const diff = await snapshotStore.getDiff(project.metabaseDatabaseId);

    // Build alert content
    let subject, textBody, htmlBody, teamsPayload;

    if (alertType === 'conflict') {
      const totalConflicts =
        (data.channels.conflict || 0) + (data.dms.conflict || 0);

      subject =
        `🔴 URGENT: Conflict Alert — ${project.projectName} ` +
        `(${totalConflicts} conflict${totalConflicts !== 1 ? 's' : ''})`;

      textBody     = buildConflictTextBody(project, data);
      htmlBody     = buildConflictHtmlBody(project, data);
      teamsPayload = buildConflictTeamsPayload(project, data);

    } else {
      const testDiff = diff.hasEnoughData ? diff : {
        channelCurrent:  data.channels.processedCount || 1000,
        channelPrevious: data.channels.processedCount || 1000,
        channelDiff:     0,
        dmsCurrent:      data.dms.processedCount || 500,
        dmsPrevious:     data.dms.processedCount || 500,
        dmsDiff:         0,
        totalDiff:       0,
        isStalled:       true,
        hasEnoughData:   true,
        stalledDuration: 30,
        snapshotAge:     30,
      };

      subject =
        `⚠️ Migration Stalled — ${project.projectName} ` +
        `(${project.source} → ${project.destination})`;

      textBody     = buildStallTextBody(project, testDiff, data);
      htmlBody     = buildStallHtmlBody(project, testDiff, data);
      teamsPayload = buildStallTeamsPayload(project, testDiff, data);
    }

    // Re-fetch fresh config to get latest alertEmail
    const mongoose = require('mongoose');
    const db       = mongoose.connection.db;
    const smtpDoc  = await db.collection('systemconfigs').findOne({ key: 'smtp' });

    const graphDoc        = await db.collection('systemconfigs').findOne({ key: 'graphEmail' });
    const graphConfigured = !!(graphDoc?.data?.clientId && graphDoc?.data?.clientSecret &&
                               graphDoc?.data?.tenantId  && graphDoc?.data?.senderEmail);
    const smtpConfigured  = !!(smtpDoc?.data?.host && smtpDoc?.data?.password);
    const emailReady      = smtpConfigured || graphConfigured;
    const defaultEmail    = smtpDoc?.data?.defaultAlertEmail ||
                            graphDoc?.data?.defaultAlertEmail ||
                            process.env.DEFAULT_ALERT_EMAIL;
    const projectEmail = (project.alertEmail || '').trim();
    // Support comma-separated emails — valid if at least one contains @
    const hasValidProjectEmail = projectEmail &&
      projectEmail.split(',').some(e => e.trim().includes('@'));
    const alertEmail = hasValidProjectEmail ? projectEmail : defaultEmail;
    const isProjectEmail = !!(projectEmail);
    const webhookUrl     = (project.teamsWebhookUrl || '').trim();

    let emailSent  = false;
    let emailError = null;
    let teamsSent  = false;
    let teamsError = null;

    if (emailReady && alertEmail) {
      try {
        await emailService.sendAlert(alertEmail, subject, textBody, htmlBody);
        emailSent = true;
      } catch (err) {
        emailError = err.message;
      }
    }

    if (webhookUrl) {
      try {
        await teamsService.sendWebhook(webhookUrl, teamsPayload);
        teamsSent = true;
      } catch (err) {
        teamsError = err.message;
      }
    }

    res.json({
      success:        true,
      project:        project.projectName,
      alertType:      alertType || 'stall',
      emailUsed:      alertEmail || null,
      isProjectEmail: isProjectEmail,
      isDefaultEmail: !isProjectEmail && !!alertEmail,
      hasWebhook:     !!webhookUrl,

      delivery: {
        email: {
          configured: smtpConfigured,
          recipient:  alertEmail || null,
          source:     isProjectEmail ? 'project-specific' : 'default',
          sent:       emailSent,
          error:      emailError,
          message:    !smtpConfigured
            ? 'SMTP not configured — configure in Admin → SMTP'
            : !alertEmail
              ? 'No alert email configured (set project email or default in SMTP settings)'
              : emailSent
                ? `✓ Email sent to ${alertEmail} (${isProjectEmail ? 'project-specific' : 'default'})`
                : `✗ Failed: ${emailError}`
        },
        teams: {
          configured: !!webhookUrl,
          sent:       teamsSent,
          error:      teamsError,
          message:    !webhookUrl
            ? 'No Teams webhook configured for this project'
            : teamsSent
              ? '✓ Teams notification sent'
              : `✗ Failed: ${teamsError}`
        }
      },

      preview: { subject, textBody, htmlBody, teamsPayload }
    });

  } catch (err) {
    console.error('[AlertTest] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/alerts/test-email-direct', async (req, res) => {
  try {
    const { to } = req.body;

    console.log('\n[DirectEmailTest] Testing email to:', to);

    const mongoose = require('mongoose');
    const db = mongoose.connection.db;
    const smtpDoc = await db.collection('systemconfigs').findOne({ key: 'smtp' });

    console.log('[DirectEmailTest] SMTP config:', {
      host:            smtpDoc?.data?.host,
      username:        smtpDoc?.data?.username,
      passwordSet:     !!smtpDoc?.data?.password,
      authType:        smtpDoc?.data?.authType,
      hasRefreshToken: !!smtpDoc?.data?.refreshToken,
      defaultEmail:    smtpDoc?.data?.defaultAlertEmail
    });

    if (!smtpDoc?.data?.host) {
      return res.status(400).json({
        success: false,
        error:   'SMTP not configured',
        action:  'Go to Admin → SMTP and configure'
      });
    }

    const recipient = to || smtpDoc?.data?.defaultAlertEmail;

    if (!recipient) {
      return res.status(400).json({
        success: false,
        error:   'No recipient email',
        action:  'Set Default Alert Email in Admin → SMTP'
      });
    }

    const emailService = require('../services/emailService');
    await emailService.sendAlert(
      recipient,
      '✅ Direct Test — Migration Monitor Alert',
      `Direct email test from Migration Monitor.\n\nSent at: ${new Date().toLocaleString()}\nSMTP Host: ${smtpDoc.data.host}\nAuth Type: ${smtpDoc.data.authType || 'password'}\n\nIf you see this email, alerts are working correctly.`
    );

    res.json({
      success:   true,
      message:   `Email sent to ${recipient}`,
      smtpHost:  smtpDoc.data.host,
      authType:  smtpDoc.data.authType || 'password',
      recipient
    });

  } catch (err) {
    console.error('[DirectEmailTest] FAILED:', err.message);
    res.status(400).json({
      success: false,
      error:   err.message,
      hint: err.message.includes('535') || err.message.includes('auth')
        ? 'Authentication failed — check credentials'
        : err.message.includes('ECONNREFUSED')
        ? 'Cannot connect to SMTP server'
        : err.message.includes('token') || err.message.includes('refresh')
        ? 'OAuth token issue — reconnect Microsoft account'
        : 'Check SMTP configuration'
    });
  }
});

// ── Send preview of stall + conflict alert emails ─────────────────────────────

router.post('/alerts/test-preview', async (req, res) => {
  try {
    const { to } = req.body;
    const recipient = (to || '').trim();
    if (!recipient) return res.status(400).json({ error: 'Recipient email required' });

    const {
      buildStallHtmlBody, buildStallTextBody,
      buildConflictHtmlBody, buildConflictTextBody
    } = require('../services/cronService');

    const mockProject = {
      projectName:   'HCL Migration (Preview)',
      source:        'Slack',
      destination:   'Google Chat',
      migrationType: 'messaging',
    };

    const mockDiff = {
      snapshotAge:     30,
      stalledDuration: 45,
      channelPrevious: 80000,
      channelCurrent:  80000,
      dmsPrevious:     12000,
      dmsCurrent:      12000,
    };

    const mockData = {
      channels: {
        hasDelta: true,
        oneTime:  {
          rowCount: 80,
          multipleInitiations: [
            { name: 'General',     count: 3 },
            { name: 'Engineering', count: 2 },
            { name: 'Product',     count: 2 },
          ],
        },
        delta:    { rowCount: 40 },
        total: 120, completed: 80, inProgress: 15, conflict: 5,
        processedWithConflict: 8, noMessage: 7, notProcessed: 5,
        processedCount: 80000, inProgressCount: 12000,
        conflictCount: 3000, notProcessedCount: 5000,
      },
      dms: {
        hasDelta: true,
        oneTime:  { rowCount: 150 },
        delta:    { rowCount: 50 },
        total: 200, completed: 140, inProgress: 30, conflict: 8,
        processedWithConflict: 10, noMessage: 6, notProcessed: 6,
        processedCount: 140000, inProgressCount: 18000,
        conflictCount: 4000, notProcessedCount: 6000,
      },
    };

    const mockConflictRows = {
      channels: [
        { channelName: 'General', wsId: 'C001ABC123', error: 'Item not found. client-request-id: 3fa85f64-5717-4562-b3fc-2c963f66afa6' },
        { channelName: 'Engineering', wsId: 'C002DEF456', error: 'Permission denied on resource. client-request-id: 1a2b3c4d-1234-5678-abcd-ef0123456789' },
        { channelName: 'Product', wsId: 'C003GHI789', error: 'Rate limit exceeded.' },
      ],
      dms: [
        { channelName: 'john.doe@acme.com', wsId: 'D001JKL012', error: 'User not found in target tenant. client-request-id: aabbccdd-eeff-0011-2233-445566778899' },
        { channelName: 'jane.smith@acme.com', wsId: 'D002MNO345', error: 'Mailbox not enabled.' },
      ],
    };

    await emailService.sendAlert(
      recipient,
      '⏱ [Preview] Migration Stalled — HCL Migration',
      buildStallTextBody(mockProject, mockDiff, mockData),
      buildStallHtmlBody(mockProject, mockDiff, mockData, mockConflictRows)
    );

    await emailService.sendAlert(
      recipient,
      '⚠ [Preview] Conflict Alert — HCL Migration',
      buildConflictTextBody(mockProject, mockData),
      buildConflictHtmlBody(mockProject, mockData, mockConflictRows)
    );

    console.log(`[AlertPreview] Sent stall + conflict preview to ${recipient}`);
    res.json({ success: true, message: `Preview emails sent to ${recipient}` });

  } catch (err) {
    console.error('[AlertPreview] FAILED:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Reset alert cooldown ──────────────────────────────────────────────────────

router.post('/alerts/reset-cooldown', async (req, res) => {
  try {
    const cronService = require('../services/cronService');
    if (cronService.lastAlertSent) {
      cronService.lastAlertSent.clear();
    }
    res.json({
      success: true,
      message: 'Cooldown reset — next check will send alert'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Manual cron trigger ───────────────────────────────────────────────────────

router.post('/alerts/trigger-now', async (req, res) => {
  const logs = [];

  const originalLog   = console.log;
  const originalError = console.error;
  const originalWarn  = console.warn;

  const capture = (level, args) => {
    const msg = args.map(a =>
      typeof a === 'object'
        ? JSON.stringify(a, null, 2)
        : String(a)
    ).join(' ');
    logs.push({ level, msg });
  };

  console.log   = (...a) => { capture('log',   a); originalLog(...a);   };
  console.error = (...a) => { capture('error', a); originalError(...a); };
  console.warn  = (...a) => { capture('warn',  a); originalWarn(...a);  };

  try {
    const { checkProjects } = require('../services/cronService');
    await checkProjects();

    res.json({
      success:   true,
      timestamp: new Date().toISOString(),
      logs
    });

  } catch (err) {
    logs.push({ level: 'error', msg: 'FATAL: ' + err.message });
    res.status(500).json({
      success: false,
      error:   err.message,
      logs
    });
  } finally {
    console.log   = originalLog;
    console.error = originalError;
    console.warn  = originalWarn;
  }
});

// ── Domain Whitelist ──────────────────────────────────────────────────────────

router.get('/config/domains', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const db = mongoose.connection.db;
    const doc = await db.collection('systemconfigs')
      .findOne({ key: 'domainWhitelist' });

    res.json({
      domains:   doc?.data?.domains || [],
      updatedAt: doc?.updatedAt     || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/config/domains', async (req, res) => {
  try {
    const { domains } = req.body;

    if (!Array.isArray(domains)) {
      return res.status(400).json({ error: 'domains must be an array' });
    }

    const cleaned = domains
      .map(d => d.toLowerCase().trim().replace(/^@/, ''))
      .filter(d => d.includes('.') && d.length > 3);

    const mongoose = require('mongoose');
    const db = mongoose.connection.db;

    await db.collection('systemconfigs').findOneAndUpdate(
      { key: 'domainWhitelist' },
      {
        $set: {
          key:       'domainWhitelist',
          data:      { domains: cleaned },
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    console.log('[Domains] Whitelist updated:', cleaned);

    res.json({ success: true, domains: cleaned });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin logs ────────────────────────────────────────────────────────────────

router.get('/logs', async (req, res) => {
  try {
    const logs = await AdminLog.find({}).sort({ timestamp: -1 }).limit(100);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
