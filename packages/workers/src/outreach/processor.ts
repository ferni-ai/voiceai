/**
 * Outreach Trigger Processor
 *
 * Processes outreach triggers from Firestore:
 * 1. Loads trigger and user context
 * 2. Makes delivery decision
 * 3. Schedules delivery via Cloud Tasks (or immediate)
 * 4. Updates trigger status
 */

import type { Firestore } from '@google-cloud/firestore';
import { createLogger } from '../logger.js';
import type {
  OutreachTrigger,
  ProcessResult,
  UserContext,
  WorkerConfig,
} from '../types.js';
import { isTestUser } from '../types.js';
import { makeDeliveryDecision } from './decision-engine.js';

const log = createLogger('outreach-processor');

// ============================================================================
// Context Loading
// ============================================================================

async function loadUserContext(db: Firestore, userId: string): Promise<UserContext> {
  try {
    const userDoc = await db.collection('bogle_users').doc(userId).get();
    const userData = userDoc.data() || {};

    // Load recent outreach count (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentOutreach = await db
      .collection('outreach_history')
      .doc(userId)
      .collection('records')
      .where('deliveredAt', '>=', oneDayAgo)
      .count()
      .get();

    return {
      userId,
      emotionalState: userData.emotionalState || 'stable',
      lastSessionAt: userData.lastSessionAt?.toDate?.(),
      preferredTimes: userData.outreachPreferences?.preferredTimes,
      responseRateByChannel: userData.outreachPreferences?.responseRates || {},
      recentOutreachCount: recentOutreach.data().count,
      timezone: userData.timezone,
    };
  } catch (error) {
    log.warn({ error, userId }, 'Error loading user context, using defaults');
    return {
      userId,
      emotionalState: 'stable',
      responseRateByChannel: {},
      recentOutreachCount: 0,
    };
  }
}

// ============================================================================
// Trigger Processing
// ============================================================================

export async function processTrigger(
  config: WorkerConfig,
  triggerId: string
): Promise<ProcessResult> {
  const { db, dryRun } = config;

  try {
    // Load trigger
    const triggerRef = db.collection('outreach_triggers').doc(triggerId);
    const triggerDoc = await triggerRef.get();

    if (!triggerDoc.exists) {
      return {
        triggerId,
        success: false,
        error: 'Trigger not found',
      };
    }

    const triggerData = triggerDoc.data()!;
    const trigger: OutreachTrigger = {
      id: triggerId,
      userId: triggerData.userId,
      type: triggerData.trigger?.type || 'gentle_nudge',
      priority: triggerData.trigger?.priority || 'medium',
      reason: triggerData.trigger?.reason || '',
      commitment: triggerData.trigger?.commitment,
      milestone: triggerData.trigger?.milestone,
      suggestedTime: triggerData.trigger?.suggestedTime?.toDate?.(),
      createdAt: triggerData.createdAt?.toDate?.() || new Date(),
      status: triggerData.status,
    };

    // Skip test users
    if (isTestUser(trigger.userId)) {
      log.debug({ triggerId, userId: trigger.userId }, 'Skipping test user');

      if (!dryRun) {
        await triggerRef.update({
          status: 'cancelled',
          processedAt: new Date(),
          cancelReason: 'Test user filtered',
        });
      }

      return {
        triggerId,
        success: true,
        decision: {
          shouldDeliver: false,
          channel: 'none',
          delayMinutes: 0,
          reason: 'Test user filtered',
        },
      };
    }

    // Skip if already processed
    if (trigger.status !== 'pending') {
      return {
        triggerId,
        success: true,
        decision: {
          shouldDeliver: false,
          channel: 'none',
          delayMinutes: 0,
          reason: `Already ${trigger.status}`,
        },
      };
    }

    // Load user context
    const context = await loadUserContext(db, trigger.userId);

    // Make delivery decision
    const decision = makeDeliveryDecision(trigger, context);

    log.info(
      {
        triggerId,
        userId: trigger.userId,
        type: trigger.type,
        decision: decision.shouldDeliver ? decision.channel : 'skip',
        delay: decision.delayMinutes,
      },
      'Trigger processed'
    );

    if (dryRun) {
      log.info({ triggerId, decision }, '[DRY RUN] Would process trigger');
      return { triggerId, success: true, decision };
    }

    // Update trigger status
    if (decision.shouldDeliver) {
      await triggerRef.update({
        status: 'processing',
        processedAt: new Date(),
        decision: {
          channel: decision.channel,
          delayMinutes: decision.delayMinutes,
          reason: decision.reason,
        },
      });

      // TODO: Schedule delivery via Cloud Tasks
      // For now, just mark as "processing" - delivery worker will pick it up
    } else {
      await triggerRef.update({
        status: 'cancelled',
        processedAt: new Date(),
        cancelReason: decision.reason,
      });
    }

    return { triggerId, success: true, decision };
  } catch (error) {
    log.error({ error, triggerId }, 'Error processing trigger');
    return {
      triggerId,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// Batch Processing
// ============================================================================

export async function processPendingTriggers(
  config: WorkerConfig,
  limit: number = 100
): Promise<{ processed: number; failed: number }> {
  const { db } = config;

  log.info({ limit }, 'Processing pending triggers');

  const pendingSnapshot = await db
    .collection('outreach_triggers')
    .where('status', '==', 'pending')
    .orderBy('createdAt', 'asc')
    .limit(limit)
    .get();

  let processed = 0;
  let failed = 0;

  for (const doc of pendingSnapshot.docs) {
    const result = await processTrigger(config, doc.id);
    if (result.success) {
      processed++;
    } else {
      failed++;
    }
  }

  log.info({ processed, failed }, 'Batch processing complete');
  return { processed, failed };
}
