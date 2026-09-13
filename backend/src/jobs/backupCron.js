import cron from 'node-cron';
import { runDatabaseBackup, isBackupConfigured } from '../services/backupService.js';

export const initBackupCron = () => {
  cron.schedule('00 22 * * *', async () => {
    console.log('[Cron] Checking Google Drive backup configuration...');

    try {
      const configured = await isBackupConfigured();

      if (!configured) {
        console.warn(
          '[Cron] Scheduled backup skipped: Google Drive OAuth is not configured.'
        );
        return;
      }

      console.log('[Cron] Initiating scheduled database backup...');
      await runDatabaseBackup();

    } catch (error) {
      if (error.isAuthError) {
        console.error('[Cron] ⚠️  BACKUP FAILED — Google Drive authorization expired or revoked.');
        console.error('[Cron] ⚠️  An Admin must reconnect Google Drive in Settings > System Backups.');
      } else {
        console.error('[Cron] Scheduled backup failed:', error);
      }
    }
  },
    {
      timezone: 'Asia/Kolkata'
    }
  );

  console.log(
    '[Cron] Database backup schedule initialized (Daily at 10:00 PM).'
  );
};
