const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios');

const getDevAdminConfig = async () => {
  try {
    const SystemConfig = require('../models/SystemConfig');
    const doc = await SystemConfig.findOne({ key: 'devAdmin' });

    console.log('[DevLogin] MongoDB doc found:', !!doc);

    if (doc) {
      console.log('[DevLogin] MongoDB data:', {
        username:         doc.data?.username,
        hasPasswordHash:  !!doc.data?.passwordHash,
        hashPrefix:       doc.data?.passwordHash ? doc.data.passwordHash.substring(0, 10) : 'none',
        enableDevLogin:   doc.data?.enableDevLogin,
        hasEncryptedData: !!doc.encryptedData
      });
    }

    // Primary path — hash stored plainly in data field (written by admin.js FIX 1)
    if (doc && doc.data && doc.data.username && doc.data.passwordHash) {
      return {
        username:       doc.data.username,
        passwordHash:   doc.data.passwordHash,
        enableDevLogin: doc.data.enableDevLogin !== false,
        source:         'mongodb'
      };
    }

    // Fallback — hash was stored in encryptedData (old format before this fix)
    if (doc && doc.encryptedData) {
      console.log('[DevLogin] Trying encrypted data path...');
      try {
        const configService = require('../services/configService');
        const decrypted = await configService.getConfig('devAdmin');
        console.log('[DevLogin] Decrypted config:', {
          username:        decrypted?.username,
          hasPasswordHash: !!decrypted?.passwordHash
        });
        if (decrypted?.username && decrypted?.passwordHash) {
          return {
            username:       decrypted.username,
            passwordHash:   decrypted.passwordHash,
            enableDevLogin: decrypted.enableDevLogin !== false,
            source:         'mongodb-encrypted'
          };
        }
      } catch (e) {
        console.log('[DevLogin] Decrypt failed:', e.message);
      }
    }

  } catch (e) {
    console.log('[DevLogin] MongoDB lookup error:', e.message);
  }

  // .env fallback
  console.log('[DevLogin] Falling back to .env credentials');
  return {
    username:       process.env.DEV_ADMIN_USER     || 'devadmin',
    plainPassword:  process.env.DEV_ADMIN_PASSWORD  || 'changeme123',
    enableDevLogin: process.env.ENABLE_DEV_LOGIN   !== 'false',
    source:         'env'
  };
};

// ── Azure AD config (public — called before login) ────────────────────────────

router.get('/azure-config', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const db = mongoose.connection.db;
    const doc = await db.collection('systemconfigs').findOne({ key: 'azure' });

    if (doc?.data?.clientId) {
      console.log('[AzureConfig] Loaded from MongoDB');
      return res.json({
        clientId:    doc.data.clientId,
        tenantId:    doc.data.tenantId,
        redirectUri: doc.data.redirectUri || 'http://localhost:5047',
        configured:  true
      });
    }

    const clientId = process.env.AZURE_CLIENT_ID;
    const tenantId = process.env.AZURE_TENANT_ID;
    if (clientId && tenantId) {
      console.log('[AzureConfig] Loaded from .env');
      return res.json({
        clientId,
        tenantId,
        redirectUri: process.env.AZURE_REDIRECT_URI || 'http://localhost:5047',
        configured:  true
      });
    }

    res.json({ configured: false });
  } catch (err) {
    console.error('[AzureConfig] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── MS Login (exchange MSAL access token for app JWT) ─────────────────────────

router.post('/ms-login', async (req, res) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken) {
      return res.status(400).json({ error: 'Access token required' });
    }

    // Verify with Microsoft Graph API
    let msUser;
    try {
      const graphResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000
      });
      msUser = graphResponse.data;
    } catch (graphErr) {
      console.error('[MSLogin] Graph API failed:', graphErr.message);
      return res.status(401).json({ error: 'Failed to get user info from Microsoft' });
    }

    const userEmail = (msUser.mail || msUser.userPrincipalName || '').toLowerCase();
    const userName  = msUser.displayName || userEmail;

    console.log('[MSLogin] User:', { userName, userEmail });

    // Check admin emails list
    const mongoose = require('mongoose');
    const db       = mongoose.connection.db;

    // Try adminEmails collection first (written by Admin → Admin Emails UI)
    const adminEmailsDoc = await db.collection('systemconfigs').findOne({ key: 'adminEmails' });
    const adminEmails    = (adminEmailsDoc?.data?.emails || []).map(e => e.toLowerCase());

    console.log('[MSLogin] Admin emails configured:', adminEmails.length);

    // If no admin emails are configured, grant ms-admin to all MS users
    // (prevents lockout during initial setup)
    let role;
    if (adminEmails.length === 0) {
      role = 'ms-admin';
      console.log('[MSLogin] No admin emails configured — granting ms-admin to all');
    } else {
      role = adminEmails.includes(userEmail) ? 'ms-admin' : 'ms-user';
    }

    console.log('[MSLogin] Assigned role:', role);

    const secret = process.env.DEV_JWT_SECRET || process.env.JWT_SECRET || 'fallback-secret';
    const token  = jwt.sign(
      { role, name: userName, email: userEmail },
      secret,
      { expiresIn: '8h' }
    );

    console.log('[MSLogin] ✓ Success:', userName, role);
    res.json({ token, user: { name: userName, email: userEmail, role } });

  } catch (err) {
    console.error('[MSLogin] Error:', err.message);
    res.status(500).json({ error: 'Login failed: ' + err.message });
  }
});

// ── Debug endpoints ────────────────────────────────────────────────────────────

router.get('/debug/devlogin-detail', async (req, res) => {
  try {
    const SystemConfig = require('../models/SystemConfig');
    const doc = await SystemConfig.findOne({ key: 'devAdmin' });

    res.json({
      mongodbConfig: doc ? {
        exists:            true,
        username:          doc.data?.username,
        hasPasswordHash:   !!doc.data?.passwordHash,
        passwordHashPrefix: doc.data?.passwordHash
          ? doc.data.passwordHash.substring(0, 10) + '...'
          : null,
        enableDevLogin:    doc.data?.enableDevLogin,
        hasEncryptedData:  !!doc.encryptedData
      } : { exists: false },
      envConfig: {
        DEV_ADMIN_USER:     process.env.DEV_ADMIN_USER     || 'NOT SET',
        DEV_ADMIN_PASSWORD: process.env.DEV_ADMIN_PASSWORD
          ? 'SET (' + process.env.DEV_ADMIN_PASSWORD.length + ' chars)'
          : 'NOT SET',
        ENABLE_DEV_LOGIN:   process.env.ENABLE_DEV_LOGIN   || 'NOT SET',
        DEV_JWT_SECRET:     process.env.DEV_JWT_SECRET ? 'SET' : 'NOT SET'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// TEMP DEBUG — plain .env credential check in isolation
router.post('/dev-login-test', (req, res) => {
  const { username, password } = req.body;
  const expectedUser = process.env.DEV_ADMIN_USER;
  const expectedPass = process.env.DEV_ADMIN_PASSWORD;
  const jwtSecret    = process.env.DEV_JWT_SECRET || process.env.JWT_SECRET;

  console.log('[LoginTest] Received:', { username, passwordLength: password?.length });
  console.log('[LoginTest] Username match:', username === expectedUser);
  console.log('[LoginTest] Password match:', password === expectedPass);

  if (!expectedUser || !expectedPass) {
    return res.status(500).json({
      error: 'ENV NOT SET',
      DEV_ADMIN_USER:     expectedUser || 'MISSING',
      DEV_ADMIN_PASSWORD: expectedPass ? 'SET' : 'MISSING'
    });
  }

  if (username === expectedUser && password === expectedPass) {
    const token = jwt.sign({ role: 'dev-admin', name: 'Dev Admin' }, jwtSecret, { expiresIn: '8h' });
    return res.json({ success: true, token });
  }

  return res.status(401).json({ error: 'Credentials do not match' });
});

// ── Dev login ─────────────────────────────────────────────────────────────────

router.post('/dev-login', async (req, res) => {
  try {
    const { username, password } = req.body || {};

    console.log('[DevLogin] ─────────────────────────');
    console.log('[DevLogin] Username received:', username);
    console.log('[DevLogin] Password length:', password?.length);

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const config = await getDevAdminConfig();

    console.log('[DevLogin] Config source:', config.source);
    console.log('[DevLogin] Config username:', config.username);
    console.log('[DevLogin] Has hash:', !!config.passwordHash);
    console.log('[DevLogin] Has plain:', !!config.plainPassword);
    console.log('[DevLogin] Dev login enabled:', config.enableDevLogin);

    if (!config.enableDevLogin) {
      return res.status(403).json({ error: 'Dev login is disabled' });
    }

    // Username check — case-insensitive trim
    const usernameMatch = username.trim().toLowerCase() === config.username.trim().toLowerCase();
    console.log('[DevLogin] Username match:', usernameMatch);

    if (!usernameMatch) {
      console.log('[DevLogin] Expected:', config.username, '| Received:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Password check
    let passwordMatch = false;

    if (config.passwordHash) {
      console.log('[DevLogin] Comparing with bcrypt hash...');
      try {
        passwordMatch = await bcrypt.compare(password.trim(), config.passwordHash);
        console.log('[DevLogin] bcrypt result:', passwordMatch);
      } catch (bcryptErr) {
        console.error('[DevLogin] bcrypt error:', bcryptErr.message);
        passwordMatch = false;
      }
    } else if (config.plainPassword) {
      console.log('[DevLogin] Comparing plain text...');
      passwordMatch = password.trim() === config.plainPassword.trim();
      // Handle case where .env value is a bcrypt hash
      if (!passwordMatch && config.plainPassword.startsWith('$2')) {
        console.log('[DevLogin] Trying bcrypt for .env value...');
        passwordMatch = await bcrypt.compare(password.trim(), config.plainPassword);
      }
      console.log('[DevLogin] Plain match:', passwordMatch);
    }

    if (!passwordMatch) {
      console.log('[DevLogin] ✗ Password mismatch');
      console.log('[DevLogin] ─────────────────────────');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const secret = process.env.DEV_JWT_SECRET || process.env.JWT_SECRET || 'dev-fallback-secret';
    const token = jwt.sign(
      { role: 'dev-admin', name: 'Dev Admin', username: config.username },
      secret,
      { expiresIn: '8h' }
    );

    console.log('[DevLogin] ✓ Login successful for:', config.username);
    console.log('[DevLogin] ─────────────────────────');
    return res.json({ token, user: { name: 'Dev Admin', role: 'dev-admin' } });

  } catch (err) {
    console.error('[DevLogin] Unexpected error:', err.message);
    console.error('[DevLogin] Stack:', err.stack);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/reset-dev-password', async (req, res) => {
  try {
    const { newUsername, newPassword } = req.body;

    if (!newUsername || !newPassword) {
      return res.status(400).json({ error: 'newUsername and newPassword required' });
    }

    const SystemConfig = require('../models/SystemConfig');
    const passwordHash = await bcrypt.hash(newPassword, 12);

    await SystemConfig.findOneAndUpdate(
      { key: 'devAdmin' },
      {
        key: 'devAdmin',
        data: { username: newUsername, passwordHash, enableDevLogin: true },
        encryptedData: null,
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );

    console.log('[DevLogin] Password reset for:', newUsername);
    res.json({ success: true, message: 'Password reset successfully', username: newUsername });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
