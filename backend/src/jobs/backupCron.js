import cron from 'node-cron';
import { runDatabaseBackup, isBackupConfigured } from '../services/backupService.js';

export const initBackupCron = () => {
  cron.schedule('0 22 * * *', async () => {
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
      console.error('[Cron] Scheduled backup failed:', error);
    }
  });

  console.log(
    '[Cron] Database backup schedule initialized (Daily at 10:00 PM).'
  );
};
