/**
 * Daily Outreach Job
 *
 * Scheduled job that runs daily to evaluate all users for proactive outreach.
 * Handles "Thinking of You" messages, commitment check-ins, and growth reflections.
 *
 * Recommended schedule: Run daily at 10am local time
 *
 * Usage:
 * ```typescript
 * // In a cron job or scheduled task
 * import { runDailyOutreachJob } from './daily-outreach-job.js';
 *
 * // Run the job
 * const results = await runDailyOutreachJob();
 * console.log('Outreach job completed:', results);
 * ```
 *
 * @module DailyOutreachJob
 */

import type { UserProfile } from '../../types/user-profile.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getOutreachDecisionEngine } from './decision-engine.js';
import { getOutreachOrchestrator } from './outreach-orchestrator.js';

const log = createLogger({ module: 'DailyOutreachJob' });

// ============================================================================
// TYPES
// ============================================================================

export interface DailyOutreachJobResult {
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  usersEvaluated: number;
  outreachSent: number;
  byType: Record<string, number>;
  errors: Array<{ userId: string; error: string }>;
}

export interface DailyOutreachJobConfig {
  /** Function to get all active user profiles */
  getUserProfiles: () => Promise<UserProfile[]>;

  /** Maximum users to process per run (for rate limiting) */
  maxUsersPerRun?: number;

  /** Delay between users in ms (for rate limiting) */
  delayBetweenUsersMs?: number;

  /** Whether to run in dry-run mode (no actual outreach sent) */
  dryRun?: boolean;
}

// ============================================================================
// JOB IMPLEMENTATION
// ============================================================================

/**
 * Run the daily outreach job
 */
export async function runDailyOutreachJob(
  config: DailyOutreachJobConfig
): Promise<DailyOutreachJobResult> {
  const startedAt = new Date();
  const errors: Array<{ userId: string; error: string }> = [];
  const byType: Record<string, number> = {};
  let outreachSent = 0;

  log.info('🌅 Starting daily outreach job', {
    dryRun: config.dryRun || false,
    maxUsers: config.maxUsersPerRun || 'unlimited',
  });

  try {
    // Get all user profiles
    const allProfiles = await config.getUserProfiles();
    const maxUsers = config.maxUsersPerRun || allProfiles.length;
    const profiles = allProfiles.slice(0, maxUsers);

    log.info(`Processing ${profiles.length} users`, {
      total: allProfiles.length,
      processing: profiles.length,
    });

    // Get orchestrator
    const orchestrator = getOutreachOrchestrator();

    // Process users in batches
    for (const profile of profiles) {
      try {
        if (!profile.id) {
          continue;
        }

        // Check if user has opted into proactive outreach (check customData for preference)
        if (profile.customData?.proactiveOutreachEnabled === false) {
          continue;
        }

        if (!config.dryRun) {
          // Evaluate for "Thinking of You"
          const toyOutreach = await orchestrator.evaluateThinkingOfYou(profile);
          if (toyOutreach) {
            outreachSent++;
            byType['thinking_of_you'] = (byType['thinking_of_you'] || 0) + 1;
          }

          // Evaluate for growth reflection (10% of users per day)
          if (Math.random() < 0.1) {
            const growthOutreach = await orchestrator.triggerGrowthReflection(profile.id, 'ferni');
            if (growthOutreach) {
              outreachSent++;
              byType['growth'] = (byType['growth'] || 0) + 1;
            }
          }
        }

        // Rate limiting delay
        if (config.delayBetweenUsersMs) {
          await sleep(config.delayBetweenUsersMs);
        }
      } catch (error) {
        errors.push({
          userId: profile.id || 'unknown',
          error: error instanceof Error ? error.message : String(error),
        });
        log.error({ userId: profile.id, error }, 'Error processing user');
      }
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    const result: DailyOutreachJobResult = {
      startedAt,
      completedAt,
      durationMs,
      usersEvaluated: profiles.length,
      outreachSent,
      byType,
      errors,
    };

    log.info('✅ Daily outreach job completed', {
      usersEvaluated: result.usersEvaluated,
      outreachSent: result.outreachSent,
      byType: result.byType,
      errors: result.errors.length,
      durationMs: result.durationMs,
    });

    return result;
  } catch (error) {
    log.error({ error }, '❌ Daily outreach job failed');
    throw error;
  }
}

/**
 * Reset weekly counters for all users
 * Should be called weekly (e.g., Sunday at midnight)
 */
export function resetWeeklyOutreachCounters(): void {
  const engine = getOutreachDecisionEngine();
  engine.resetWeeklyCounters();
  log.info('📊 Weekly outreach counters reset');
}

/**
 * Check pending triggers and process any that are due
 * Can be run more frequently than daily (e.g., hourly)
 */
export async function processScheduledTriggers(): Promise<{
  processed: number;
  sent: number;
}> {
  const engine = getOutreachDecisionEngine();
  const allUserIds = engine.getAllUserIds();

  let processed = 0;
  let sent = 0;

  for (const userId of allUserIds) {
    const triggers = engine.getPendingTriggers(userId);
    for (const trigger of triggers) {
      processed++;
      // The engine processes triggers automatically when added
      // We just need to check for scheduled ones
      if (trigger.suggestedTime && trigger.suggestedTime <= new Date()) {
        // Trigger is due - it will be processed by the engine's interval
        sent++;
      }
    }
  }

  log.debug('Scheduled triggers check', { processed, sent });

  return { processed, sent };
}

// ============================================================================
// HELPERS
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  runDailyOutreachJob,
  resetWeeklyOutreachCounters,
  processScheduledTriggers,
};



