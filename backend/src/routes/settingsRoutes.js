import express from 'express';
const router = express.Router();
import { getSettings, updateSettings, updateBusinessSettings, updateSequenceSettings, previewSequences, triggerBackup, googleAuth, googleCallback } from '../controllers/settingsController.js';
import { protect, authorize  } from '../middlewares/authMiddleware.js';

// Get settings - Accessible by any logged-in user
router.get('/', protect, getSettings);

// Update settings - Only Admins can modify settings
// Legacy combined endpoint (kept for compatibility)
router.put('/', protect, authorize('settings.manage'), updateSettings);

// Split lifecycles: business details vs document sequences
router.put('/business', protect, authorize('settings.manage'), updateBusinessSettings);
router.put('/sequences', protect, authorize('settings.manage'), updateSequenceSettings);

// Preview next FY-aware numbers without consuming them
router.get('/sequences/preview', protect, previewSequences);

// Manually trigger backup
router.post('/backup', protect, authorize('settings.manage'), triggerBackup);

// Google Drive OAuth - One-time setup (Admin only)
router.get('/google/auth', protect, authorize('settings.manage'), googleAuth);

// Google OAuth callback - Public (Google redirects here, no auth cookie present)
router.get('/google/callback', googleCallback);

export default router;
