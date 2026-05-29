/**
 * export-db.js — Export safe collections to mongo-seed/
 * Usage (from backend/): node scripts/export-db.js
 *
 * Exports:  projectconfigs  (safe — project names, DB IDs, settings)
 * Skips:    systemconfigs   (contains SMTP passwords, Azure secrets, tokens)
 *           snapshots       (ephemeral — regenerates automatically)
 */

require('dotenv').config();

const { MongoClient } = require('mongodb');
const fs   = require('fs');
const path = require('path');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/migration-monitor';
const OUT_DIR   = path.join(__dirname, '../../mongo-seed');

async function run() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB:', MONGO_URI);

    const db = client.db();

    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

    const projects = await db.collection('projectconfigs').find({}).toArray();
    fs.writeFileSync(
      path.join(OUT_DIR, 'projectconfigs.json'),
      JSON.stringify(projects, null, 2)
    );
    console.log(`✓ Exported ${projects.length} project(s) → mongo-seed/projectconfigs.json`);
    console.log('\nNOTE: systemconfigs (SMTP, Azure secrets) intentionally NOT exported.');
    console.log('Configure those via Admin panel after deployment.\n');

  } finally {
    await client.close();
  }
}

run().catch(err => { console.error('Export failed:', err.message); process.exit(1); });
