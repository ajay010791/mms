const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    const userRole = req.user?.role;

    if (userRole === 'dev-admin' || userRole === 'super-admin') {
      return next();
    }

    if (!userRole || !allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error:   'Access denied',
        message: `Required role: ${allowedRoles.join(' or ')}`
      });
    }
    next();
  };
};

const requireDeleteAccess = (req, res, next) => {
  const role = req.user?.role;
  if (
    role === 'dev-admin' ||
    role === 'super-admin' ||
    role === 'pm'
  ) {
    return next();
  }
  return res.status(403).json({
    error:   'Access denied',
    message: 'Only Project Managers can delete records'
  });
};

module.exports = { requireRole, requireDeleteAccess };
