const ADMIN_ROLES = ['dev-admin', 'ms-admin', 'pm', 'dm', 'sl', 'eng'];

function adminAuth(req, res, next) {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  if (ADMIN_ROLES.includes(user.role)) return next();
  return res.status(403).json({ error: 'Admin access required' });
}

module.exports = adminAuth;
