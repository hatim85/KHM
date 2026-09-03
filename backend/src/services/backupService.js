import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import { google } from 'googleapis';
import { fileURLToPath } from 'url';
import AuditLog from '../models/AuditLog.js';
import CompanySettings from '../models/CompanySettings.js';

const execPromise = util.promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const BACKUP_DIR = path.join(__dirname, '../../backups');
const RETENTION_DAYS = 7;

/**
 * Create a raw OAuth2 client (no credentials set yet).
 */
const createOAuth2Client = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth credentials not configured in .env (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
};

/**
 * Generate the Google OAuth consent URL (one-time setup).
 */
export const getGoogleAuthUrl = () => {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive.file'],
  });
};

/**
 * Exchange the authorization code for tokens and store refresh token in MongoDB.
 */
export const exchangeAndStoreTokens = async (code) => {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error('No refresh token received. Revoke access at myaccount.google.com/permissions and try again.');
  }

  // Store refresh token securely in MongoDB (select: false keeps it out of normal queries)
  const settings = await CompanySettings.getSettings();
  await CompanySettings.findByIdAndUpdate(settings._id, {
    googleRefreshToken: tokens.refresh_token
  });

  return true;
};

/**
 * Get an authenticated Drive service using the refresh token stored in MongoDB.
 */
const getDriveService = async () => {
  if (!process.env.GOOGLE_DRIVE_FOLDER_ID) {
    throw new Error('GOOGLE_DRIVE_FOLDER_ID not configured in .env');
  }

  // Load refresh token from MongoDB (select: false requires explicit +field)
  const settings = await CompanySettings.findOne({ isSingleton: true }).select('+googleRefreshToken');
  if (!settings?.googleRefreshToken) {
    throw new Error('Google Drive not authorized. Visit /api/settings/google/auth to connect.');
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: settings.googleRefreshToken });

  return google.drive({ version: 'v3', auth: oauth2Client });
};

/**
 * Check if Google Drive backup is fully configured and authorized.
 */
export const isBackupConfigured = async () => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_DRIVE_FOLDER_ID) return false;
    const settings = await CompanySettings.findOne({ isSingleton: true }).select('+googleRefreshToken');
    return !!(settings?.googleRefreshToken);
  } catch {
    return false;
  }
};

export const runDatabaseBackup = async (userId) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `khm-db-backup-${timestamp}.gz`;
  const localFilePath = path.join(BACKUP_DIR, fileName);

  try {
    // 1. Ensure local backup directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    console.log(`[Backup] Starting mongodump to ${localFilePath}`);

    // 2. Execute mongodump
    const mongoUri = process.env.MONGODB_URI;
    await execPromise(`mongodump --uri="${mongoUri}" --archive="${localFilePath}" --gzip`);
    console.log(`[Backup] mongodump complete. File size: ${(fs.statSync(localFilePath).size / (1024 * 1024)).toFixed(2)} MB`);

    // 3. Upload to Google Drive (uses refresh token from MongoDB)
    console.log('[Backup] Authenticating with Google Drive (OAuth2)...');
    const drive = await getDriveService();
    
    console.log('[Backup] Uploading to Google Drive...');
    const fileMetadata = {
      name: fileName,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
    };
    
    const media = {
      mimeType: 'application/gzip',
      body: fs.createReadStream(localFilePath),
    };

    const uploadRes = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, name',
    });

    console.log(`[Backup] Upload successful. Google Drive File ID: ${uploadRes.data.id}`);

    // 4. Cleanup old backups on Google Drive
    await cleanupOldDriveBackups(drive);

    // 5. Cleanup local file
    fs.unlinkSync(localFilePath);
    console.log('[Backup] Local temporary file removed.');

    // 6. Log success to Audit
    await AuditLog.create({
      user: userId,
      action: 'BACKUP_COMPLETED',
      entity: 'System',
      summary: `Automated backup uploaded to Google Drive: ${fileName}`,
      metadata: { fileId: uploadRes.data.id, fileName },
      ipAddress: '127.0.0.1'
    });

    return { success: true, fileId: uploadRes.data.id, fileName };
  } catch (error) {
    console.error('[Backup] Process failed:', error);
    
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }

    await AuditLog.create({
      action: 'BACKUP_FAILED',
      entity: 'System',
      user: null,
      summary: `Automated backup failed: ${error.message}`,
      metadata: { error: error.message },
      ipAddress: '127.0.0.1'
    }).catch(() => {});

    throw error;
  }
};

const cleanupOldDriveBackups = async (drive) => {
  try {
    console.log(`[Backup] Checking for Google Drive backups older than ${RETENTION_DAYS} days...`);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
    const cutoffString = cutoffDate.toISOString();

    const q = `'${process.env.GOOGLE_DRIVE_FOLDER_ID}' in parents and createdTime < '${cutoffString}' and trashed = false`;
    
    const res = await drive.files.list({
      q: q,
      fields: 'files(id, name, createdTime)',
    });

    const filesToDelete = res.data.files || [];
    if (filesToDelete.length === 0) {
      console.log('[Backup] No old backups found to delete.');
      return;
    }

    for (const file of filesToDelete) {
      console.log(`[Backup] Deleting old backup: ${file.name} (Created: ${file.createdTime})`);
      await drive.files.delete({ fileId: file.id });
    }
    
    console.log(`[Backup] Cleanup complete. Removed ${filesToDelete.length} old backups.`);
  } catch (error) {
    console.error('[Backup] Failed to cleanup old Drive backups:', error);
  }
};