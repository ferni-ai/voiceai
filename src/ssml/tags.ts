/**
 * SSML Tag Helpers
 *
 * Helper functions for generating SSML tags.
 */

import { CARTESIA_EMOTIONS, type CartesiaEmotion } from './types.js';

// =============================================================================
// TAG GENERATION HELPERS
// =============================================================================

/**
 * Clamp speed to valid range (0.6 - 1.5)
 */
export function clampSpeed(speed: number): number {
  return Math.max(0.6, Math.min(1.5, speed));
}

/**
 * Clamp volume to valid range (0.5 - 2.0)
 */
export function clampVolume(volume: number): number {
  return Math.max(0.5, Math.min(2.0, volume));
}

/**
 * Generate speed tag
 */
export function speedTag(ratio: number): string {
  const clamped = clampSpeed(ratio);
  return `<speed ratio="${clamped.toFixed(2)}"/>`;
}

/**
 * Generate volume tag
 */
export function volumeTag(ratio: number): string {
  const clamped = clampVolume(ratio);
  return `<volume ratio="${clamped.toFixed(1)}"/>`;
}

/**
 * Generate break tag
 */
export function breakTag(time: string): string {
  // Validate time format (e.g., "500ms", "1s", "1.5s")
  if (!/^\d+(\.\d+)?(ms|s)$/.test(time)) {
    return `<break time="500ms"/>`;
  }
  return `<break time="${time}"/>`;
}

/**
 * Generate emotion tag (only for Cartesia-supported emotions)
 */
export function emotionTag(emotion: string): string {
  const validEmotions = [
    CARTESIA_EMOTIONS.ANGRY,
    CARTESIA_EMOTIONS.SAD,
    CARTESIA_EMOTIONS.SURPRISED,
    CARTESIA_EMOTIONS.CURIOUS,
    CARTESIA_EMOTIONS.AFFECTIONATE,
  ];

  if (validEmotions.includes(emotion as (typeof validEmotions)[number])) {
    return `<emotion value="${emotion}"/>`;
  }
  return '';
}

/**
 * Generate spell tag for acronyms/letters
 */
export function spellTag(text: string): string {
  // Only wrap if it looks like something to spell out
  if (/^[A-Z0-9]{2,10}$/.test(text)) {
    return `<spell>${text}</spell>`;
  }
  return text;
}

// =============================================================================
// EMOTION MAPPING
// =============================================================================

/**
 * Map detected emotions to Cartesia-supported emotions
 */
export function mapToCartesiaEmotion(detected: string): CartesiaEmotion {
  const mapping: Record<string, CartesiaEmotion> = {
    // Direct mappings
    angry: CARTESIA_EMOTIONS.ANGRY,
    sad: CARTESIA_EMOTIONS.SAD,
    surprised: CARTESIA_EMOTIONS.SURPRISED,
    curious: CARTESIA_EMOTIONS.CURIOUS,
    affectionate: CARTESIA_EMOTIONS.AFFECTIONATE,

    // Extended mappings
    frustrated: CARTESIA_EMOTIONS.ANGRY,
    disappointed: CARTESIA_EMOTIONS.SAD,
    shocked: CARTESIA_EMOTIONS.SURPRISED,
    interested: CARTESIA_EMOTIONS.CURIOUS,
    loving: CARTESIA_EMOTIONS.AFFECTIONATE,
    caring: CARTESIA_EMOTIONS.AFFECTIONATE,
    warm: CARTESIA_EMOTIONS.AFFECTIONATE,
    excited: CARTESIA_EMOTIONS.SURPRISED,
    enthusiastic: CARTESIA_EMOTIONS.SURPRISED,
    worried: CARTESIA_EMOTIONS.SAD,
    anxious: CARTESIA_EMOTIONS.SAD,
    happy: CARTESIA_EMOTIONS.AFFECTIONATE,
    joyful: CARTESIA_EMOTIONS.AFFECTIONATE,
    grateful: CARTESIA_EMOTIONS.AFFECTIONATE,

    // Neutral states (no emotion tag)
    neutral: CARTESIA_EMOTIONS.NEUTRAL,
    calm: CARTESIA_EMOTIONS.CALM,
    thoughtful: CARTESIA_EMOTIONS.THOUGHTFUL,
    confident: CARTESIA_EMOTIONS.CONFIDENT,
  };

  return mapping[detected.toLowerCase()] || CARTESIA_EMOTIONS.NEUTRAL;
}

/**
 * Get contextual emotion based on text content and base emotion
 */
export function getContextualEmotion(text: string, baseEmotion: string): CartesiaEmotion {
  const lowerText = text.toLowerCase();

  // Check for emotional context clues
  if (/\b(unfortunately|sadly|regret|sorry to|i'm afraid)\b/i.test(lowerText)) {
    return CARTESIA_EMOTIONS.SAD;
  }

  if (/\b(great news|wonderful|fantastic|exciting|thrilled)\b/i.test(lowerText)) {
    return CARTESIA_EMOTIONS.SURPRISED;
  }

  if (/\b(hmm|interesting|tell me more|i wonder|what if)\b/i.test(lowerText)) {
    return CARTESIA_EMOTIONS.CURIOUS;
  }

  if (/\b(i understand|i hear you|that's tough|i'm here|you're not alone)\b/i.test(lowerText)) {
    return CARTESIA_EMOTIONS.AFFECTIONATE;
  }

  if (/\b(annoying|frustrating|ridiculous|unacceptable)\b/i.test(lowerText)) {
    return CARTESIA_EMOTIONS.ANGRY;
  }

  // Fall back to mapped base emotion
  return mapToCartesiaEmotion(baseEmotion);
}
