/**
 * Voice Agent Trust Recording Handler
 *
 * Records data to trust systems for "better than human" features.
 * Called after each user turn is processed to:
 * - Record emotional snapshots to sentiment timeline
 * - Detect and save life events mentioned in conversation
 * - Record learning style signals
 * - Record topic data for insights
 *
 * Extracted from voice-agent.ts to reduce file size and improve maintainability.
 *
 * @module voice-agent/trust-recording-handler
 */

import { log } from '@livekit/agents';

// Trust systems imports
import {
  recordEmotionalSnapshot,
  detectLifeEvents,
  saveEvent,
  recordLearningSignals,
  recordTopicData,
  recordEmotionData,
} from '../../services/trust-systems/index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface TrustRecordingContext {
  /** User identifier */
  userId: string;
  /** User's message text */
  userText: string;
  /** Turn processing result with emotional data */
  result: TurnResult;
}

export interface TurnResult {
  emotional: {
    primary?: string;
    intensity?: number;
  };
  context: {
    humanizingResult?: {
      mood?: {
        state?: string;
      };
    };
  };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Record data to trust systems for "better than human" features.
 * Called after each user turn is processed.
 *
 * Records:
 * - Phase 17: Emotional snapshots to sentiment timeline
 * - Phase 14: Life events detected in conversation
 * - Phase 27: Learning style signals
 * - Phase 28: Topic data and emotion data for insights
 */
export async function recordTrustSystemsData(ctx: TrustRecordingContext): Promise<void> {
  const { userId, userText, result } = ctx;
  const logger = log();

  try {
    // Phase 17: Record emotional snapshot to sentiment timeline
    if (result.emotional?.primary) {
      recordEmotionalSnapshot(userId, {
        primaryEmotion: result.emotional.primary as
          | 'joy'
          | 'sadness'
          | 'anxiety'
          | 'anger'
          | 'fear'
          | 'surprise'
          | 'disgust'
          | 'trust'
          | 'anticipation'
          | 'neutral',
        secondaryEmotions: [],
        intensity: result.emotional.intensity || 0.5,
        source: 'detected',
      });
    }

    // Phase 14: Detect life events mentioned in conversation
    const lifeEvents = detectLifeEvents(userId, userText);
    for (const detection of lifeEvents) {
      if (detection.detected && detection.event && detection.confidence > 0.6) {
        saveEvent({
          ...detection.event,
          userId,
          id: detection.event.id || `event-${Date.now()}`,
          date: detection.event.date || new Date(),
          type: detection.event.type || 'event',
          importance: detection.event.importance || 'medium',
          followUp: detection.event.followUp || { beforeReminder: true, afterCheckIn: true },
          tags: detection.event.tags || [],
          context: detection.event.context || {
            mentionedAt: new Date(),
            originalText: userText,
          },
        } as Parameters<typeof saveEvent>[0]);
        logger.debug({ event: detection.event }, 'Life event detected and saved');
      }
    }

    // Phase 27: Record learning style signals
    recordLearningSignals(userId, userText);

    // Phase 28: Record topic data for insights
    const topic = result.context?.humanizingResult?.mood?.state;
    if (topic) {
      const sentiment =
        result.emotional?.primary === 'joy' || result.emotional?.primary === 'trust'
          ? 'positive'
          : result.emotional?.primary === 'sadness' ||
              result.emotional?.primary === 'anger' ||
              result.emotional?.primary === 'fear'
            ? 'negative'
            : 'neutral';
      recordTopicData(userId, topic, sentiment);
    }

    // Phase 28: Record emotion data for insights
    if (result.emotional?.primary) {
      recordEmotionData(userId, {
        date: new Date(),
        emotion: result.emotional.primary,
        intensity: result.emotional.intensity || 0.5,
      });
    }

    logger.debug({ userId }, 'Trust systems data recorded');
  } catch (error) {
    // Non-fatal - don't break conversation for trust recording errors
    logger.warn({ error: String(error) }, 'Trust systems recording failed (non-fatal)');
  }
}

export default recordTrustSystemsData;
