const express = require('express');
const router = express.Router();

router.get('/metabase', async (req, res) => {
  const results = {
    env: {
      USE_MOCK_DATA: process.env.USE_MOCK_DATA,
      METABASE_URL: process.env.METABASE_URL
        ? process.env.METABASE_URL.replace(/\/\/.*@/, '//***@')
        : 'NOT SET',
      METABASE_USERNAME: process.env.METABASE_USERNAME
        ? process.env.METABASE_USERNAME.substring(0, 3) + '***'
        : 'NOT SET',
      METABASE_PASSWORD: process.env.METABASE_PASSWORD ? 'SET' : 'NOT SET',
      SKIP_AUTH: process.env.SKIP_AUTH,
      NODE_ENV: process.env.NODE_ENV,
    },
    mongodb: { metabaseConfig: null },
    metabase: {
      authStatus: null,
      authError: null,
      databases: [],
      databaseError: null,
    }
  };

  try {
    const configService = require('../services/configService');
    const config = await configService.getConfig('metabase');
    results.mongodb.metabaseConfig = config ? {
      url: config.url ? config.url.substring(0, 20) + '...' : 'not set',
      username: config.username ? config.username.substring(0, 3) + '***' : 'not set',
      password: config.password ? 'SET' : 'not set',
    } : 'NOT CONFIGURED IN MONGODB';
  } catch (e) {
    results.mongodb.error = e.message;
  }

  try {
    const metabase = require('../services/metabase');
    const token = await metabase.authenticate();
    results.metabase.authStatus = token ? 'SUCCESS' : 'FAILED - no token returned';

    try {
      const databases = await metabase.getDatabases();
      results.metabase.databases = (databases || []).map(db => ({
        id: db.id,
        name: db.name,
        engine: db.engine
      }));
    } catch (dbErr) {
      results.metabase.databaseError = dbErr.message;
    }
  } catch (authErr) {
    results.metabase.authStatus = 'FAILED';
    results.metabase.authError = authErr.message;
  }

  res.json(results);
});

router.get('/devlogin', (req, res) => {
  res.json({
    ENABLE_DEV_LOGIN: process.env.ENABLE_DEV_LOGIN,
    DEV_ADMIN_USER: process.env.DEV_ADMIN_USER || 'NOT SET',
    DEV_ADMIN_PASSWORD: process.env.DEV_ADMIN_PASSWORD ? 'SET' : 'NOT SET',
    DEV_JWT_SECRET: process.env.DEV_JWT_SECRET ? 'SET' : 'NOT SET',
    JWT_SECRET: process.env.JWT_SECRET ? 'SET' : 'NOT SET',
  });
});

module.exports = router;
