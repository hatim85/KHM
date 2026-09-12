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
const RETENTION_DAYS = 3;

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

/**
 * Check Google Drive connection status by making a real API call.
 * Returns: { status: 'connected'|'auth_required'|'not_configured', message: string }
 */
export const checkDriveStatus = async () => {
  try {
    // Check env config first
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
      return { status: 'not_configured', message: 'Google OAuth credentials not configured on the server.' };
    }
    if (!process.env.GOOGLE_DRIVE_FOLDER_ID) {
      return { status: 'not_configured', message: 'Google Drive folder ID not configured on the server.' };
    }

    // Check if refresh token exists in DB
    const settings = await CompanySettings.findOne({ isSingleton: true }).select('+googleRefreshToken');
    if (!settings?.googleRefreshToken) {
      return { status: 'not_configured', message: 'Google Drive not connected. Click "Connect Google Drive" to set up.' };
    }

    // Make a real API call to verify the token is still valid
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: settings.googleRefreshToken });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // A lightweight about.get call to verify auth without listing files
    await drive.about.get({ fields: 'user(displayName,emailAddress)' });

    return { status: 'connected', message: 'Google Drive is connected and authorized.' };
  } catch (error) {
    const code = error.code || error.response?.status || error.status;
    if (code === 401 || code === 400 || error.message?.includes('invalid_grant') || error.message?.includes('Token has been expired')) {
      return { status: 'auth_required', message: 'Google Drive authorization has expired or been revoked. Please reconnect.' };
    }
    return { status: 'auth_required', message: `Google Drive connection error: ${error.message}` };
  }
};

/**
 * Test Google Drive connection by listing files in the backup folder.
 * Returns file count and last backup info without exposing secrets.
 */
export const testDriveConnection = async () => {
  const drive = await getDriveService();
  const aboutRes = await drive.about.get({ fields: 'user(displayName,emailAddress),storageQuota' });

  const listRes = await drive.files.list({
    q: `'${process.env.GOOGLE_DRIVE_FOLDER_ID}' in parents and name contains 'khm-db-backup-' and trashed = false`,
    fields: 'files(id, name, createdTime, size)',
    orderBy: 'createdTime desc',
    pageSize: 5,
  });

  const files = listRes.data.files || [];
  return {
    success: true,
    driveUser: aboutRes.data.user?.emailAddress || 'Unknown',
    backupCount: files.length,
    lastBackup: files.length > 0 ? {
      name: files[0].name,
      createdAt: files[0].createdTime,
      sizeMB: files[0].size ? (Number(files[0].size) / (1024 * 1024)).toFixed(2) : '—',
    } : null,
  };
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

    // 6. Log success to Audit (SYSTEM actor when triggered by cron)
    await AuditLog.create({
      user: userId || null,
      action: 'BACKUP_COMPLETED',
      entity: 'System',
      summary: `${userId ? 'Manual' : 'Automated'} backup uploaded to Google Drive: ${fileName}`,
      metadata: { fileId: uploadRes.data.id, fileName, actor: userId ? 'USER' : 'SYSTEM' },
      ipAddress: '127.0.0.1'
    });

    return { success: true, fileId: uploadRes.data.id, fileName };
  } catch (error) {
    console.error('[Backup] Process failed:', error);
    
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }

    // Detect auth errors and provide a clear message
    const code = error.code || error.response?.status || error.status;
    const isAuthError = code === 401 || code === 400 || error.message?.includes('invalid_grant') || error.message?.includes('Token has been expired');

    const summary = isAuthError
      ? 'Backup failed: Google Drive authorization expired. Admin must reconnect Google Drive in Settings.'
      : `Automated backup failed: ${error.message}`;

    await AuditLog.create({
      action: 'BACKUP_FAILED',
      entity: 'System',
      user: null,
      summary,
      metadata: { error: error.message, isAuthError, actor: 'SYSTEM' },
      ipAddress: '127.0.0.1'
    }).catch(() => {});

    if (isAuthError) {
      const authErr = new Error('Google Drive authorization expired or revoked. Please reconnect Google Drive in Settings > System Backups.');
      authErr.isAuthError = true;
      throw authErr;
    }

    throw error;
  }
};

export const cleanupOldDriveBackups = async (drive) => {
  try {
    console.log(`[Backup] Checking for Google Drive backups older than ${RETENTION_DAYS} days...`);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
    const cutoffString = cutoffDate.toISOString();

    // Scoped to files this application owns: only our backup prefix, never
    // arbitrary user files in the folder.
    const q = `'${process.env.GOOGLE_DRIVE_FOLDER_ID}' in parents and name contains 'khm-db-backup-' and createdTime < '${cutoffString}' and trashed = false`;
    
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