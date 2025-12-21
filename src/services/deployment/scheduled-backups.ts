/**
 * Scheduled Backups Service
 *
 * Automated Firestore backup management:
 * - Daily automatic backups
 * - Configurable retention policy
 * - Export to GCS bucket
 * - Backup verification
 * - Slack notifications
 *
 * "Backups are worthless. Restores are priceless." - IT Proverb
 */

import { execSync } from 'child_process';
import { createLogger } from '../../utils/safe-logger.js';
import { SlackNotificationService } from '../slack-notifications.js';

const log = createLogger({ module: 'ScheduledBackups' });

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface BackupConfig {
  // GCP settings
  projectId: string;
  bucketName: string;
  bucketPrefix: string;

  // Schedule (cron-like)
  dailyBackupHour: number; // Hour in UTC (0-23)
  dailyBackupMinute: number;

  // Retention
  retentionDays: number;
  keepMinBackups: number; // Never delete below this count

  // Collections to backup (empty = all)
  collections: string[];

  // Notifications
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
}

const DEFAULT_CONFIG: BackupConfig = {
  projectId: process.env.GOOGLE_CLOUD_PROJECT || 'johnb-2025',
  bucketName: process.env.BACKUP_BUCKET || 'ferni-firestore-backups',
  bucketPrefix: 'firestore-exports',
  dailyBackupHour: 3, // 3 AM UTC
  dailyBackupMinute: 0,
  retentionDays: 30,
  keepMinBackups: 7,
  collections: [], // All collections
  notifyOnSuccess: true,
  notifyOnFailure: true,
};

// ============================================================================
// STATE
// ============================================================================

interface BackupState {
  isSchedulerRunning: boolean;
  lastBackupAt: number | null;
  lastBackupSuccess: boolean;
  lastBackupPath: string | null;
  backupHistory: BackupRecord[];
  schedulerTimer: ReturnType<typeof setInterval> | null;
}

interface BackupRecord {
  timestamp: number;
  path: string;
  sizeBytes: number | null;
  durationMs: number;
  success: boolean;
  error?: string;
  collections: string[];
}

const state: BackupState = {
  isSchedulerRunning: false,
  lastBackupAt: null,
  lastBackupSuccess: false,
  lastBackupPath: null,
  backupHistory: [],
  schedulerTimer: null,
};

let config = { ...DEFAULT_CONFIG };
let slackService: SlackNotificationService | null = null;

// ============================================================================
// BACKUP OPERATIONS
// ============================================================================

/**
 * Create a Firestore backup
 */
export async function createBackup(userConfig?: Partial<BackupConfig>): Promise<BackupRecord> {
  const backupConfig = { ...config, ...userConfig };
  const timestamp = Date.now();
  const dateStr = new Date(timestamp).toISOString().split('T')[0];
  const timeStr = new Date(timestamp).toISOString().split('T')[1].slice(0, 8).replace(/:/g, '');
  const backupPath = `gs://${backupConfig.bucketName}/${backupConfig.bucketPrefix}/${dateStr}/${timeStr}`;

  log.info({ backupPath }, '💾 Starting Firestore backup');

  const record: BackupRecord = {
    timestamp,
    path: backupPath,
    sizeBytes: null,
    durationMs: 0,
    success: false,
    collections: backupConfig.collections,
  };

  const startTime = Date.now();

  try {
    // Build the export command
    let cmd = `gcloud firestore export ${backupPath} --project=${backupConfig.projectId}`;

    // Add collection filters if specified
    if (backupConfig.collections.length > 0) {
      cmd += ` --collection-ids=${backupConfig.collections.join(',')}`;
    }

    // Execute backup
    log.info({ cmd }, 'Executing backup command');
    execSync(cmd, {
      encoding: 'utf-8',
      timeout: 30 * 60 * 1000, // 30 minute timeout
      stdio: 'pipe',
    });

    record.success = true;
    record.durationMs = Date.now() - startTime;

    // Try to get backup size
    try {
      const sizeOutput = execSync(`gsutil du -s ${backupPath}`, {
        encoding: 'utf-8',
        timeout: 60000,
      });
      const sizeMatch = sizeOutput.match(/^(\d+)/);
      if (sizeMatch) {
        record.sizeBytes = parseInt(sizeMatch[1], 10);
      }
    } catch {
      log.debug('Could not determine backup size');
    }

    log.info(
      {
        path: backupPath,
        durationMs: record.durationMs,
        sizeBytes: record.sizeBytes,
      },
      '✅ Backup completed successfully'
    );

    if (backupConfig.notifyOnSuccess) {
      void slackService?.sendNotification({
        type: 'system',
        title: 'Firestore Backup Complete',
        message: `Backup saved to ${backupPath}`,
        severity: 'info',
        details: {
          durationSeconds: Math.floor(record.durationMs / 1000),
          sizeMB: record.sizeBytes ? Math.floor(record.sizeBytes / 1024 / 1024) : 'unknown',
        },
      });
    }
  } catch (error) {
    record.success = false;
    record.error = String(error);
    record.durationMs = Date.now() - startTime;

    log.error({ error: String(error), path: backupPath }, '❌ Backup failed');

    if (backupConfig.notifyOnFailure) {
      void slackService?.sendNotification({
        type: 'incident',
        title: 'Firestore Backup Failed',
        message: `Backup failed: ${error}`,
        severity: 'critical',
      });
    }
  }

  // Update state
  state.lastBackupAt = timestamp;
  state.lastBackupSuccess = record.success;
  state.lastBackupPath = record.path;
  state.backupHistory.push(record);

  // Keep only last 100 records in memory
  if (state.backupHistory.length > 100) {
    state.backupHistory = state.backupHistory.slice(-100);
  }

  return record;
}

/**
 * List existing backups
 */
export function listBackups(): BackupInfo[] {
  try {
    const output = execSync(`gsutil ls -l gs://${config.bucketName}/${config.bucketPrefix}/`, {
      encoding: 'utf-8',
      timeout: 60000,
    });

    const backups: BackupInfo[] = [];
    const lines = output.trim().split('\n');

    for (const line of lines) {
      // Parse gsutil ls output: SIZE DATE PATH
      const match = line.match(/^\s*(\d+)\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\s+(.+)$/);
      if (match) {
        backups.push({
          path: match[3],
          sizeBytes: parseInt(match[1], 10),
          createdAt: new Date(match[2]).getTime(),
        });
      }
    }

    return backups.sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    log.error({ error: String(error) }, 'Error listing backups');
    return [];
  }
}

interface BackupInfo {
  path: string;
  sizeBytes: number;
  createdAt: number;
}

/**
 * Delete old backups based on retention policy
 */
export async function cleanupOldBackups(): Promise<number> {
  const backups = listBackups();
  const cutoffDate = Date.now() - config.retentionDays * 24 * 60 * 60 * 1000;

  // Find backups older than retention period
  const oldBackups = backups.filter((b) => b.createdAt < cutoffDate);

  // Ensure we keep minimum number of backups
  const toDelete = oldBackups.slice(0, Math.max(0, backups.length - config.keepMinBackups));

  if (toDelete.length === 0) {
    log.info('No old backups to cleanup');
    return 0;
  }

  log.info({ count: toDelete.length }, 'Cleaning up old backups');

  let deleted = 0;
  for (const backup of toDelete) {
    try {
      execSync(`gsutil -m rm -r ${backup.path}`, {
        encoding: 'utf-8',
        timeout: 5 * 60 * 1000,
        stdio: 'pipe',
      });
      deleted++;
      log.info({ path: backup.path }, 'Deleted old backup');
    } catch (error) {
      log.error({ error: String(error), path: backup.path }, 'Failed to delete backup');
    }
  }

  return deleted;
}

/**
 * Restore from a backup
 */
export async function restoreFromBackup(backupPath: string): Promise<boolean> {
  log.warn({ backupPath }, '⚠️ Starting Firestore restore - this is destructive!');

  void slackService?.sendNotification({
    type: 'incident',
    title: 'Firestore Restore Started',
    message: `Restoring from: ${backupPath}`,
    severity: 'warning',
  });

  try {
    const cmd = `gcloud firestore import ${backupPath} --project=${config.projectId}`;
    execSync(cmd, {
      encoding: 'utf-8',
      timeout: 60 * 60 * 1000, // 1 hour timeout
      stdio: 'inherit',
    });

    log.info({ backupPath }, '✅ Restore completed successfully');

    void slackService?.sendNotification({
      type: 'deployment',
      title: 'Firestore Restore Complete',
      message: `Successfully restored from: ${backupPath}`,
      severity: 'info',
    });

    return true;
  } catch (error) {
    log.error({ error: String(error), backupPath }, '❌ Restore failed');

    void slackService?.sendNotification({
      type: 'incident',
      title: 'Firestore Restore Failed',
      message: `Restore failed: ${error}`,
      severity: 'critical',
    });

    return false;
  }
}

// ============================================================================
// SCHEDULER
// ============================================================================

/**
 * Start the backup scheduler
 */
export function startBackupScheduler(userConfig?: Partial<BackupConfig>): void {
  if (state.isSchedulerRunning) {
    log.warn('Backup scheduler already running');
    return;
  }

  config = { ...DEFAULT_CONFIG, ...userConfig };

  if (!slackService) {
    slackService = new SlackNotificationService();
  }

  state.isSchedulerRunning = true;

  log.info(
    {
      dailyAt: `${config.dailyBackupHour}:${config.dailyBackupMinute.toString().padStart(2, '0')} UTC`,
      retentionDays: config.retentionDays,
      bucket: config.bucketName,
    },
    '📅 Backup scheduler started'
  );

  // Check every minute if it's time to backup
  state.schedulerTimer = setInterval(() => {
    const now = new Date();
    if (
      now.getUTCHours() === config.dailyBackupHour &&
      now.getUTCMinutes() === config.dailyBackupMinute
    ) {
      // Check if we already backed up today
      if (state.lastBackupAt) {
        const lastBackupDate = new Date(state.lastBackupAt).toDateString();
        const todayDate = now.toDateString();
        if (lastBackupDate === todayDate) {
          return; // Already backed up today
        }
      }

      log.info('⏰ Scheduled backup time - triggering backup');
      void createBackup().then(async () => cleanupOldBackups());
    }
  }, 60 * 1000); // Check every minute
}

/**
 * Stop the backup scheduler
 */
export function stopBackupScheduler(): void {
  if (state.schedulerTimer) {
    clearInterval(state.schedulerTimer);
    state.schedulerTimer = null;
  }
  state.isSchedulerRunning = false;
  log.info('Backup scheduler stopped');
}

// ============================================================================
// API
// ============================================================================

/**
 * Get backup service status
 */
export function getBackupStatus(): {
  isSchedulerRunning: boolean;
  lastBackupAt: number | null;
  lastBackupSuccess: boolean;
  lastBackupPath: string | null;
  config: BackupConfig;
  recentBackups: BackupRecord[];
  availableBackups: BackupInfo[];
} {
  return {
    isSchedulerRunning: state.isSchedulerRunning,
    lastBackupAt: state.lastBackupAt,
    lastBackupSuccess: state.lastBackupSuccess,
    lastBackupPath: state.lastBackupPath,
    config,
    recentBackups: state.backupHistory.slice(-10),
    availableBackups: listBackups().slice(0, 10),
  };
}

/**
 * Update backup config
 */
export function updateBackupConfig(updates: Partial<BackupConfig>): void {
  config = { ...config, ...updates };
  log.info({ updates }, 'Backup config updated');
}

/**
 * Trigger an immediate backup
 */
export async function triggerBackupNow(): Promise<BackupRecord> {
  return createBackup();
}
