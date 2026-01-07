/**
 * Relationship Arc Integration
 *
 * Integrates the "Better Than Human" relationship arc system with the turn processor.
 * Detects and records key moments during conversations for relationship progression.
 *
 * Key Moments:
 * - vulnerability: User shares something personal/difficult
 * - breakthrough: User has a realization or "aha" moment
 * - celebration: User shares good news or achievements
 * - commitment: User makes a decision or commitment
 * - concern: User expresses worry or fear
 *
 * @module agents/integrations/relationship-arc-integration
 */

import { createLogger } from '../../utils/safe-logger.js';
import { detectReflectionMoment } from '../../intelligence/cross-session-reflection.js';
import { recordKeyMoment } from '../../intelligence/context-builders/relationship/arc/storage.js';
import type { KeyMoment } from '../../intelligence/context-builders/relationship/arc/types.js';

const log = createLogger({ module: 'relationship-arc-integration' });

// ============================================================================
// KEY MOMENT DETECTION
// ============================================================================

interface KeyMomentInput {
  userId: string;
  sessionId: string;
  personaId: string;
  message: string;
  topic: string;
  emotion: string;
  emotionIntensity: number;
}

/**
 * Map reflection moment type to relationship arc key moment type
 */
function mapToKeyMomentType(reflectionType: string): KeyMoment['type'] | null {
  const mapping: Record<string, KeyMoment['type']> = {
    vulnerability_shared: 'vulnerability',
    breakthrough_moment: 'breakthrough',
    goal_commitment: 'breakthrough', // Commitment is a type of breakthrough
    fear_expressed: 'vulnerability', // Sharing fear is vulnerability
    joy_shared: 'celebration',
    difficult_admission: 'vulnerability',
  };
  return mapping[reflectionType] || null;
}

/**
 * Detect and record key moments during a conversation turn
 *
 * This is a fire-and-forget function that detects if the user's message
 * contains a key moment (vulnerability, breakthrough, celebration, etc.)
 * and records it to the relationship arc system.
 *
 * @param input - Turn context for moment detection
 */
export async function detectAndRecordKeyMoment(input: KeyMomentInput): Promise<void> {
  const { userId, sessionId, personaId, message, topic, emotion, emotionIntensity } = input;

  try {
    // Use existing reflection moment detection
    const reflectionMoment = detectReflectionMoment(
      message,
      topic,
      emotion,
      emotionIntensity,
      sessionId,
      personaId
    );

    if (!reflectionMoment) {
      // No key moment detected - this is normal for most turns
      return;
    }

    // Map to relationship arc key moment type
    const keyMomentType = mapToKeyMomentType(reflectionMoment.type);
    if (!keyMomentType) {
      log.debug({ type: reflectionMoment.type }, 'Unmapped reflection type');
      return;
    }

    // Create summary from the reflection seed
    const summary = reflectionMoment.reflectionSeed || `${keyMomentType} about ${topic}`;

    // Extract a quote if the message is short enough
    const quote = message.length <= 200 ? message : undefined;

    // Record the key moment
    const momentId = await recordKeyMoment(userId, {
      type: keyMomentType,
      summary,
      quote,
      timestamp: Date.now(),
      sessionId,
      personaId,
    });

    log.info({ userId, momentId, type: keyMomentType, topic }, '💫 Key moment recorded');
  } catch (error) {
    // Fire-and-forget - don't let this break the turn
    log.debug({ error: String(error), userId }, 'Key moment detection failed (non-critical)');
  }
}

// ============================================================================
// FIRST-WORDS CALLBACK TRACKING
// ============================================================================

/**
 * Mark that we've made a first-words callback
 *
 * Call this when the agent references the user's first words.
 * This is tracked to ensure we don't repeat the callback.
 */
export async function markFirstWordsCallbackUsed(userId: string): Promise<void> {
  try {
    const { markFirstWordsCallbackMade } =
      await import('../../intelligence/context-builders/relationship/arc/storage.js');
    await markFirstWordsCallbackMade(userId);
    log.info({ userId }, '📝 First-words callback marked as used');
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to mark callback (non-critical)');
  }
}

/**
 * Check if we can make a first-words callback
 *
 * Returns true if:
 * - We have first meeting data
 * - We haven't already made the callback
 * - We're past session 2 (enough rapport)
 */
export async function canMakeFirstWordsCallback(userId: string): Promise<{
  canCallback: boolean;
  firstWords?: string;
}> {
  try {
    const { loadRelationshipArcData, canMakeFirstWordsCallback: checkCallback } =
      await import('../../intelligence/context-builders/relationship/arc/storage.js');

    const arcData = await loadRelationshipArcData(userId);
    if (!arcData) {
      return { canCallback: false };
    }

    const canCallback = checkCallback(arcData);
    return {
      canCallback,
      firstWords: canCallback ? arcData.firstMeeting?.firstWords : undefined,
    };
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Callback check failed');
    return { canCallback: false };
  }
}
