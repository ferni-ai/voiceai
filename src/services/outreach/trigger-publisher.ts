/**
 * Outreach Trigger Publisher
 *
 * PERFORMANCE FIX: Decouples trigger creation from voice agent.
 * Instead of loading 300k+ triggers into voice agent memory,
 * triggers are published to Pub/Sub for async processing by a worker.
 *
 * Architecture:
 * ┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐
 * │ Voice Agent │────>│   Pub/Sub   │────>│  Outreach Worker    │
 * │  (Producer) │     │   Topic     │     │ (Cloud Run Job)     │
 * └─────────────┘     └─────────────┘     └─────────────────────┘
 *
 * Benefits:
 * - Voice agent cold starts are instant (no trigger loading)
 * - Memory usage drops from 3.7GB to ~500MB
 * - Outreach failures don't affect voice functionality
 * - Triggers processed at scale by dedicated workers
 *
 * @module services/outreach/trigger-publisher
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getPubSubClient, type PublishResult } from '../pubsub/pubsub-client.js';
import type { OutreachPriority, OutreachTriggerType } from './decision-engine.js';

const log = createLogger({ module: 'OutreachTriggerPublisher' });

// ============================================================================
// TYPES
// ============================================================================

export interface OutreachTriggerPayload {
  /** Unique trigger ID */
  id: string;
  /** User who will receive outreach */
  userId: string;
  /** Type of trigger */
  type: OutreachTriggerType;
  /** Priority level */
  priority: OutreachPriority;
  /** Human-readable reason for outreach */
  reason: string;
  /** When trigger was created */
  createdAt: string;
  /** When outreach should happen (ISO string) */
  scheduledFor?: string;
  /** Associated session ID */
  sessionId?: string;
  /** Persona that detected the trigger */
  personaId?: string;
  /** Additional context */
  context?: {
    /** Original commitment text */
    commitment?: string;
    /** Detected emotion */
    emotion?: string;
    /** Emotion intensity 0-1 */
    emotionIntensity?: number;
    /** Topics discussed */
    topics?: string[];
    /** Milestone achieved */
    milestone?: string;
    /** Number of sessions */
    sessionCount?: number;
    /** Days since last interaction */
    daysSinceLastInteraction?: number;
    /** Any additional metadata */
    metadata?: Record<string, unknown>;
  };
}

export interface TriggerPublishResult {
  /** Whether publish was successful */
  success: boolean;
  /** Trigger ID */
  triggerId: string;
  /** Pub/Sub message ID (if published) */
  messageId?: string;
  /** Error message (if failed) */
  error?: string;
}

// ============================================================================
// TRIGGER ID GENERATION
// ============================================================================

let triggerSequence = 0;

function generateTriggerId(): string {
  const timestamp = Date.now().toString(36);
  const seq = (triggerSequence++ % 1000).toString(36).padStart(2, '0');
  const random = Math.random().toString(36).slice(2, 6);
  return `trigger-${timestamp}-${seq}-${random}`;
}

// ============================================================================
// PUBLISHER
// ============================================================================

/**
 * Publish an outreach trigger to Pub/Sub for async processing
 *
 * This is the main entry point for creating outreach triggers.
 * The trigger will be processed by the Outreach Worker (Cloud Run Job).
 *
 * @example
 * ```typescript
 * import { publishOutreachTrigger } from './trigger-publisher';
 *
 * // User made a commitment
 * await publishOutreachTrigger({
 *   userId: 'user-123',
 *   type: 'commitment_check',
 *   priority: 'medium',
 *   reason: 'User committed to working out tomorrow morning',
 *   context: {
 *     commitment: 'morning workout',
 *   },
 * });
 * ```
 */
export async function publishOutreachTrigger(
  trigger: Omit<OutreachTriggerPayload, 'id' | 'createdAt'>
): Promise<TriggerPublishResult> {
  const triggerId = generateTriggerId();
  const now = new Date().toISOString();

  const fullTrigger: OutreachTriggerPayload = {
    ...trigger,
    id: triggerId,
    createdAt: now,
  };

  try {
    const client = getPubSubClient();
    const result = await client.publish<OutreachTriggerPayload>('outreach-triggers', {
      type: `outreach:${trigger.type}`,
      data: fullTrigger,
      attributes: {
        userId: trigger.userId,
        triggerType: trigger.type,
        priority: trigger.priority,
        ...(trigger.personaId && { personaId: trigger.personaId }),
      },
    });

    if (result) {
      log.debug(
        {
          triggerId,
          type: trigger.type,
          userId: trigger.userId,
          messageId: result.messageId,
        },
        'Outreach trigger published to Pub/Sub'
      );

      return {
        success: true,
        triggerId,
        messageId: result.messageId,
      };
    }

    // Local fallback (Pub/Sub disabled)
    log.debug(
      { triggerId, type: trigger.type },
      'Outreach trigger queued locally (Pub/Sub disabled)'
    );

    return {
      success: true,
      triggerId,
    };
  } catch (error) {
    log.error(
      { triggerId, type: trigger.type, error: String(error) },
      'Failed to publish outreach trigger'
    );

    return {
      success: false,
      triggerId,
      error: String(error),
    };
  }
}

/**
 * Publish a commitment check trigger
 */
export async function publishCommitmentTrigger(
  userId: string,
  commitment: string,
  scheduledFor: Date,
  options?: {
    sessionId?: string;
    personaId?: string;
    priority?: OutreachPriority;
  }
): Promise<TriggerPublishResult> {
  return publishOutreachTrigger({
    userId,
    type: 'commitment_check',
    priority: options?.priority ?? 'medium',
    reason: `Check in on commitment: ${commitment}`,
    scheduledFor: scheduledFor.toISOString(),
    sessionId: options?.sessionId,
    personaId: options?.personaId,
    context: {
      commitment,
    },
  });
}

/**
 * Publish an emotional support trigger
 */
export async function publishEmotionalSupportTrigger(
  userId: string,
  emotion: string,
  intensity: number,
  options?: {
    sessionId?: string;
    personaId?: string;
    topics?: string[];
  }
): Promise<TriggerPublishResult> {
  return publishOutreachTrigger({
    userId,
    type: 'emotional_support',
    priority: intensity > 0.7 ? 'high' : 'medium',
    reason: `Follow up on ${emotion} conversation`,
    sessionId: options?.sessionId,
    personaId: options?.personaId,
    context: {
      emotion,
      emotionIntensity: intensity,
      topics: options?.topics,
    },
  });
}

/**
 * Publish a milestone celebration trigger
 */
export async function publishMilestoneTrigger(
  userId: string,
  milestone: string,
  options?: {
    sessionId?: string;
    personaId?: string;
    sessionCount?: number;
  }
): Promise<TriggerPublishResult> {
  return publishOutreachTrigger({
    userId,
    type: 'celebration', // Using 'celebration' as per OutreachTriggerType
    priority: 'medium',
    reason: `Celebrate milestone: ${milestone}`,
    sessionId: options?.sessionId,
    personaId: options?.personaId,
    context: {
      milestone,
      sessionCount: options?.sessionCount,
    },
  });
}

/**
 * Publish a check-in trigger (user hasn't been seen in a while)
 */
export async function publishCheckInTrigger(
  userId: string,
  daysSinceLastInteraction: number,
  options?: {
    personaId?: string;
  }
): Promise<TriggerPublishResult> {
  const priority: OutreachPriority =
    daysSinceLastInteraction > 14 ? 'high' : daysSinceLastInteraction > 7 ? 'medium' : 'low';

  return publishOutreachTrigger({
    userId,
    type: 'reengagement', // Using 'reengagement' as per OutreachTriggerType
    priority,
    reason: `Check in after ${daysSinceLastInteraction} days`,
    personaId: options?.personaId,
    context: {
      daysSinceLastInteraction,
    },
  });
}

/**
 * Publish a thinking-of-you trigger (random kindness)
 */
export async function publishThinkingOfYouTrigger(
  userId: string,
  reason: string,
  options?: {
    personaId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<TriggerPublishResult> {
  return publishOutreachTrigger({
    userId,
    type: 'thinking_of_you',
    priority: 'low',
    reason,
    personaId: options?.personaId,
    context: {
      metadata: options?.metadata,
    },
  });
}

// ============================================================================
// BATCH PUBLISHING
// ============================================================================

/**
 * Publish multiple triggers in parallel
 */
export async function publishOutreachTriggerBatch(
  triggers: Array<Omit<OutreachTriggerPayload, 'id' | 'createdAt'>>
): Promise<TriggerPublishResult[]> {
  const results = await Promise.all(triggers.map((trigger) => publishOutreachTrigger(trigger)));

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  log.info({ total: triggers.length, succeeded, failed }, 'Batch trigger publish complete');

  return results;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { generateTriggerId };
