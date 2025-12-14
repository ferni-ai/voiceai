/**
 * SSML Module - Single Source of Truth
 *
 * This module provides all SSML (Speech Synthesis Markup Language) functionality
 * for the Ferni voice AI platform.
 *
 * This is the CANONICAL source for all SSML functionality.
 * Other modules should import from here:
 *
 * ```typescript
 * import {
 *   tagTextWithSsmlPersonaAware,
 *   sanitizeSsml,
 *   detectEmotion,
 *   CARTESIA_EMOTIONS,
 * } from '../ssml/index.js';
 * ```
 *
 * @module ssml
 */

// =============================================================================
// TYPES - All SSML-related type definitions
// =============================================================================

export type {
  BreathGroupConfig,
  CartesiaEmotion,
  DetectedPacing,
  DetectedVocalCues,
  DetectedVolume,
  FillerConfig,
  PronunciationEntry,
  SanitizationResult,
  SsmlTagOptions,
  TTSCheckResult,
  TaggingContext,
  ThinkingContext,
  ThinkingInjection,
} from './types.js';

export {
  ALL_CARTESIA_EMOTIONS,
  CARTESIA_EMOTIONS,
  CARTESIA_SUPPORTED_EMOTIONS,
  isCartesiaSupportedEmotion,
} from './types.js';

// =============================================================================
// CONSTANTS - All SSML-related constants
// =============================================================================

export {
  ACRONYM_PATTERN,
  BREATH_POINTS,
  CONTEMPLATIVE_PAUSE_PHRASES,
  CONTRASTIVE_PATTERNS,
  DISFLUENCY_PATTERNS,
  // Emotion keywords
  EMOTION_KEYWORDS,
  // Volume/emphasis keywords
  EMPHASIS_KEYWORDS,
  FAST_PACE_KEYWORDS,
  FINANCIAL_END,
  // Financial pronunciations
  FINANCIAL_PRONUNCIATIONS,
  FINANCIAL_START,
  LAUGHTER_INVITATIONS,
  // Vocal cue patterns
  LAUGHTER_PATTERNS,
  LIST_PATTERNS,
  NUMBER_PATTERNS,
  PARENTHETICAL_PATTERNS,
  REFLECTION_PHRASES,
  REPETITION_PATTERNS,
  SARCASTIC_PATTERNS,
  SIGH_PATTERNS,
  // Pacing keywords
  SLOW_PACE_KEYWORDS,
  // Stage direction removal
  STAGE_DIRECTION_KEYWORDS,
  // Speech flow patterns
  THINKING_SOUNDS,
  TRANSITION_PHRASES,
  WHISPER_KEYWORDS,
} from './constants.js';

// =============================================================================
// TAG HELPERS - Functions for generating SSML tags
// =============================================================================

export {
  breakTag,
  clampSpeed,
  clampVolume,
  detectEmotionFromKeywords,
  emotionTag,
  getContextualEmotion,
  mapToCartesiaEmotion,
  speedTag,
  spellTag,
  volumeTag,
} from './tags.js';

// =============================================================================
// DETECTION - Functions for detecting emotion, pacing, volume, and vocal cues
// =============================================================================

export { detectEmotion, detectPacing, detectVocalCues, detectVolume } from './detection.js';

// =============================================================================
// CORE FUNCTIONALITY - Main SSML processing functions
// =============================================================================

export {
  hasSsmlTags,
  sanitizeSsml,
  stripSsmlTags,
  // Alias for backwards compatibility
  tagTextWithSsmlPersonaAware as tagTextWithSsml,
  tagTextWithSsmlPersonaAware,
} from './core.js';

// =============================================================================
// CARTESIA HELPERS - Cartesia-specific utilities
// =============================================================================

export {
  breakTag as cartesiaBreakTag,
  emotionTag as cartesiaEmotionTag,
  speedTag as cartesiaSpeedTag,
  spellTag as cartesiaSpellTag,
  volumeTag as cartesiaVolumeTag,
  clampSpeed as clampCartesiaSpeed,
  clampVolume as clampCartesiaVolume,
} from './cartesia.js';

// =============================================================================
// RE-EXPORT THINKING TIME TYPES
// =============================================================================

export type {
  ThinkingContext as ThinkingTimeContext,
  ThinkingInjection as ThinkingTimeInjection,
} from '../conversation/thinking-time-injector.js';

// =============================================================================
// REGEX CACHE - For performance optimization
// =============================================================================

const regexCacheMap = new Map<string, RegExp>();

/**
 * Regex cache for performance optimization
 * Avoids recreating the same regex patterns repeatedly
 */
export const regexCache = {
  /**
   * Get a cached regex or create and cache a new one
   */
  get(pattern: string, flags?: string): RegExp {
    const key = `${pattern}:${flags || ''}`;
    let cached = regexCacheMap.get(key);
    if (!cached) {
      cached = new RegExp(pattern, flags);
      regexCacheMap.set(key, cached);
    }
    return cached;
  },

  /**
   * Clear the regex cache (useful for testing)
   */
  clear(): void {
    regexCacheMap.clear();
  },

  /**
   * Get the current cache size
   */
  get size(): number {
    return regexCacheMap.size;
  },
};
