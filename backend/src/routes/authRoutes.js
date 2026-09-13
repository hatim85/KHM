import express from 'express';
const router = express.Router();
import {
  loginUser,
  registerUser,
  logoutUser,
  getMe,
  forgotPassword,
  verifyOtp,
  resetPassword,
  getUsers,
  updateUser,
  toggleUserActive,
} from '../controllers/authController.js';
import { protect } from '../middlewares/authMiddleware.js';
import ApiError from '../utils/ApiError.js';
import {
  loginValidator,
  registerValidator,
  forgotPasswordValidator,
  verifyOtpValidator,
  resetPasswordValidator,
} from '../validators/authValidator.js';
import {
  loginLimiter,
  forgotPasswordLimiter,
  verifyOtpLimiter,
  resetPasswordLimiter,
} from '../middlewares/rateLimiter.js';

// Admin only middleware
const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'Admin') {
    return next(new ApiError(403, 'Access denied. Only Admins can perform this action.', 'ADMIN_ONLY'));
  }
  next();
};

// Public routes
router.post('/login', loginLimiter, loginValidator, loginUser);
router.post('/forgot-password', forgotPasswordLimiter, forgotPasswordValidator, forgotPassword);
router.post('/verify-otp', verifyOtpLimiter, verifyOtpValidator, verifyOtp);
router.post('/reset-password', resetPasswordLimiter, resetPasswordValidator, resetPassword);

// Protected routes
router.post('/logout', protect, logoutUser);
router.get('/me', protect, getMe);

// Admin-only user management routes
router.post('/register', protect, adminOnly, registerValidator, registerUser);
router.get('/users', protect, adminOnly, getUsers);
router.put('/users/:id', protect, adminOnly, updateUser);
router.patch('/users/:id/toggle-active', protect, adminOnly, toggleUserActive);

export default router;
