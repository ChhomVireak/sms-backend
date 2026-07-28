const { sendError } = require('../utils/responseHandler');

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 'Unauthenticated user.', 401);
    }
    const userRole = req.user.role ? req.user.role.toUpperCase() : '';
    const normalizedAllowed = allowedRoles.map(r => r.toUpperCase());

    if (!normalizedAllowed.includes(userRole)) {
      return sendError(res, 'Access denied. You do not have permission for this resource.', 403);
    }

    next();
  };
}

module.exports = authorizeRoles;
