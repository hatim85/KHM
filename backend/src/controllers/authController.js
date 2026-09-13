import User from '../models/User.js';
import generateToken from '../utils/generateToken.js';
import ApiError from '../utils/ApiError.js';
import { sendOtpEmail } from '../utils/emailService.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

/**
 * @desc    Login user & set HttpOnly cookie
 * @route   POST /api/auth/login
 * @access  Public
 */
const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      throw new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }

    if (!user.isActive) {
      throw new ApiError(401, 'Account has been deactivated', 'ACCOUNT_DEACTIVATED');
    }

    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      throw new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const token = generateToken(user._id);

    // Set HttpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Register a new internal user (Admin only)
 * @route   POST /api/auth/register
 * @access  Private/Admin
 */
const registerUser = async (req, res, next) => {
  try {
    if (req.user?.role !== 'Admin') {
      throw new ApiError(403, 'Only Admins can create new users', 'ADMIN_ONLY');
    }

    const { name, email, password, role, permissions } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new ApiError(400, 'User with this email already exists', 'USER_EXISTS');
    }

    const user = await User.create({
      name,
      email,
      password,
      role: role || 'Admin',
      permissions: permissions || [],
    });

    res.status(201).json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Logout user & clear cookie
 * @route   POST /api/auth/logout
 * @access  Private
 */
const logoutUser = async (req, res, next) => {
  try {
    res.cookie('token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      expires: new Date(0),
    });

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get current logged-in user profile
 * @route   GET /api/auth/me
 * @access  Private
 */
const getMe = async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: req.user,
    });
  } catch (error) {
    next(error);
  }
};

// ─── Forgot Password Flow ───────────────────────────────────────────────────

/**
 * @desc    Send a 6-digit OTP to user's email for password reset
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      throw new ApiError(404, 'No account found with this email address', 'USER_NOT_FOUND');
    }

    if (!user.isActive) {
      throw new ApiError(401, 'This account has been deactivated. Contact an administrator.', 'ACCOUNT_DEACTIVATED');
    }

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();

    // Hash it before storing
    const salt = await bcrypt.genSalt(10);
    user.resetOtp = await bcrypt.hash(otp, salt);
    user.resetOtpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    user.resetOtpAttempts = 0; // Reset failed attempts counter
    await user.save();

    // Send via Brevo
    await sendOtpEmail(email, otp);

    res.json({
      success: true,
      message: 'OTP sent to your email address. It is valid for 10 minutes.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Verify the OTP and return a short-lived reset token
 * @route   POST /api/auth/verify-otp
 * @access  Public
 */
const verifyOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      throw new ApiError(400, 'Invalid email or OTP', 'INVALID_OTP');
    }

    if (!user.resetOtp || !user.resetOtpExpires) {
      throw new ApiError(400, 'No OTP was requested. Please request a new one.', 'NO_OTP_REQUESTED');
    }

    if (user.resetOtpExpires < new Date()) {
      // Clear expired OTP
      user.resetOtp = null;
      user.resetOtpExpires = null;
      user.resetOtpAttempts = 0;
      await user.save();
      throw new ApiError(400, 'OTP has expired. Please request a new one.', 'OTP_EXPIRED');
    }

    if (user.resetOtpAttempts >= 5) {
      user.resetOtp = null;
      user.resetOtpExpires = null;
      user.resetOtpAttempts = 0;
      await user.save();
      throw new ApiError(400, 'Too many incorrect attempts. OTP invalidated. Please request a new one.', 'OTP_ATTEMPTS_EXCEEDED');
    }

    const isValid = await bcrypt.compare(otp, user.resetOtp);
    if (!isValid) {
      user.resetOtpAttempts = (user.resetOtpAttempts || 0) + 1;
      const attemptsLeft = 5 - user.resetOtpAttempts;
      if (attemptsLeft <= 0) {
        user.resetOtp = null;
        user.resetOtpExpires = null;
        user.resetOtpAttempts = 0;
        await user.save();
        throw new ApiError(400, 'Too many incorrect attempts. OTP invalidated. Please request a new one.', 'OTP_ATTEMPTS_EXCEEDED');
      }
      await user.save();
      throw new ApiError(400, `Invalid OTP. Please check and try again. (${attemptsLeft} attempts remaining)`, 'INVALID_OTP');
    }

    // OTP is valid — clear it so it can't be reused
    user.resetOtp = null;
    user.resetOtpExpires = null;
    user.resetOtpAttempts = 0;
    await user.save();

    // Issue a short-lived reset token (15 min)
    const resetToken = jwt.sign(
      { id: user._id, purpose: 'password-reset' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({
      success: true,
      message: 'OTP verified successfully.',
      resetToken,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Reset password using the reset token from verify-otp
 * @route   POST /api/auth/reset-password
 * @access  Public (requires valid resetToken)
 */
const resetPassword = async (req, res, next) => {
  try {
    const { resetToken, newPassword } = req.body;

    let decoded;
    try {
      decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch (err) {
      throw new ApiError(400, 'Reset token is invalid or has expired. Please start over.', 'INVALID_RESET_TOKEN');
    }

    if (decoded.purpose !== 'password-reset') {
      throw new ApiError(400, 'Invalid reset token.', 'INVALID_RESET_TOKEN');
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      throw new ApiError(404, 'User not found.', 'USER_NOT_FOUND');
    }

    user.password = newPassword; // pre-save hook will hash it
    await user.save();

    res.json({
      success: true,
      message: 'Password has been reset successfully. You can now log in with your new password.',
    });
  } catch (error) {
    next(error);
  }
};

// ─── User Management (Admin only) ──────────────────────────────────────────

/**
 * @desc    Get all users
 * @route   GET /api/auth/users
 * @access  Private/Admin
 */
const getUsers = async (req, res, next) => {
  try {
    const users = await User.find()
      .select('-password -resetOtp -resetOtpExpires')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update a user (name, email, role, permissions)
 * @route   PUT /api/auth/users/:id
 * @access  Private/Admin
 */
const updateUser = async (req, res, next) => {
  try {
    const { name, email, role, permissions, password } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
    }

    // Prevent the last active admin from being changed away from Admin role
    if (user.role === 'Admin' && role && role !== 'Admin') {
      const adminCount = await User.countDocuments({ role: 'Admin', isActive: true });
      if (adminCount <= 1) {
        throw new ApiError(400, 'Cannot change role — this is the last active Admin.', 'LAST_ADMIN');
      }
    }

    if (name) user.name = name;
    if (email) user.email = email;
    if (role) user.role = role;
    if (permissions) user.permissions = permissions;
    if (password) user.password = password; // pre-save hook will hash

    await user.save();

    res.json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Toggle user active status (activate/deactivate)
 * @route   PATCH /api/auth/users/:id/toggle-active
 * @access  Private/Admin
 */
const toggleUserActive = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
    }

    // Prevent deactivating yourself
    if (user._id.toString() === req.user._id.toString() && user.isActive) {
      throw new ApiError(400, 'You cannot deactivate your own account.', 'SELF_DEACTIVATE');
    }

    // Prevent deactivating the last active admin
    if (user.role === 'Admin' && user.isActive) {
      const adminCount = await User.countDocuments({ role: 'Admin', isActive: true });
      if (adminCount <= 1) {
        throw new ApiError(400, 'Cannot deactivate — this is the last active Admin.', 'LAST_ADMIN');
      }
    }

    user.isActive = !user.isActive;
    await user.save();

    res.json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      },
      message: user.isActive ? 'User activated' : 'User deactivated',
    });
  } catch (error) {
    next(error);
  }
};

export {
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
};

