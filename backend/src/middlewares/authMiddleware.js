import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';

/**
 * Protect routes - verifies JWT from HttpOnly cookie.
 * Attaches the authenticated user to req.user.
 */
const protect = async (req, res, next) => {
  try {
    const token = req.cookies.token;

    if (!token) {
      throw new ApiError(401, 'Not authorized, no token', 'NO_TOKEN');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      throw new ApiError(401, 'Not authorized, user not found', 'USER_NOT_FOUND');
    }

    if (!user.isActive) {
      throw new ApiError(401, 'Account has been deactivated', 'ACCOUNT_DEACTIVATED');
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(new ApiError(401, 'Not authorized, token invalid', 'INVALID_TOKEN'));
  }
};

/**
 * Authorize by permission.
 * Usage: authorize('sales.create', 'sales.edit')
 * Admin role bypasses all permission checks.
 */
const authorize = (...requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, 'Not authorized', 'NO_USER'));
    }

    // Admin bypasses all permission checks
    if (req.user.role === 'Admin') {
      return next();
    }

    const hasPermission = requiredPermissions.every(
      perm => req.user.permissions.includes(perm)
    );

    if (!hasPermission) {
      return next(new ApiError(403, 'Insufficient permissions', 'FORBIDDEN'));
    }

    next();
  };
};

export { protect, authorize  };
