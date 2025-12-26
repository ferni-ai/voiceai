/**
 * SSML Constants - Backwards Compatible Re-exports
 *
 * This file re-exports all constants from the organized constants/ directory.
 * The constants have been split into domain-specific modules for maintainability:
 *
 *   constants/
 *   ├── types.ts              - PronunciationEntry interface
 *   ├── markers.ts            - Unicode protection markers
 *   ├── financial.ts          - Financial term pronunciations
 *   ├── personas.ts           - Ferni team name pronunciations
 *   ├── mental-health.ts      - Therapy & coaching terms
 *   ├── wellness.ts           - Fitness & health metrics
 *   ├── calendar.ts           - Time zones & scheduling
 *   ├── common-abbreviations.ts - Business & everyday abbrevs
 *   ├── tech.ts               - Technology & programming
 *   ├── geographic.ts         - Place names (Western US, etc.)
 *   ├── cultural.ts           - Japanese, Sanskrit, thought leaders
 *   ├── emotions.ts           - Emotion detection keywords
 *   ├── pacing.ts             - Speed & volume keywords
 *   ├── vocal-patterns.ts     - Regex patterns for detection
 *   ├── stage-directions.ts   - LLM stage direction removal
 *   └── index.ts              - Central export point
 *
 * @module ssml/constants
 */

// Re-export types
export type { PronunciationEntry } from './constants/index.js';

// Re-export unicode markers
export { FINANCIAL_START, FINANCIAL_END } from './constants/index.js';

// Re-export emotion detection
export { EMOTION_KEYWORDS, DEFAULT_EMOTION, INTENSITY_MODIFIERS } from './constants/index.js';

// Re-export pacing & volume
export {
  SLOW_PACE_KEYWORDS,
  FAST_PACE_KEYWORDS,
  EMPHASIS_KEYWORDS,
  WHISPER_KEYWORDS,
  DEFAULT_SPEED,
  SPEED_ADJUSTMENTS,
  DEFAULT_VOLUME,
  VOLUME_ADJUSTMENTS,
} from './constants/index.js';

// Re-export vocal patterns
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
} from './constants/index.js';

// Re-export stage directions
export {
  STAGE_DIRECTION_KEYWORDS,
  STAGE_DIRECTION_PATTERNS,
  LAUGHTER_CONVERSION_KEYWORDS,
  UNSUPPORTED_NONVERBALS,
} from './constants/index.js';

// Re-export domain-specific pronunciation dictionaries (for direct access if needed)
export {
  PERSONA_PRONUNCIATIONS,
  MENTAL_HEALTH_PRONUNCIATIONS,
  WELLNESS_PRONUNCIATIONS,
  CALENDAR_PRONUNCIATIONS,
  COMMON_ABBREVIATIONS,
  TECH_PRONUNCIATIONS,
  GEOGRAPHIC_PRONUNCIATIONS,
  NATIVE_AMERICAN_PRONUNCIATIONS,
  JAPANESE_PRONUNCIATIONS,
  ZEN_BUDDHIST_PRONUNCIATIONS,
  MINDFULNESS_PRONUNCIATIONS,
  THOUGHT_LEADER_PRONUNCIATIONS,
  MISPRONOUNCED_WORDS,
} from './constants/index.js';

// BACKWARDS COMPATIBILITY:
// The original FINANCIAL_PRONUNCIATIONS was the combined dictionary of ALL pronunciations.
// Export ALL_PRONUNCIATIONS as FINANCIAL_PRONUNCIATIONS for backwards compatibility.
import {
  ALL_PRONUNCIATIONS,
  FINANCIAL_PRONUNCIATIONS as FINANCIAL_ONLY_PRONUNCIATIONS,
} from './constants/index.js';

/**
 * Combined pronunciation dictionary (all categories)
 * @deprecated Use ALL_PRONUNCIATIONS for clarity, or import specific dictionaries
 */
export const FINANCIAL_PRONUNCIATIONS = ALL_PRONUNCIATIONS;

/**
 * Combined pronunciation dictionary (all categories)
 * This is the preferred export name going forward.
 */
export { ALL_PRONUNCIATIONS };

/**
 * Financial-only pronunciations (retirement accounts, indices, etc.)
 * Use this if you only need financial term handling.
 */
export { FINANCIAL_ONLY_PRONUNCIATIONS };
