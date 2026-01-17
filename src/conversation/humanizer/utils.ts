/**
 * Humanizer Utilities
 *
 * Shared utility functions for the humanizer modules.
 *
 * @module @ferni/conversation/humanizer/utils
 */

import type { RelationshipStage, BetterThanHumanStage, TimeOfDay } from './types.js';
import { COMFORT_LEVELS, RELATIONSHIP_STAGE_MAP } from './types.js';

// ============================================================================
// DETERMINISTIC PROBABILITY
// ============================================================================

/**
 * Create a deterministic trigger function for stable behavior.
 * Avoids Math.random() so the same session/turn behaves consistently.
 */
export function createDeterministicTrigger(
  sessionId: string,
  personaId: string
): (turnNumber: number, feature: string, probability: number) => boolean {
  return (turnNumber: number, feature: string, probability: number): boolean => {
    const p = Math.max(0, Math.min(1, probability));
    if (p === 0) return false;
    if (p === 1) return true;

    const key = `${sessionId}:${personaId}:${turnNumber}:${feature}`;
    // FNV-1a 32-bit hash
    let hash = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) {
      hash ^= key.charCodeAt(i);
      hash = (hash * 0x01000193) >>> 0;
    }
    const roll = hash / 0xffffffff;
    return roll < p;
  };
}

// ============================================================================
// RELATIONSHIP HELPERS
// ============================================================================

/**
 * Get comfort level from relationship stage
 */
export function getComfortLevel(stage?: RelationshipStage): number {
  return COMFORT_LEVELS[stage || 'acquaintance'] || 0.45;
}

/**
 * Map relationship stage to Better Than Human format
 */
export function mapRelationshipStage(stage?: RelationshipStage): BetterThanHumanStage {
  return RELATIONSHIP_STAGE_MAP[stage || 'acquaintance'] || 'getting_to_know';
}

// ============================================================================
// TIME HELPERS
// ============================================================================

/**
 * Get time of day category
 */
export function getTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

// ============================================================================
// TEXT PROCESSING
// ============================================================================

/**
 * Strip SSML tags from text
 */
export function stripSsml(text: string): string {
  const withoutTags = text.replace(/<[^>]+>/g, '');
  return withoutTags.replace(/\s+/g, ' ').trim();
}

/**
 * Apply SSML enhancements based on emotional guidance
 */
export function applySsmlEnhancements(
  text: string,
  guidance: { suggestedEmotion?: string; warmthLevel?: string; pauseFrequency?: string } | null
): string {
  if (!guidance) return text;

  let ssml = text;

  // Add opening break
  ssml = `<break time="100ms"/>${ssml}`;

  // Add emotion if specified
  if (guidance.suggestedEmotion && guidance.suggestedEmotion !== 'neutral') {
    ssml = `<emotion value="${guidance.suggestedEmotion}"/>${ssml}`;
  }

  // Add volume adjustment for support
  if (guidance.warmthLevel === 'high') {
    // Cartesia uses ratio (0.5-2.0), not level
    ssml = `<volume ratio="0.75"/>${ssml}`;
  }

  // Add breaks for pause frequency
  if (guidance.pauseFrequency === 'more') {
    // Add breaks after sentences
    ssml = ssml.replace(/\.(\s)/g, '.<break time="200ms"/>$1');
  }

  return ssml;
}

/**
 * Check if uncertainty should be added to response
 */
export function shouldAddUncertainty(
  text: string,
  context: { turnNumber: number; userMessage?: string },
  shouldTrigger: (turnNumber: number, feature: string, probability: number) => boolean
): boolean {
  // Don't add uncertainty to questions
  if (text.trim().endsWith('?')) return false;

  // Don't add to very short responses
  if (text.length < 30) return false;

  // Add more uncertainty early in conversation
  if (context.turnNumber < 3) {
    return shouldTrigger(context.turnNumber, 'uncertainty_early', 0.3);
  }

  // Add uncertainty when giving advice
  const advicePatterns = /you should|you need to|you have to|try to|consider/i;
  if (advicePatterns.test(text)) {
    return shouldTrigger(context.turnNumber, 'uncertainty_advice', 0.25);
  }

  // Add uncertainty when making predictions
  const predictionPatterns = /will probably|likely|might|could be/i;
  if (predictionPatterns.test(text)) {
    return shouldTrigger(context.turnNumber, 'uncertainty_prediction', 0.2);
  }

  return shouldTrigger(context.turnNumber, 'uncertainty_default', 0.1);
}
