import CompanySettings from '../models/CompanySettings.js';
import ApiError from '../utils/ApiError.js';
import { runDatabaseBackup, getGoogleAuthUrl, exchangeAndStoreTokens } from '../services/backupService.js';
import { isValidStateCode, normalizeGstin, normalizeStateCode } from '../utils/gstMaster.js';
import { DOCUMENT_TYPES, previewAllSequences } from '../utils/documentNumbering.js';
import { logAudit } from '../utils/auditLogger.js';

const BUSINESS_FIELDS = ['companyName', 'address', 'gstin', 'stateCode', 'phone', 'email', 'timezone'];
// Only series prefixes are configurable. Per-day sequences (001–999) live in
// the DocumentCounter collection and are never hand-edited (never reused).
const SEQUENCE_FIELDS = Object.values(DOCUMENT_TYPES).map((c) => c.prefixField);
const PREFIX_FIELDS = new Set(Object.values(DOCUMENT_TYPES).map((c) => c.prefixField));

const pickFields = (body, allowed) => {
  const out = {};
  for (const key of allowed) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
};

const validateBusinessData = (data) => {
  // GSTIN is optional free text — deliberately NOT format-validated (owner's rule).
  if (data.stateCode !== undefined && !isValidStateCode(data.stateCode)) {
    throw new ApiError(400, 'State code is invalid. Use a 2-digit GST state code.');
  }
  if (data.companyName !== undefined && String(data.companyName).trim() === '') {
    throw new ApiError(400, 'Business name is required.');
  }
  if (data.timezone !== undefined) {
    try {
      new Intl.DateTimeFormat('en-CA', { timeZone: String(data.timezone) });
    } catch {
      throw new ApiError(400, 'Timezone is invalid. Use an IANA timezone like Asia/Kolkata.');
    }
    if (!/^[A-Za-z_]+\/[A-Za-z_+-]+$/.test(String(data.timezone))) {
      throw new ApiError(400, 'Timezone is invalid. Use an IANA timezone like Asia/Kolkata.');
    }
  }
};

const validateSequenceData = (data) => {
  for (const [key, value] of Object.entries(data)) {
    if (PREFIX_FIELDS.has(key)) {
      if (!/^[A-Z]{2,5}-$/.test(String(value).trim().toUpperCase())) {
        throw new ApiError(400, `Prefix for ${key} is invalid. Use 2-5 uppercase letters followed by a hyphen (e.g. INV-).`);
      }
    } else {
      throw new ApiError(400, `Unknown sequence field: ${key}. Only series prefixes are configurable.`);
    }
  }
};

const auditSettingsChange = (req, action, summary, metadata) => {
  logAudit({
    action,
    entity: 'CompanySettings',
    entityId: null,
    userId: req.user?._id,
    summary,
    metadata,
    ipAddress: req.ip,
  });
};

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
    // Exclude `isSingleton` from updates just in case it's in the body.
    // Kept for backward compatibility — new clients should use
    // PUT /business and PUT /sequences separately.
    const { isSingleton, _id, googleRefreshToken, ...updateData } = req.body;

    const businessUpdate = pickFields(updateData, BUSINESS_FIELDS);
    const sequenceUpdate = pickFields(updateData, SEQUENCE_FIELDS);
    validateBusinessData(businessUpdate);
    validateSequenceData(sequenceUpdate);
    if (businessUpdate.gstin !== undefined) businessUpdate.gstin = normalizeGstin(businessUpdate.gstin);
    if (businessUpdate.stateCode !== undefined) businessUpdate.stateCode = normalizeStateCode(businessUpdate.stateCode);
    for (const key of PREFIX_FIELDS) {
      if (sequenceUpdate[key] !== undefined) sequenceUpdate[key] = String(sequenceUpdate[key]).trim().toUpperCase();
    }
    const sanitized = { ...businessUpdate, ...sequenceUpdate };

    let settings = await CompanySettings.getSettings();

    // Perform update
    settings = await CompanySettings.findByIdAndUpdate(
      settings._id,
      sanitized,
      { returnDocument: 'after', runValidators: true }
    );

    auditSettingsChange(req, 'BUSINESS_SETTINGS_UPDATED', `Settings updated (legacy combined endpoint) by ${req.user?.name || req.user?.email || 'Admin'}`, { fields: Object.keys(sanitized) });
    res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update business details only (separate lifecycle from sequences)
 * @route   PUT /api/settings/business
 * @access  Private/Admin
 */
const updateBusinessSettings = async (req, res, next) => {
  try {
    const updateData = pickFields(req.body, BUSINESS_FIELDS);
    if (Object.keys(updateData).length === 0) {
      throw new ApiError(400, 'No business fields provided.');
    }
    validateBusinessData(updateData);
    if (updateData.gstin !== undefined) updateData.gstin = normalizeGstin(updateData.gstin);
    if (updateData.stateCode !== undefined) updateData.stateCode = normalizeStateCode(updateData.stateCode);

    const settings = await CompanySettings.getSettings();
    const before = pickFields(settings.toObject(), BUSINESS_FIELDS);
    const updated = await CompanySettings.findByIdAndUpdate(settings._id, updateData, {
      returnDocument: 'after',
      runValidators: true,
    });

    auditSettingsChange(req, 'BUSINESS_SETTINGS_UPDATED', `Business details updated by ${req.user?.name || req.user?.email || 'Admin'}`, { before, after: pickFields(updated.toObject(), BUSINESS_FIELDS) });
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update document sequences only (admin-only, dangerous operation)
 * @route   PUT /api/settings/sequences
 * @access  Private/Admin
 */
const updateSequenceSettings = async (req, res, next) => {
  try {
    const updateData = pickFields(req.body, SEQUENCE_FIELDS);
    if (Object.keys(updateData).length === 0) {
      throw new ApiError(400, 'No sequence fields provided.');
    }
    validateSequenceData(updateData);
    for (const key of PREFIX_FIELDS) {
      if (updateData[key] !== undefined) updateData[key] = String(updateData[key]).trim().toUpperCase();
    }

    const settings = await CompanySettings.getSettings();
    const before = pickFields(settings.toObject(), SEQUENCE_FIELDS);
    const updated = await CompanySettings.findByIdAndUpdate(settings._id, updateData, {
      returnDocument: 'after',
      runValidators: true,
    });

    auditSettingsChange(req, 'SEQUENCE_SETTINGS_UPDATED', `Document sequences updated by ${req.user?.name || req.user?.email || 'Admin'} — collision-sensitive change`, { before, after: pickFields(updated.toObject(), SEQUENCE_FIELDS) });
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Preview next production numbers (PREFIX-FYMMDD-SEQ) without consuming them
 * @route   GET /api/settings/sequences/preview
 * @access  Private
 */
const previewSequences = async (req, res, next) => {
  try {
    const settings = await CompanySettings.getSettings();
    const preview = await previewAllSequences(settings, new Date());
    res.json({ success: true, data: preview });
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
  updateBusinessSettings,
  updateSequenceSettings,
  previewSequences,
  triggerBackup,
  googleAuth,
  googleCallback,
 };
