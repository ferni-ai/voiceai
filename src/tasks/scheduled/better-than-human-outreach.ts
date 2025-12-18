/**
 * Better Than Human Outreach Job
 *
 * Activates proactive outreach - the "thinking of you" moments.
 * This runs on a schedule to:
 * 1. Check for pending outreach moments
 * 2. Validate timing (quiet hours, rate limits)
 * 3. Execute delivery via appropriate channel
 *
 * This is what makes Ferni PROACTIVE, not just reactive.
 *
 * @module BetterThanHumanOutreach
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getDueItems,
  executeOutreach,
  canSendOutreach,
  processUserOutreach,
  type OutreachItem,
} from '../../services/trust-systems/outreach-integration.js';

import {
  generateThinkingOfYouMoments,
  getDueMoments,
  type ThinkingOfYouMoment,
} from '../../services/trust-systems/thinking-of-you.js';

// Store for active user IDs (in production, would come from Firestore)
let activeUserIds: string[] = [];

const log = createLogger({ module: 'BetterThanHumanOutreach' });

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface OutreachJobConfig {
  /** Cron schedule expression */
  schedule: string;
  /** Timezone for schedule */
  timezone: string;
  /** Maximum items to process per run */
  maxPerRun: number;
  /** Dry run mode (log but don't send) */
  dryRun: boolean;
}

const DEFAULT_CONFIG: OutreachJobConfig = {
  schedule: '0 * * * *', // Every hour
  timezone: 'America/Los_Angeles',
  maxPerRun: 50,
  dryRun: false,
};

// ============================================================================
// JOB STATE
// ============================================================================

interface JobStats {
  lastRunAt: Date | null;
  totalProcessed: number;
  totalSent: number;
  totalSkipped: number;
  totalFailed: number;
}

const stats: JobStats = {
  lastRunAt: null,
  totalProcessed: 0,
  totalSent: 0,
  totalSkipped: 0,
  totalFailed: 0,
};

// ============================================================================
// MAIN JOB FUNCTION
// ============================================================================

/**
 * Run the Better Than Human outreach job.
 *
 * This processes:
 * 1. Queued "thinking of you" moments
 * 2. Due follow-ups from significant shares
 * 3. Celebration deliveries
 * 4. Growth reflections
 */
export async function runBetterThanHumanOutreachJob(
  config: Partial<OutreachJobConfig> = {}
): Promise<JobResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();
  stats.lastRunAt = new Date();

  log.info(
    {
      maxPerRun: cfg.maxPerRun,
      dryRun: cfg.dryRun,
    },
    '🔔 Starting Better Than Human outreach job'
  );

  const result: JobResult = {
    processed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  try {
    // 1. Get all queued items across all users
    // In production, this would query Firestore for all users with pending outreach
    const queuedItems: OutreachItem[] = [];
    for (const userId of activeUserIds) {
      const userItems = getDueItems(userId);
      queuedItems.push(...userItems);
    }

    log.info({ queuedCount: queuedItems.length }, 'Found queued outreach items');

    // 2. Process items (respecting limits)
    const itemsToProcess = queuedItems.slice(0, cfg.maxPerRun);

    for (const item of itemsToProcess) {
      result.processed++;

      try {
        // Check if we can send to this user
        const { allowed, reason } = canSendOutreach(item.userId);

        if (!allowed) {
          log.debug(
            { userId: item.userId, reason },
            'Skipping outreach - rate limited or quiet hours'
          );
          result.skipped++;
          continue;
        }

        // Determine best channel
        const channel = await selectBestChannel(item);

        if (cfg.dryRun) {
          log.info(
            {
              userId: item.userId,
              type: item.type,
              channel,
              message: item.message.slice(0, 50) + '...',
            },
            '🔔 [DRY RUN] Would send outreach'
          );
          result.sent++;
          continue;
        }

        // Execute delivery
        const deliveryResult = await executeOutreach(item, channel);

        if (deliveryResult.success) {
          log.info(
            {
              userId: item.userId,
              type: item.type,
              channel,
              itemId: item.id,
            },
            '💌 Outreach delivered successfully'
          );
          result.sent++;
        } else {
          log.warn(
            {
              userId: item.userId,
              type: item.type,
              error: deliveryResult.error,
            },
            'Outreach delivery failed'
          );
          result.failed++;
          result.errors.push({
            userId: item.userId,
            itemId: item.id,
            error: deliveryResult.error || 'Unknown error',
          });
        }
      } catch (itemError) {
        log.error(
          {
            userId: item.userId,
            itemId: item.id,
            error: String(itemError),
          },
          'Error processing outreach item'
        );
        result.failed++;
        result.errors.push({
          userId: item.userId,
          itemId: item.id,
          error: String(itemError),
        });
      }
    }

    // 3. Update global stats
    stats.totalProcessed += result.processed;
    stats.totalSent += result.sent;
    stats.totalSkipped += result.skipped;
    stats.totalFailed += result.failed;

    const durationMs = Date.now() - startTime;

    log.info(
      {
        processed: result.processed,
        sent: result.sent,
        skipped: result.skipped,
        failed: result.failed,
        durationMs,
      },
      '✅ Better Than Human outreach job completed'
    );

    return result;
  } catch (error) {
    log.error({ error: String(error) }, 'Better Than Human outreach job failed');
    throw error;
  }
}

// ============================================================================
// CHANNEL SELECTION
// ============================================================================

/**
 * Select the best delivery channel for an outreach item.
 */
async function selectBestChannel(item: OutreachItem): Promise<'sms' | 'push' | 'voice'> {
  // High priority items prefer SMS (more likely to be seen)
  if (item.priority === 'high') {
    return 'sms';
  }

  // "Holding space" type (checking on hard dates) prefers SMS
  if (item.type === 'thinking_of_you') {
    return 'sms';
  }

  // Celebrations can be push notifications
  if (item.type === 'celebration') {
    return 'push';
  }

  // Growth reflections prefer push (less intrusive)
  if (item.type === 'growth_reflection') {
    return 'push';
  }

  // Default to push
  return 'push';
}

// ============================================================================
// TYPES
// ============================================================================

export interface JobResult {
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: Array<{ userId: string; itemId: string; error: string }>;
}

// ============================================================================
// STATS API
// ============================================================================

/**
 * Get current job statistics.
 */
export function getOutreachJobStats(): JobStats {
  return { ...stats };
}

/**
 * Reset job statistics.
 */
export function resetOutreachJobStats(): void {
  stats.lastRunAt = null;
  stats.totalProcessed = 0;
  stats.totalSent = 0;
  stats.totalSkipped = 0;
  stats.totalFailed = 0;
}

// ============================================================================
// MANUAL TRIGGER
// ============================================================================

/**
 * Manually trigger outreach for a specific user.
 * Useful for testing and debugging.
 */
export async function triggerOutreachForUser(
  userId: string,
  options: { dryRun?: boolean } = {}
): Promise<JobResult> {
  log.info({ userId, dryRun: options.dryRun }, 'Manually triggering outreach for user');

  // Generate any pending moments for this user
  const moments = await generateThinkingOfYouMoments(userId);

  if (moments.length === 0) {
    log.info({ userId }, 'No outreach moments generated for user');
    return { processed: 0, sent: 0, skipped: 0, failed: 0, errors: [] };
  }

  log.info({ userId, momentCount: moments.length }, 'Generated thinking-of-you moments');

  // Run job for just this user's items
  // This is a simplified version - in production would filter queue
  return runBetterThanHumanOutreachJob({ maxPerRun: 5, dryRun: options.dryRun });
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  runBetterThanHumanOutreachJob,
  getOutreachJobStats,
  resetOutreachJobStats,
  triggerOutreachForUser,
};

export const outreachJobConfig: OutreachJobConfig = DEFAULT_CONFIG;
