const crypto = require('crypto');

const generateCodeVerifier = () =>
  crypto.randomBytes(32)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g,  '');

const generateCodeChallenge = (verifier) =>
  crypto.createHash('sha256')
    .update(verifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g,  '');

module.exports = { generateCodeVerifier, generateCodeChallenge };
