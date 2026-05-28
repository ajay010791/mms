require('dotenv').config();
const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  if (process.env.SKIP_AUTH === 'true') {
    req.user = { name: 'Dev', role: 'dev-admin', email: 'dev' };
    return next();
  }

  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    if (!token || token === 'null' || token === 'undefined') {
      return res.status(401).json({ error: 'Invalid token format' });
    }

    // Both ms-login and dev-login JWTs are signed with DEV_JWT_SECRET || JWT_SECRET.
    // Try each env var independently to handle mismatched configs.
    const secret1 = process.env.DEV_JWT_SECRET || process.env.JWT_SECRET;
    const secret2 = process.env.JWT_SECRET     || process.env.DEV_JWT_SECRET;

    let decoded = null;

    try {
      decoded = jwt.verify(token, secret1);
    } catch (_) {
      try {
        decoded = jwt.verify(token, secret2);
      } catch (e2) {
        console.log('[Auth] Token invalid:', e2.message);
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
    }

    req.user = {
      name:  decoded.name  || decoded.email || 'User',
      role:  decoded.role  || 'user',
      email: decoded.email || decoded.username || ''
    };

    return next();

  } catch (err) {
    console.error('[Auth] Middleware error:', err.message);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

module.exports = authMiddleware;
