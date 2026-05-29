/**
 * import-db.js — Restore projectconfigs on a new server
 * Usage (from backend/): node scripts/import-db.js
 *
 * Run once after first deployment to seed project configuration.
 * Skips projects that already exist (matched by metabaseDatabaseId).
 */

require('dotenv').config();

const { MongoClient, ObjectId } = require('mongodb');
const fs   = require('fs');
const path = require('path');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/migration-monitor';
const SEED_FILE = path.join(__dirname, '../../mongo-seed/projectconfigs.json');

async function run() {
  if (!fs.existsSync(SEED_FILE)) {
    console.error('Seed file not found:', SEED_FILE);
    process.exit(1);
  }

  const projects = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  const client   = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB:', MONGO_URI);

    const col = client.db().collection('projectconfigs');
    let inserted = 0, skipped = 0;

    for (const project of projects) {
      const existing = await col.findOne({ metabaseDatabaseId: project.metabaseDatabaseId });
      if (existing) {
        console.log(`  ⟳ Skip  "${project.projectName}" (DB ${project.metabaseDatabaseId}) — already exists`);
        skipped++;
        continue;
      }

      const doc = { ...project };
      if (doc._id?.$oid) doc._id = new ObjectId(doc._id.$oid);

      await col.insertOne(doc);
      console.log(`  ✓ Import "${project.projectName}" (DB ${project.metabaseDatabaseId})`);
      inserted++;
    }

    console.log(`\nDone — ${inserted} imported, ${skipped} skipped.`);
    console.log('Next: configure SMTP / Azure / Metabase credentials via Admin panel.');

  } finally {
    await client.close();
  }
}

run().catch(err => { console.error('Import failed:', err.message); process.exit(1); });
