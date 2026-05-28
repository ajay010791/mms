const mongoose = require('mongoose');

async function connectDB() {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/migration-monitor';
    await mongoose.connect(uri);
    console.log('[DB] MongoDB connected:', uri);
  } catch (err) {
    console.error('[DB] Connection error:', err.message);
    process.exit(1);
  }
}

module.exports = { connectDB };
