const crypto = require('crypto');
const SystemConfig = require('../models/SystemConfig');

const ALGORITHM = 'aes-256-gcm';

function getKey() {
  const key = process.env.ENCRYPTION_KEY || '';
  return Buffer.from(key.padEnd(32, '0').slice(0, 32), 'utf8');
}

function encrypt(obj) {
  const iv = crypto.randomBytes(12);
  const key = getKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
}

function decrypt(encryptedString) {
  try {
    if (!encryptedString) return null;
    const parts = encryptedString.split(':');
    if (parts.length !== 3) {
      console.error('[ConfigService] Malformed encrypted value');
      return null;
    }
    const [ivHex, authTagHex, dataHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');
    const key = getKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch (e) {
    console.error('[ConfigService] Decrypt error:', e.message);
    return null;
  }
}

// Save config with separate plain and sensitive fields.
// plainData   — fields safe to return from GET routes (no passwords)
// sensitiveData — fields to encrypt at rest (passwords, secrets)
async function saveConfig(key, plainData = {}, sensitiveData = {}, updatedBy = 'system') {
  const encryptedData = Object.keys(sensitiveData).length > 0 ? encrypt(sensitiveData) : null;
  await SystemConfig.findOneAndUpdate(
    { key },
    {
      $set: { data: plainData, encryptedData, updatedAt: new Date(), updatedBy },
      $unset: { encryptedValue: 1 }
    },
    { upsert: true, new: true }
  );
}

// Returns merged { ...plainData, ...sensitiveData } or null if key not found.
// Falls back to legacy encryptedValue field for existing records.
async function getConfig(key) {
  try {
    const doc = await SystemConfig.findOne({ key });
    if (!doc) return null;

    // New format
    if (doc.data !== undefined || doc.encryptedData) {
      const plain = doc.data || {};
      const sensitive = doc.encryptedData ? (decrypt(doc.encryptedData) || {}) : {};
      return { ...plain, ...sensitive };
    }

    // Legacy format — single encrypted blob
    if (doc.encryptedValue) {
      return decrypt(doc.encryptedValue);
    }

    return null;
  } catch (err) {
    console.error(`[ConfigService] Error reading key "${key}":`, err.message);
    return null;
  }
}

async function hasConfig(key) {
  return !!(await SystemConfig.findOne({ key }));
}

async function deleteConfig(key) {
  await SystemConfig.deleteOne({ key });
}

module.exports = { getConfig, saveConfig, hasConfig, deleteConfig, encrypt, decrypt };
