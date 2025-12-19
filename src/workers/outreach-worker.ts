/**
 * Outreach Worker
 *
 * Cloud Run Job that processes outreach triggers from Pub/Sub.
 * Runs every 5 minutes via Cloud Scheduler.
 *
 * PERFORMANCE FIX: This worker runs separately from the voice agent,
 * eliminating the 3.7GB memory overhead and slow cold starts.
 *
 * Architecture:
 * ┌────────────────┐     ┌─────────────────┐     ┌──────────────────┐
 * │ Cloud Scheduler│────>│ Outreach Worker │────>│ Delivery Workers │
 * │  (5 min cron)  │     │ (Cloud Run Job) │     │ (SMS/Email/Push) │
 * └────────────────┘     └─────────────────┘     └──────────────────┘
 *                               │
 *                               ▼
 *                        ┌─────────────┐
 *                        │   Pub/Sub   │
 *                        │  (triggers) │
 *                        └─────────────┘
 *
 * @module workers/outreach-worker
 */

import { createLogger } from '../utils/safe-logger.js';
import { getPubSubClient, type PubSubMessage } from '../services/pubsub/pubsub-client.js';
import type { OutreachTriggerPayload } from '../services/outreach/trigger-publisher.js';

const log = createLogger({ module: 'OutreachWorker' });

// ============================================================================
// TYPES
// ============================================================================

export interface WorkerConfig {
  /** Max messages to process per run */
  maxMessages: number;
  /** Processing timeout per message (ms) */
  messageTimeoutMs: number;
  /** Enable dry-run mode (no actual delivery) */
  dryRun: boolean;
}

export interface ProcessingResult {
  processed: number;
  scheduled: number;
  skipped: number;
  failed: number;
  durationMs: number;
}

interface ScheduledDelivery {
  triggerId: string;
  userId: string;
  deliverAt: Date;
  channel: string;
  message: string;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: WorkerConfig = {
  maxMessages: 100,
  messageTimeoutMs: 30_000,
  dryRun: process.env.OUTREACH_DRY_RUN === 'true',
};

// ============================================================================
// DECISION ENGINE (SIMPLIFIED)
// ============================================================================

/**
 * Simplified decision result for worker processing
 */
interface WorkerDecision {
  shouldSend: boolean;
  reason?: string;
  channel?: string;
  optimalTime?: Date;
  message?: string;
}

/**
 * Evaluate whether a trigger should result in outreach
 * This is a simplified version using the decision engine
 */
async function evaluateTrigger(trigger: OutreachTriggerPayload): Promise<WorkerDecision> {
  try {
    const { getOutreachDecisionEngine } = await import('../services/outreach/decision-engine.js');
    const engine = getOutreachDecisionEngine();
    const now = new Date();

    // Get user state from engine
    const state = engine.getUserState(trigger.userId);

    // Check if outreach is enabled for user
    if (!state.outreachEnabled) {
      return {
        shouldSend: false,
        reason: 'Outreach disabled for user',
      };
    }

    // Check rate limits (using counters.outreachToday)
    if (state.counters.outreachToday >= state.preferences.maxPerDay) {
      return {
        shouldSend: false,
        reason: 'Daily limit reached',
      };
    }

    // Simple quiet hours check (avoid complex timing intelligence for now)
    const hour = now.getHours();
    const isQuietHours = hour < 8 || hour >= 22;
    if (isQuietHours) {
      return {
        shouldSend: false,
        reason: 'Quiet hours (8pm-8am)',
        optimalTime: trigger.scheduledFor ? new Date(trigger.scheduledFor) : undefined,
      };
    }

    // Default to sending
    return {
      shouldSend: true,
      channel: state.preferences.preferredChannel || 'sms',
      optimalTime: trigger.scheduledFor ? new Date(trigger.scheduledFor) : now,
      message: trigger.reason,
    };
  } catch (error) {
    log.warn({ triggerId: trigger.id, error: String(error) }, 'Decision evaluation failed');
    // Default to not sending on error
    return {
      shouldSend: false,
      reason: `Evaluation error: ${String(error)}`,
    };
  }
}

/**
 * Schedule delivery via Cloud Tasks (simplified for now)
 */
async function scheduleDelivery(delivery: ScheduledDelivery, dryRun: boolean): Promise<boolean> {
  if (dryRun) {
    log.info(
      { triggerId: delivery.triggerId, channel: delivery.channel, deliverAt: delivery.deliverAt },
      '[DRY RUN] Would schedule delivery'
    );
    return true;
  }

  // TODO: Implement Cloud Tasks scheduling
  // For now, we'll use the existing delivery infrastructure
  try {
    const { deliverOutreach } = await import('../services/outreach/delivery/index.js');

    // Check if delivery should happen now or be scheduled
    const now = new Date();
    const deliverAt = new Date(delivery.deliverAt);

    if (deliverAt <= now) {
      // Deliver immediately
      await deliverOutreach({
        userId: delivery.userId,
        channel: delivery.channel as 'sms' | 'email' | 'push' | 'call',
        message: delivery.message,
      });
      return true;
    }

    // For future deliveries, store in Firestore with scheduled time
    // The next worker run will pick them up when the time comes
    const { storeScheduledDelivery } =
      await import('../services/outreach/firestore-persistence.js');
    await storeScheduledDelivery(delivery);

    log.debug({ triggerId: delivery.triggerId, deliverAt }, 'Scheduled future delivery');
    return true;
  } catch (error) {
    log.error(
      { triggerId: delivery.triggerId, error: String(error) },
      'Failed to schedule delivery'
    );
    return false;
  }
}

/**
 * Update trigger status in Firestore
 */
async function updateTriggerStatus(
  triggerId: string,
  status: 'pending' | 'processing' | 'sent' | 'cancelled' | 'failed'
): Promise<void> {
  try {
    const { updateTriggerStatus: firestoreUpdate } =
      await import('../services/outreach/firestore-persistence.js');
    await firestoreUpdate(triggerId, status);
  } catch (error) {
    log.warn({ triggerId, status, error: String(error) }, 'Failed to update trigger status');
  }
}

// ============================================================================
// MAIN PROCESSOR
// ============================================================================

/**
 * Process pending outreach triggers from Pub/Sub
 */
export async function processPendingTriggers(
  config: Partial<WorkerConfig> = {}
): Promise<ProcessingResult> {
  const startTime = Date.now();
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const result: ProcessingResult = {
    processed: 0,
    scheduled: 0,
    skipped: 0,
    failed: 0,
    durationMs: 0,
  };

  log.info({ maxMessages: cfg.maxMessages, dryRun: cfg.dryRun }, 'Starting outreach worker run');

  try {
    const client = getPubSubClient();
    await client.initialize();

    if (!client.isEnabled()) {
      log.info('Pub/Sub disabled, processing locally queued triggers');
      // Fall back to Firestore-based queue
      return await processFirestoreQueue(cfg, result);
    }

    // Subscribe to process messages
    const processed = new Set<string>();

    await client.subscribe<OutreachTriggerPayload>(
      'outreach-triggers',
      'outreach-worker',
      async (msg, ack, nack) => {
        if (processed.size >= cfg.maxMessages) {
          // Don't process more than max
          nack();
          return;
        }

        const trigger = msg.data;
        processed.add(trigger.id);
        result.processed++;

        try {
          // 1. Evaluate trigger
          const decision = await evaluateTrigger(trigger);

          if (!decision.shouldSend) {
            log.debug(
              { triggerId: trigger.id, reason: decision.reason },
              'Trigger rejected by decision engine'
            );
            await updateTriggerStatus(trigger.id, 'cancelled');
            result.skipped++;
            ack();
            return;
          }

          // 2. Schedule delivery
          const deliveryScheduled = await scheduleDelivery(
            {
              triggerId: trigger.id,
              userId: trigger.userId,
              deliverAt: decision.optimalTime || new Date(),
              channel: decision.channel || 'sms',
              message: decision.message || trigger.reason,
            },
            cfg.dryRun
          );

          if (deliveryScheduled) {
            await updateTriggerStatus(trigger.id, 'sent');
            result.scheduled++;
            log.debug({ triggerId: trigger.id }, 'Trigger scheduled for delivery');
          } else {
            await updateTriggerStatus(trigger.id, 'failed');
            result.failed++;
          }

          ack();
        } catch (error) {
          log.error({ triggerId: trigger.id, error: String(error) }, 'Failed to process trigger');
          result.failed++;
          nack();
        }
      }
    );

    // Wait for processing to complete (with timeout)
    await new Promise((resolve) => setTimeout(resolve, Math.min(cfg.maxMessages * 500, 60_000)));

    // Unsubscribe after processing
    await client.unsubscribe('outreach-worker');
  } catch (error) {
    log.error({ error: String(error) }, 'Outreach worker failed');
    throw error;
  }

  result.durationMs = Date.now() - startTime;

  log.info(
    {
      processed: result.processed,
      scheduled: result.scheduled,
      skipped: result.skipped,
      failed: result.failed,
      durationMs: result.durationMs,
    },
    'Outreach worker run complete'
  );

  return result;
}

/**
 * Fallback: Process triggers from Firestore queue
 */
async function processFirestoreQueue(
  cfg: WorkerConfig,
  result: ProcessingResult
): Promise<ProcessingResult> {
  const startTime = Date.now();

  try {
    const { loadPendingTriggersWithLimit, updateTriggerStatus: updateStatus } =
      await import('../services/outreach/firestore-persistence.js');

    const triggerDocs = await loadPendingTriggersWithLimit(cfg.maxMessages);
    log.info({ count: triggerDocs.length }, 'Loaded triggers from Firestore queue');

    // Convert trigger documents to payload format
    const triggers = triggerDocs.map((doc) => ({
      id: doc.id,
      userId: doc.userId,
      type: doc.trigger.type,
      priority: doc.trigger.priority,
      reason: doc.trigger.reason,
      createdAt: doc.createdAt.toISOString(),
      scheduledFor: doc.scheduledFor?.toISOString(),
      context: {
        commitment: doc.trigger.commitment,
        milestone: doc.trigger.milestone,
      },
    }));

    for (const trigger of triggers) {
      result.processed++;

      try {
        const decision = await evaluateTrigger(trigger as OutreachTriggerPayload);

        if (!decision.shouldSend) {
          await updateStatus(trigger.id, 'cancelled');
          result.skipped++;
          continue;
        }

        const deliveryScheduled = await scheduleDelivery(
          {
            triggerId: trigger.id,
            userId: trigger.userId,
            deliverAt: decision.optimalTime || new Date(),
            channel: decision.channel || 'sms',
            message: decision.message || trigger.reason,
          },
          cfg.dryRun
        );

        if (deliveryScheduled) {
          await updateStatus(trigger.id, 'sent');
          result.scheduled++;
        } else {
          await updateStatus(trigger.id, 'failed');
          result.failed++;
        }
      } catch (error) {
        log.error({ triggerId: trigger.id, error: String(error) }, 'Failed to process trigger');
        result.failed++;
      }
    }
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to process Firestore queue');
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

export function getWorkerHealth(): { status: 'healthy' | 'unhealthy'; details: string } {
  return {
    status: 'healthy',
    details: 'Outreach worker ready',
  };
}

// ============================================================================
// MAIN ENTRY POINT (Cloud Run Job)
// ============================================================================

async function main(): Promise<void> {
  log.info('Outreach Worker starting...');

  try {
    const result = await processPendingTriggers({
      maxMessages: parseInt(process.env.OUTREACH_MAX_MESSAGES || '100', 10),
      dryRun: process.env.OUTREACH_DRY_RUN === 'true',
    });

    log.info({ result }, 'Outreach Worker completed');
    process.exit(result.failed > result.scheduled ? 1 : 0);
  } catch (error) {
    log.error({ error: String(error) }, 'Outreach Worker failed');
    process.exit(1);
  }
}

// Run if executed directly
if (process.argv[1]?.includes('outreach-worker')) {
  main();
}

export default {
  processPendingTriggers,
  getWorkerHealth,
};
