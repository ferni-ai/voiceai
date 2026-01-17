/**
 * SSML Constants - Central Export Point
 *
 * This module consolidates all constants used by the SSML system.
 * Import from here rather than individual files:
 *
 *   import { FINANCIAL_PRONUNCIATIONS, EMOTION_KEYWORDS } from './constants/index.js';
 *
 * @module ssml/constants
 */

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------
export type { PronunciationEntry } from './types.js';

// -------------------------------------------------------------------------
// Unicode Markers
// -------------------------------------------------------------------------
export { FINANCIAL_START, FINANCIAL_END } from './markers.js';

// -------------------------------------------------------------------------
// Pronunciation Dictionaries
// -------------------------------------------------------------------------
export { FINANCIAL_PRONUNCIATIONS } from './financial.js';
export { PERSONA_PRONUNCIATIONS } from './personas.js';
export { MENTAL_HEALTH_PRONUNCIATIONS } from './mental-health.js';
export { WELLNESS_PRONUNCIATIONS } from './wellness.js';
export { CALENDAR_PRONUNCIATIONS } from './calendar.js';
export { COMMON_ABBREVIATIONS } from './common-abbreviations.js';
export { TECH_PRONUNCIATIONS } from './tech.js';
export { GEOGRAPHIC_PRONUNCIATIONS, NATIVE_AMERICAN_PRONUNCIATIONS } from './geographic.js';
export {
  JAPANESE_PRONUNCIATIONS,
  ZEN_BUDDHIST_PRONUNCIATIONS,
  MINDFULNESS_PRONUNCIATIONS,
  THOUGHT_LEADER_PRONUNCIATIONS,
  MISPRONOUNCED_WORDS,
} from './cultural.js';

// -------------------------------------------------------------------------
// Emotion Detection
// -------------------------------------------------------------------------
export { EMOTION_KEYWORDS, DEFAULT_EMOTION, INTENSITY_MODIFIERS } from './emotions.js';

// -------------------------------------------------------------------------
// Pacing & Volume
// -------------------------------------------------------------------------
export {
  SLOW_PACE_KEYWORDS,
  FAST_PACE_KEYWORDS,
  EMPHASIS_KEYWORDS,
  WHISPER_KEYWORDS,
  DEFAULT_SPEED,
  SPEED_ADJUSTMENTS,
  DEFAULT_VOLUME,
  VOLUME_ADJUSTMENTS,
} from './pacing.js';

// -------------------------------------------------------------------------
// Vocal Patterns
// -------------------------------------------------------------------------
export {
  LAUGHTER_PATTERNS,
  SIGH_PATTERNS,
  DISFLUENCY_PATTERNS,
  REPETITION_PATTERNS,
  SARCASTIC_PATTERNS,
  THINKING_PATTERNS,
  REFLECTION_PHRASES,
  CONTEMPLATIVE_PATTERNS,
  TRANSITION_PATTERNS,
  BREATH_POINT_PATTERNS,
  CONTRASTIVE_PATTERNS,
  PARENTHETICAL_PATTERNS,
  LIST_PATTERNS,
  ACRONYM_PATTERNS,
  NUMBER_PATTERNS,
} from './vocal-patterns.js';

// -------------------------------------------------------------------------
// Stage Direction Sanitization
// -------------------------------------------------------------------------
export {
  STAGE_DIRECTION_KEYWORDS,
  STAGE_DIRECTION_PATTERNS,
  LAUGHTER_CONVERSION_KEYWORDS,
  UNSUPPORTED_NONVERBALS,
} from './stage-directions.js';

// -------------------------------------------------------------------------
// Consolidated Pronunciation Dictionary
// -------------------------------------------------------------------------
import type { PronunciationEntry } from './types.js';
import { FINANCIAL_PRONUNCIATIONS } from './financial.js';
import { PERSONA_PRONUNCIATIONS } from './personas.js';
import { MENTAL_HEALTH_PRONUNCIATIONS } from './mental-health.js';
import { WELLNESS_PRONUNCIATIONS } from './wellness.js';
import { CALENDAR_PRONUNCIATIONS } from './calendar.js';
import { COMMON_ABBREVIATIONS } from './common-abbreviations.js';
import { TECH_PRONUNCIATIONS } from './tech.js';
import { GEOGRAPHIC_PRONUNCIATIONS, NATIVE_AMERICAN_PRONUNCIATIONS } from './geographic.js';
import {
  JAPANESE_PRONUNCIATIONS,
  ZEN_BUDDHIST_PRONUNCIATIONS,
  MINDFULNESS_PRONUNCIATIONS,
  THOUGHT_LEADER_PRONUNCIATIONS,
  MISPRONOUNCED_WORDS,
} from './cultural.js';

/**
 * ALL_PRONUNCIATIONS - Combined pronunciation dictionary
 *
 * This is the complete dictionary used by the pronunciation processor.
 * Order matters: more specific patterns should come before general ones.
 */
export const ALL_PRONUNCIATIONS: PronunciationEntry[] = [
  // Persona names first (always correct)
  ...PERSONA_PRONUNCIATIONS,

  // Domain-specific (high priority)
  ...FINANCIAL_PRONUNCIATIONS,
  ...TECH_PRONUNCIATIONS,
  ...MENTAL_HEALTH_PRONUNCIATIONS,
  ...WELLNESS_PRONUNCIATIONS,
  ...CALENDAR_PRONUNCIATIONS,

  // Cultural & spiritual terms
  ...JAPANESE_PRONUNCIATIONS,
  ...ZEN_BUDDHIST_PRONUNCIATIONS,
  ...MINDFULNESS_PRONUNCIATIONS,

  // Geographic & Native American
  ...GEOGRAPHIC_PRONUNCIATIONS,
  ...NATIVE_AMERICAN_PRONUNCIATIONS,

  // Names & thought leaders
  ...THOUGHT_LEADER_PRONUNCIATIONS,

  // Common abbreviations & mispronounced words (most general)
  ...COMMON_ABBREVIATIONS,
  ...MISPRONOUNCED_WORDS,
];
