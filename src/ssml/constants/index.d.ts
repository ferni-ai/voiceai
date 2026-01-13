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
export type { PronunciationEntry } from './types.js';
export { FINANCIAL_START, FINANCIAL_END } from './markers.js';
export { FINANCIAL_PRONUNCIATIONS } from './financial.js';
export { PERSONA_PRONUNCIATIONS } from './personas.js';
export { MENTAL_HEALTH_PRONUNCIATIONS } from './mental-health.js';
export { WELLNESS_PRONUNCIATIONS } from './wellness.js';
export { CALENDAR_PRONUNCIATIONS } from './calendar.js';
export { COMMON_ABBREVIATIONS } from './common-abbreviations.js';
export { TECH_PRONUNCIATIONS } from './tech.js';
export { GEOGRAPHIC_PRONUNCIATIONS, NATIVE_AMERICAN_PRONUNCIATIONS } from './geographic.js';
export { JAPANESE_PRONUNCIATIONS, ZEN_BUDDHIST_PRONUNCIATIONS, MINDFULNESS_PRONUNCIATIONS, THOUGHT_LEADER_PRONUNCIATIONS, MISPRONOUNCED_WORDS, } from './cultural.js';
export { EMOTION_KEYWORDS, DEFAULT_EMOTION, INTENSITY_MODIFIERS } from './emotions.js';
export { SLOW_PACE_KEYWORDS, FAST_PACE_KEYWORDS, EMPHASIS_KEYWORDS, WHISPER_KEYWORDS, DEFAULT_SPEED, SPEED_ADJUSTMENTS, DEFAULT_VOLUME, VOLUME_ADJUSTMENTS, } from './pacing.js';
export { LAUGHTER_PATTERNS, SIGH_PATTERNS, DISFLUENCY_PATTERNS, REPETITION_PATTERNS, SARCASTIC_PATTERNS, THINKING_PATTERNS, REFLECTION_PHRASES, CONTEMPLATIVE_PATTERNS, TRANSITION_PATTERNS, BREATH_POINT_PATTERNS, CONTRASTIVE_PATTERNS, PARENTHETICAL_PATTERNS, LIST_PATTERNS, ACRONYM_PATTERNS, NUMBER_PATTERNS, } from './vocal-patterns.js';
export { STAGE_DIRECTION_KEYWORDS, STAGE_DIRECTION_PATTERNS, LAUGHTER_CONVERSION_KEYWORDS, UNSUPPORTED_NONVERBALS, } from './stage-directions.js';
import type { PronunciationEntry } from './types.js';
/**
 * ALL_PRONUNCIATIONS - Combined pronunciation dictionary
 *
 * This is the complete dictionary used by the pronunciation processor.
 * Order matters: more specific patterns should come before general ones.
 */
export declare const ALL_PRONUNCIATIONS: PronunciationEntry[];
//# sourceMappingURL=index.d.ts.map