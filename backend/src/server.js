require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 5000;

// Global crash handlers — must be first
process.on('uncaughtException', (err) => {
  console.error('[CRASH] Uncaught Exception:', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('[CRASH] Unhandled Rejection:', reason);
});

// Basic middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5047',
  credentials: true
}));
app.use(express.json());

// Health check — always works even if DB is down
app.get('/health', (req, res) => {
  res.json({ status: 'ok', port: PORT, time: new Date().toISOString() });
});

// Debug route — no auth, no DB needed
app.get('/api/debug/devlogin', (req, res) => {
  res.json({
    ENABLE_DEV_LOGIN: process.env.ENABLE_DEV_LOGIN || 'NOT SET',
    DEV_ADMIN_USER: process.env.DEV_ADMIN_USER || 'NOT SET',
    DEV_ADMIN_PASSWORD: process.env.DEV_ADMIN_PASSWORD ? 'SET' : 'NOT SET',
    DEV_JWT_SECRET: process.env.DEV_JWT_SECRET ? 'SET' : 'NOT SET',
    JWT_SECRET: process.env.JWT_SECRET ? 'SET' : 'NOT SET',
    USE_MOCK_DATA: process.env.USE_MOCK_DATA || 'NOT SET',
    SKIP_AUTH: process.env.SKIP_AUTH || 'NOT SET',
    METABASE_URL: process.env.METABASE_URL || 'NOT SET',
    METABASE_USERNAME: process.env.METABASE_USERNAME || 'NOT SET',
    METABASE_PASSWORD: process.env.METABASE_PASSWORD ? 'SET' : 'NOT SET',
  });
});

// Load routes safely — each in its own try/catch
try {
  app.use('/api/auth', require('./routes/auth'));
  console.log('[Routes] auth ✓');
} catch(e) { console.error('[Routes] auth FAILED:', e.message); }

try {
  app.use('/api/projects', require('./routes/projects'));
  console.log('[Routes] projects ✓');
} catch(e) { console.error('[Routes] projects FAILED:', e.message); }

try {
  app.use('/api/alerts', require('./routes/alerts'));
  console.log('[Routes] alerts ✓');
} catch(e) { console.error('[Routes] alerts FAILED:', e.message); }

try {
  app.use('/api/admin', require('./routes/admin'));
  console.log('[Routes] admin ✓');
} catch(e) { console.error('[Routes] admin FAILED:', e.message); }

try {
  app.use('/api/reports', require('./routes/reports'));
  console.log('[Routes] reports ✓');
} catch(e) { console.error('[Routes] reports FAILED:', e.message); }

try {
  app.use('/api/users', require('./routes/users'));
  console.log('[Routes] users ✓');
} catch(e) { console.error('[Routes] users FAILED:', e.message); }

// Print all registered routes for startup verification
const listRoutes = (app) => {
  const routes = [];
  app._router.stack.forEach(middleware => {
    if (middleware.route) {
      routes.push(
        `${Object.keys(middleware.route.methods).join(',').toUpperCase()} ${middleware.route.path}`
      );
    } else if (middleware.name === 'router') {
      const prefix = middleware.regexp.source
        .replace('^\\/', '').replace('\\/?(?=\\/|$)', '').replace(/\\\//g, '/') || '';
      middleware.handle.stack.forEach(handler => {
        if (handler.route) {
          routes.push(
            `${Object.keys(handler.route.methods).join(',').toUpperCase()} /${prefix}${handler.route.path}`
          );
        }
      });
    }
  });
  return routes;
};

try {
  const allRoutes = listRoutes(app);
  console.log(`[Routes] Total registered: ${allRoutes.length}`);
  allRoutes.filter(r => r.includes('smtp') || r.includes('test')).forEach(r => console.log('  ', r));
} catch(e) { /* router not fully initialised yet */ }

async function printConfigStatus() {
  try {
    const { hasConfig } = require('./services/configService');
    const keys = ['metabase', 'smtp', 'azure', 'devAdmin', 'devLoginEnabled'];
    const results = await Promise.all(keys.map(async k => ({ k, ok: await hasConfig(k) })));
    console.log('[Config] MongoDB config status:');
    for (const { k, ok } of results) {
      console.log(`  ${ok ? '✓' : '✗'} ${k}`);
    }
  } catch (e) {
    console.error('[Config] Status check failed:', e.message);
  }
}

// Connect MongoDB safely, then start the cron
const connectDB = async () => {
  try {
    const mongoose = require('mongoose');
    await mongoose.connect(process.env.MONGODB_URI ||
      'mongodb://localhost:27017/migration-monitor');
    console.log('[MongoDB] Connected ✓');

    await printConfigStatus();

    // Warm in-memory snapshot cache from MongoDB
    try {
      const snapshotStore = require('./services/snapshotStore');
      await snapshotStore.initializeCache();
    } catch(e) {
      console.error('[Snapshot] Cache init failed:', e.message);
    }

    // Start cron AFTER DB is ready so ProjectConfig queries work
    try {
      const cronService = require('./services/cronService');
      cronService.startCron();
    } catch(e) {
      console.error('[Cron] Failed to start:', e.message);
    }

    // Midnight cleanup of old snapshots
    try {
      const cron = require('node-cron');
      const snapshotStore = require('./services/snapshotStore');
      cron.schedule('0 0 * * *', () => {
        snapshotStore.cleanupOldSnapshots().catch(e =>
          console.error('[Snapshot] Midnight cleanup error:', e.message)
        );
      });
      console.log('[Cron] Midnight snapshot cleanup scheduled ✓');
    } catch(e) {
      console.error('[Cron] Cleanup schedule failed:', e.message);
    }
  } catch(e) {
    console.error('[MongoDB] Connection FAILED:', e.message);
    console.log('[MongoDB] Continuing without MongoDB...');
  }
};

// START SERVER FIRST — then connect to services
app.listen(PORT, () => {
  console.log('\n========================================');
  console.log(`[Server] Running on http://localhost:${PORT}`);
  console.log(`[Server] Health: http://localhost:${PORT}/health`);
  console.log(`[Server] Debug: http://localhost:${PORT}/api/debug/devlogin`);
  console.log('========================================\n');

  // List all admin routes after require cache settles
  setTimeout(() => {
    try {
      const adminRouter = require('./routes/admin');
      console.log('\n[Admin Routes] Registered:');
      adminRouter.stack
        .filter(r => r.route)
        .forEach(r => {
          const methods = Object.keys(r.route.methods).join(',').toUpperCase();
          console.log(`  ${methods} /api/admin${r.route.path}`);
        });
    } catch (e) { console.error('[Admin Routes] List failed:', e.message); }
  }, 2000);

  // Connect DB after server is listening
  connectDB();
});

module.exports = app;
