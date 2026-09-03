import express from 'express';
const router = express.Router();
import { loginUser, registerUser, logoutUser, getMe  } from '../controllers/authController.js';
import { protect, authorize  } from '../middlewares/authMiddleware.js';
import { loginValidator, registerValidator  } from '../validators/authValidator.js';

// Public routes
router.post('/login', loginValidator, loginUser);

// Protected routes
router.post('/logout', protect, logoutUser);
router.get('/me', protect, getMe);

// Admin-only routes
router.post('/register', protect, authorize('users.manage'), registerValidator, registerUser);

export default router;
