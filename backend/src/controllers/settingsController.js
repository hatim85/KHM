import CompanySettings from '../models/CompanySettings.js';
import ApiError from '../utils/ApiError.js';
import { runDatabaseBackup, getGoogleAuthUrl, exchangeAndStoreTokens } from '../services/backupService.js';

/**
 * @desc    Get company settings
 * @route   GET /api/settings
 * @access  Private
 */
const getSettings = async (req, res, next) => {
  try {
    const settings = await CompanySettings.getSettings();
    res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update company settings
 * @route   PUT /api/settings
 * @access  Private/Admin
 */
const updateSettings = async (req, res, next) => {
  try {
    // Exclude `isSingleton` from updates just in case it's in the body
    const { isSingleton, _id, ...updateData } = req.body;

    let settings = await CompanySettings.getSettings();
    
    // Perform update
    settings = await CompanySettings.findByIdAndUpdate(
      settings._id,
      updateData,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Manually trigger database backup
 * @route   POST /api/settings/backup
 * @access  Private/Admin
 */
const triggerBackup = async (req, res, next) => {
  try {
    const result = await runDatabaseBackup(req.user._id);
    res.json({
      success: true,
      message: 'Backup completed and uploaded successfully to Google Drive',
      data: result,
    });
  } catch (error) {
    next(new ApiError(500, `Backup failed: ${error.message}`));
  }
};

/**
 * @desc    Redirect admin to Google OAuth consent screen (one-time setup)
 * @route   GET /api/settings/google/auth
 * @access  Private/Admin
 */
const googleAuth = (req, res, next) => {
  try {
    const authUrl = getGoogleAuthUrl();
    res.redirect(authUrl);
  } catch (error) {
    next(new ApiError(500, `Google Auth setup failed: ${error.message}`));
  }
};

/**
 * @desc    Handle Google OAuth callback — exchanges code and securely stores token in DB
 * @route   GET /api/settings/google/callback
 * @access  Public (Google redirects here)
 */
const googleCallback = async (req, res, next) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).send('Missing authorization code from Google.');
    }

    await exchangeAndStoreTokens(code);

    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>KHM Backup - Google Drive Connected</title>
      <style>
        body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
        .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 40px; max-width: 600px; width: 100%; text-align: center; }
        h1 { color: #22c55e; margin-top: 0; }
      </style>
      </head>
      <body>
        <div class="card">
          <h1>✅ Google Drive Connected!</h1>
          <p>Your Google Drive has been successfully linked for automated backups.</p>
          <p>The authorization token has been securely stored in the database.</p>
          <p>You may now close this window and return to the KHM ERP dashboard.</p>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    next(new ApiError(500, `Google OAuth callback failed: ${error.message}`));
  }
};

export { getSettings,
  updateSettings,
  triggerBackup,
  googleAuth,
  googleCallback,
 };
