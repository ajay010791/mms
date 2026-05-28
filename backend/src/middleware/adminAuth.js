function adminAuth(req, res, next) {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  if (user.role === 'dev-admin' || user.role === 'ms-admin') return next();
  return res.status(403).json({ error: 'Admin access required' });
}

module.exports = adminAuth;
