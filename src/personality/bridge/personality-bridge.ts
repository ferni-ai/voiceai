/**
 * Personality Bridge
 *
 * Unifies the two parallel personality systems:
 * 1. RelationshipEngine (intelligence/relationship/) - tracks shared moments, milestones, inside jokes
 * 2. PersonalityService v2 (personality/v2/) - tracks vulnerability, patterns, growth, anticipation
 *
 * This bridge ensures both systems receive data and dispatches frontend signals
 * for "Better Than Human" emotional intelligence.
 *
 * @module personality/bridge/personality-bridge
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { SharedMomentType } from '../../intelligence/relationship/types.js';
import type { VoiceFeatures } from '../domain/interfaces/voice-analyzer.js';
import type { PersonalityDomainEvent } from '../domain/model/personality-profile.js';
import {
  type SendDataMessageFn,
  dispatchVulnerabilitySignal,
  dispatchGrowthCelebrationSignal,
  dispatchPatternSurfacingSignal,
  dispatchEmotionalBondSignal,
} from './signal-dispatchers.js';

const log = createLogger({ module: 'PersonalityBridge' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Input for recording a unified moment
 */
export interface RecordUnifiedMomentInput {
  /** User ID */
  userId: string;
  /** Persona ID (e.g., 'ferni', 'maya') */
  personaId: string;
  /** Type of shared moment */
  type: SharedMomentType;
  /** User's message or context */
  message: string;
  /** Detected topics */
  topics?: string[];
  /** Voice features for multimodal analysis */
  voiceFeatures?: VoiceFeatures;
  /** Emotional intensity (0-1) */
  emotionalIntensity?: number;
  /** Function to send data messages to frontend */
  sendDataMessage?: SendDataMessageFn;
  /** Additional moment details */
  details?: {
    userPhrase?: string;
    significance?: number;
    topic?: string;
  };
}

/**
 * Result from recording a unified moment
 */
export interface RecordUnifiedMomentResult {
  /** Whether the recording succeeded */
  success: boolean;
  /** Whether vulnerability was detected */
  vulnerabilityDetected: boolean;
  /** Whether this was a first-time vulnerability */
  isFirstTimeVulnerability: boolean;
  /** Number of domain events dispatched */
  eventsDispatched: number;
}

// ============================================================================
// MAIN BRIDGE FUNCTION
// ============================================================================

/**
 * Record a unified moment across both personality systems
 *
 * This function:
 * 1. Records to RelationshipEngine (shared moments, trust, milestones)
 * 2. Records to PersonalityService v2 (vulnerability, patterns, growth)
 * 3. Dispatches humanization signals to frontend based on domain events
 *
 * @example
 * ```typescript
 * await recordUnifiedMoment({
 *   userId: 'user_123',
 *   personaId: 'ferni',
 *   type: 'breakthrough',
 *   message: 'I finally realized why I was so stressed...',
 *   emotionalIntensity: 0.8,
 *   sendDataMessage: services.sendDataMessage,
 * });
 * ```
 */
export async function recordUnifiedMoment(
  input: RecordUnifiedMomentInput
): Promise<RecordUnifiedMomentResult> {
  const result: RecordUnifiedMomentResult = {
    success: false,
    vulnerabilityDetected: false,
    isFirstTimeVulnerability: false,
    eventsDispatched: 0,
  };

  const { userId, personaId, type, message, topics, voiceFeatures, emotionalIntensity, sendDataMessage, details } =
    input;

  if (!userId || !personaId) {
    log.warn('Missing userId or personaId, skipping unified moment recording');
    return result;
  }

  // Track promises for parallel execution
  const promises: Promise<void>[] = [];

  // ============================================================================
  // 1. RECORD TO RELATIONSHIP ENGINE
  // ============================================================================

  promises.push(
    (async () => {
      try {
        const { getRelationshipEngine } = await import('../../intelligence/relationship/index.js');
        const engine = getRelationshipEngine(userId, personaId);

        if (engine) {
          engine.recordMoment(type, message.slice(0, 200), {
            userPhrase: details?.userPhrase ?? message.slice(0, 200),
            significance: details?.significance ?? emotionalIntensity ?? 0.5,
            topic: details?.topic ?? topics?.[0],
          });

          log.debug({ type, userId: userId.slice(0, 8) }, 'Recorded moment to RelationshipEngine');
        }
      } catch (error) {
        log.warn({ error: String(error) }, 'Failed to record to RelationshipEngine');
      }
    })()
  );

  // ============================================================================
  // 2. RECORD TO PERSONALITY SERVICE V2
  // ============================================================================

  promises.push(
    (async () => {
      try {
        const { createPersonalityService } = await import('../v2/index.js');
        const service = createPersonalityService();

        const recordResult = await service.recordMoment({
          userId,
          personaId,
          message,
          topics,
          voiceFeatures,
        });

        result.vulnerabilityDetected = recordResult.vulnerabilityDetected;
        result.isFirstTimeVulnerability = recordResult.isFirstTimeVulnerability;

        // ============================================================================
        // 3. PROCESS DOMAIN EVENTS AND DISPATCH SIGNALS
        // ============================================================================

        if (sendDataMessage && recordResult.domainEvents.length > 0) {
          await processDomainEvents(recordResult.domainEvents, sendDataMessage);
          result.eventsDispatched = recordResult.domainEvents.length;
        }

        log.debug(
          {
            userId: userId.slice(0, 8),
            vulnerabilityDetected: result.vulnerabilityDetected,
            eventsCount: recordResult.domainEvents.length,
          },
          'Recorded moment to PersonalityService v2'
        );
      } catch (error) {
        log.warn({ error: String(error) }, 'Failed to record to PersonalityService v2');
      }
    })()
  );

  // ============================================================================
  // 4. DISPATCH EMOTIONAL BOND SIGNAL FOR SIGNIFICANT MOMENTS
  // ============================================================================

  if (sendDataMessage && (emotionalIntensity ?? 0) > 0.7) {
    promises.push(
      dispatchEmotionalBondSignal(sendDataMessage, `${type}: ${message.slice(0, 50)}`, emotionalIntensity ?? 0.7)
    );
  }

  // Wait for all operations
  await Promise.allSettled(promises);
  result.success = true;

  return result;
}

// ============================================================================
// DOMAIN EVENT PROCESSING
// ============================================================================

/**
 * Process domain events from PersonalityProfile and dispatch frontend signals
 *
 * Domain events are emitted by the v2 system when significant things happen:
 * - vulnerability_recorded: User shared something vulnerable
 * - first_time_vulnerability: First time sharing this type of vulnerability
 * - pattern_detected: A new emotional pattern was detected
 * - growth_milestone_ready: User is ready to celebrate growth
 */
async function processDomainEvents(
  events: PersonalityDomainEvent[],
  sendDataMessage: SendDataMessageFn
): Promise<void> {
  for (const event of events) {
    try {
      switch (event.type) {
        case 'vulnerability_recorded':
          await dispatchVulnerabilitySignal(sendDataMessage, event.deposit, false);
          break;

        case 'first_time_vulnerability':
          await dispatchVulnerabilitySignal(sendDataMessage, event.deposit, true);
          break;

        case 'pattern_detected':
          // Only surface patterns that are ready
          if (event.pattern.isReadyToSurface) {
            await dispatchPatternSurfacingSignal(sendDataMessage, event.pattern);
          }
          break;

        case 'growth_milestone_ready':
          // Only celebrate milestones that are ready
          if (event.milestone.isReadyToCelebrate) {
            await dispatchGrowthCelebrationSignal(sendDataMessage, event.milestone);
          }
          break;

        case 'trust_declined':
          // Log but don't dispatch - this is tracked internally
          log.info(
            {
              previousStage: event.previousStage,
              newStage: event.newStage,
            },
            '📉 Trust declined event detected'
          );
          break;

        default:
          log.debug({ eventType: (event as { type: string }).type }, 'Unhandled domain event');
      }
    } catch (error) {
      log.warn({ error: String(error), eventType: event.type }, 'Failed to process domain event');
    }
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Record a breakthrough moment (user had a realization)
 */
export async function recordBreakthrough(
  userId: string,
  personaId: string,
  message: string,
  sendDataMessage?: SendDataMessageFn
): Promise<void> {
  await recordUnifiedMoment({
    userId,
    personaId,
    type: 'breakthrough',
    message,
    emotionalIntensity: 0.8,
    sendDataMessage,
  });
}

/**
 * Record a vulnerability moment (user opened up)
 */
export async function recordVulnerability(
  userId: string,
  personaId: string,
  message: string,
  sendDataMessage?: SendDataMessageFn
): Promise<void> {
  await recordUnifiedMoment({
    userId,
    personaId,
    type: 'vulnerability',
    message,
    emotionalIntensity: 0.85,
    sendDataMessage,
  });
}

/**
 * Record a celebration moment (user shared a win)
 */
export async function recordCelebration(
  userId: string,
  personaId: string,
  message: string,
  sendDataMessage?: SendDataMessageFn
): Promise<void> {
  await recordUnifiedMoment({
    userId,
    personaId,
    type: 'celebration',
    message,
    emotionalIntensity: 0.8,
    sendDataMessage,
  });
}

/**
 * Record a crisis support moment
 */
export async function recordCrisisSupport(
  userId: string,
  personaId: string,
  message: string,
  sendDataMessage?: SendDataMessageFn
): Promise<void> {
  await recordUnifiedMoment({
    userId,
    personaId,
    type: 'crisis_support',
    message,
    emotionalIntensity: 0.9,
    sendDataMessage,
  });
}

/**
 * Record a shared laughter moment
 */
export async function recordLaughter(
  userId: string,
  personaId: string,
  message: string,
  sendDataMessage?: SendDataMessageFn
): Promise<void> {
  await recordUnifiedMoment({
    userId,
    personaId,
    type: 'laughter',
    message,
    emotionalIntensity: 0.6,
    sendDataMessage,
  });
}

/**
 * Record a deep conversation moment
 */
export async function recordDeepConversation(
  userId: string,
  personaId: string,
  message: string,
  sendDataMessage?: SendDataMessageFn
): Promise<void> {
  await recordUnifiedMoment({
    userId,
    personaId,
    type: 'deep_conversation',
    message,
    emotionalIntensity: 0.75,
    sendDataMessage,
  });
}

// All functions are exported inline via `export async function`
// Types are exported inline via `export interface`
