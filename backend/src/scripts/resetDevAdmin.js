require('dotenv').config({
  path: require('path').join(__dirname, '../../.env')
});
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const SystemConfigSchema = new mongoose.Schema({
  key:           { type: String, required: true, unique: true },
  data:          { type: mongoose.Schema.Types.Mixed },
  encryptedData: { type: String },
  updatedAt:     { type: Date, default: Date.now }
});

const SystemConfig = mongoose.model('SystemConfig', SystemConfigSchema);

const reset = async () => {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/migration-monitor'
    );
    console.log('MongoDB connected');

    await SystemConfig.deleteOne({ key: 'devAdmin' });
    console.log('Cleared old devAdmin config');

    const passwordHash = await bcrypt.hash('changeme123', 12);
    console.log('Password hashed');

    await SystemConfig.create({
      key: 'devAdmin',
      data: {
        username:       'devadmin',
        passwordHash,
        enableDevLogin: true
      },
      encryptedData: null,
      updatedAt:     new Date()
    });

    console.log('✓ Dev admin reset successfully');
    console.log('  Username: devadmin');
    console.log('  Password: changeme123');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Reset failed:', err.message);
    process.exit(1);
  }
};

reset();
