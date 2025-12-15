/**
 * Outreach Maintenance Service
 *
 * Handles periodic cleanup and reset tasks:
 * - Weekly counter resets
 * - Old data pruning
 * - Analytics aggregation
 * - Dead trigger cleanup
 */

import { getLogger } from '../../utils/safe-logger.js';
import { clearUserChannelData } from './channel-selector.js';
import { pruneOldData as pruneContextData } from './context-aggregator.js';
import { getOutreachDecisionEngine } from './decision-engine.js';
import { clearRelationshipData } from './relationship-adapter.js';
import { clearUserTimingData } from './timing-intelligence.js';

const log = getLogger().child({ module: 'outreach-maintenance' });

// ============================================================================
// TYPES
// ============================================================================

export interface MaintenanceConfig {
  /** How often to run weekly resets (default: every Sunday at 3 AM) */
  weeklyResetDay: number; // 0 = Sunday, 6 = Saturday
  weeklyResetHour: number; // 0-23

  /** How old data can be before pruning (days) */
  maxDataAgeDays: number;

  /** How long to keep outreach history (days) */
  maxHistoryAgeDays: number;

  /** Max pending triggers per user */
  maxPendingTriggersPerUser: number;
}

export interface MaintenanceStats {
  lastWeeklyReset?: Date;
  lastDataPrune?: Date;
  lastDeadTriggerCleanup?: Date;
  lastCalendarSync?: Date;
  triggersCleanedUp: number;
  dataEntriesPruned: number;
  usersReset: number;
  calendarsSynced: number;
}

// ============================================================================
// STATE
// ============================================================================

let maintenanceInterval: NodeJS.Timeout | null = null;
let config: MaintenanceConfig = {
  weeklyResetDay: 0, // Sunday
  weeklyResetHour: 3, // 3 AM
  maxDataAgeDays: 90,
  maxHistoryAgeDays: 30,
  maxPendingTriggersPerUser: 50,
};

const stats: MaintenanceStats = {
  triggersCleanedUp: 0,
  dataEntriesPruned: 0,
  usersReset: 0,
  calendarsSynced: 0,
};

// ============================================================================
// MAINTENANCE TASKS
// ============================================================================

/**
 * Reset weekly outreach counters for all users
 * This prevents rate limiting from becoming permanent
 */
export function resetWeeklyCounters(): void {
  const engine = getOutreachDecisionEngine();

  try {
    // Get all user states from the engine
    const userIds = engine.getAllUserIds();
    let resetCount = 0;

    for (const userId of userIds) {
      const state = engine.getUserState(userId);

      // Reset weekly counters
      engine.updateUserState(userId, {
        counters: {
          ...state.counters,
          outreachThisWeek: 0,
        },
      });

      resetCount++;
    }

    stats.lastWeeklyReset = new Date();
    stats.usersReset = resetCount;

    log.info({ usersReset: resetCount }, '✅ Weekly counters reset');
  } catch (error) {
    log.error({ error }, 'Failed to reset weekly counters');
  }
}

/**
 * Prune old data from all services
 */
export async function pruneOldData(): Promise<void> {
  let totalPruned = 0;

  try {
    // Prune context data (conversations, emotions, etc.)
    // The pruneContextData function handles all users internally
    totalPruned = pruneContextData(config.maxDataAgeDays);

    stats.lastDataPrune = new Date();
    stats.dataEntriesPruned = totalPruned;

    log.info(
      { entriesPruned: totalPruned, maxAgeDays: config.maxDataAgeDays },
      '✅ Old data pruned'
    );
  } catch (error) {
    log.error({ error }, 'Failed to prune old data');
  }
}

/**
 * Clean up dead/expired triggers
 */
export function cleanupDeadTriggers(): void {
  const engine = getOutreachDecisionEngine();
  const now = new Date();
  let cleanedUp = 0;

  try {
    const userIds = engine.getAllUserIds();

    for (const userId of userIds) {
      const pending = engine.getPendingTriggers(userId);

      // Find triggers that are too old or exceed max per user
      const toRemove: string[] = [];

      // Sort by creation date (oldest first)
      const sorted = [...pending].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      for (let i = 0; i < sorted.length; i++) {
        const trigger = sorted[i];
        const age = now.getTime() - new Date(trigger.createdAt).getTime();
        const ageDays = age / (1000 * 60 * 60 * 24);

        // Remove if too old
        if (ageDays > 7) {
          toRemove.push(trigger.id);
          continue;
        }

        // Remove if over limit (keep newest)
        if (i < sorted.length - config.maxPendingTriggersPerUser) {
          toRemove.push(trigger.id);
        }
      }

      for (const triggerId of toRemove) {
        engine.cancelTrigger(triggerId);
        cleanedUp++;
      }
    }

    stats.lastDeadTriggerCleanup = new Date();
    stats.triggersCleanedUp += cleanedUp;

    log.info({ triggersCleanedUp: cleanedUp }, '✅ Dead triggers cleaned up');
  } catch (error) {
    log.error({ error }, 'Failed to clean up dead triggers');
  }
}

/**
 * Prune old outreach history
 */
export function pruneOutreachHistory(): void {
  const engine = getOutreachDecisionEngine();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - config.maxHistoryAgeDays);

  try {
    const userIds = engine.getAllUserIds();

    for (const userId of userIds) {
      engine.pruneHistory(userId, cutoffDate);
    }

    log.info({ cutoffDate }, '✅ Outreach history pruned');
  } catch (error) {
    log.error({ error }, 'Failed to prune outreach history');
  }
}

/**
 * Sync calendars for all users with connected Google Calendar
 *
 * This fetches each user's calendar events and updates their timing
 * profile with busy periods, ensuring outreach avoids meeting times.
 */
export async function syncAllCalendars(): Promise<{
  synced: number;
  failed: number;
}> {
  let synced = 0;
  let failed = 0;

  try {
    // Dynamic import to avoid circular dependencies
    const { isCalendarConfigured, getAllCalendarUsers } =
      await import('../google-calendar-oauth.js');
    const { syncCalendarToOutreach } = await import('../calendar-busy-detection.js');

    // Get all users with connected calendars
    let userIds: string[];
    try {
      userIds = await getAllCalendarUsers();
    } catch {
      // Fallback: get user IDs from decision engine and check each
      const engine = getOutreachDecisionEngine();
      userIds = engine.getAllUserIds();
    }

    // Filter out test users to avoid spamming logs with expired token errors
    const realUserIds = userIds.filter(
      (id) => !id.startsWith('cal-test-') && !id.startsWith('test-')
    );
    const skipped = userIds.length - realUserIds.length;

    if (skipped > 0) {
      log.debug({ skipped }, '📅 Skipped test users for calendar sync');
    }

    log.info({ userCount: realUserIds.length }, '📅 Starting calendar sync for outreach');

    for (const userId of realUserIds) {
      try {
        // Check if user has calendar connected
        const connected = await isCalendarConfigured(userId);
        if (!connected) {
          continue;
        }

        // Sync their calendar to timing intelligence
        const result = await syncCalendarToOutreach(userId);
        synced++;

        log.debug(
          {
            userId,
            busyPeriodsAdded: result.busyPeriodsAdded,
            rulesAdded: result.rulesAdded,
          },
          '📅 Calendar synced for user'
        );
      } catch (error) {
        failed++;
        // Only log first few failures to avoid log spam
        if (failed <= 3) {
          log.warn({ error, userId }, 'Failed to sync calendar for user');
        }
      }
    }

    if (failed > 3) {
      log.warn({ totalFailed: failed }, '📅 Additional calendar sync failures suppressed');
    }

    stats.lastCalendarSync = new Date();
    stats.calendarsSynced = synced;

    log.info({ synced, failed }, '✅ Calendar sync completed');

    return { synced, failed };
  } catch (error) {
    log.error({ error }, 'Calendar sync failed');
    return { synced: 0, failed: 0 };
  }
}

/**
 * Full reset for a user (for GDPR deletion, etc.)
 */
export function resetUserData(userId: string): void {
  log.info({ userId }, 'Resetting all user outreach data');

  try {
    // Clear from all services
    clearUserTimingData(userId);
    clearUserChannelData(userId);
    clearRelationshipData(userId);

    const engine = getOutreachDecisionEngine();

    // Cancel all pending triggers
    const pending = engine.getPendingTriggers(userId);
    for (const trigger of pending) {
      engine.cancelTrigger(trigger.id);
    }

    // Clear user state
    engine.clearUserState(userId);

    log.info({ userId }, '✅ User data reset complete');
  } catch (error) {
    log.error({ error, userId }, 'Failed to reset user data');
    throw error;
  }
}

// ============================================================================
// SCHEDULER
// ============================================================================

/**
 * Check if it's time for weekly reset
 */
function isWeeklyResetTime(): boolean {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();

  return day === config.weeklyResetDay && hour === config.weeklyResetHour;
}

/**
 * Run all maintenance tasks
 */
async function runMaintenance(): Promise<void> {
  log.debug('Running outreach maintenance check');

  // Weekly reset (only on the right day/hour)
  if (isWeeklyResetTime()) {
    // Only reset once per day (check last reset)
    if (!stats.lastWeeklyReset || stats.lastWeeklyReset.getDate() !== new Date().getDate()) {
      resetWeeklyCounters();
    }
  }

  // Daily tasks
  cleanupDeadTriggers();
  pruneOutreachHistory();

  // Less frequent pruning (once per day max)
  const now = new Date();
  if (!stats.lastDataPrune || now.getTime() - stats.lastDataPrune.getTime() > 24 * 60 * 60 * 1000) {
    await pruneOldData();
  }

  // Hourly calendar sync - keeps timing intelligence updated with user calendars
  // This ensures we never reach out during meetings
  const hoursSinceCalendarSync = stats.lastCalendarSync
    ? (now.getTime() - stats.lastCalendarSync.getTime()) / (60 * 60 * 1000)
    : 999;

  if (hoursSinceCalendarSync >= 1) {
    await syncAllCalendars();
  }
}

/**
 * Start the maintenance scheduler
 */
export function startMaintenanceScheduler(intervalMs = 60 * 60 * 1000): void {
  if (maintenanceInterval) {
    log.warn('Maintenance scheduler already running');
    return;
  }

  // Run once on startup
  void runMaintenance();

  // Then schedule periodic runs
  maintenanceInterval = setInterval(() => {
    void runMaintenance();
  }, intervalMs);

  log.info({ intervalMs }, '🔧 Outreach maintenance scheduler started');
}

/**
 * Stop the maintenance scheduler
 */
export function stopMaintenanceScheduler(): void {
  if (maintenanceInterval) {
    clearInterval(maintenanceInterval);
    maintenanceInterval = null;
    log.info('🛑 Outreach maintenance scheduler stopped');
  }
}

/**
 * Update maintenance configuration
 */
export function updateMaintenanceConfig(updates: Partial<MaintenanceConfig>): void {
  config = { ...config, ...updates };
  log.info({ config }, 'Maintenance config updated');
}

/**
 * Get current maintenance stats
 */
export function getMaintenanceStats(): MaintenanceStats {
  return { ...stats };
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  resetWeeklyCounters,
  pruneOldData,
  cleanupDeadTriggers,
  pruneOutreachHistory,
  syncAllCalendars,
  resetUserData,
  startMaintenanceScheduler,
  stopMaintenanceScheduler,
  updateMaintenanceConfig,
  getMaintenanceStats,
};
