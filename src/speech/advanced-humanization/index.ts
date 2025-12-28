/**
 * Advanced Voice Humanization System
 *
 * Implements research-backed techniques to make Ferni's voice feel genuinely human:
 *
 * 1. **Expanded Emotions** - Uses Cartesia Sonic-3's full 50+ emotion palette
 * 2. **Natural Fillers** - Injects "um", "well", "you know" for spontaneity
 * 3. **Breath Group Pacing** - Natural pauses at phrase boundaries
 * 4. **Speech Rhythm Variation** - Prevents monotonous delivery
 *
 * @see docs/VOICE-HUMANIZATION-RESEARCH.md for research basis
 *
 * @module advanced-humanization
 */

// ============================================================================
// TYPES
// ============================================================================

export {
  ALL_CARTESIA_EMOTIONS,
  CARTESIA_EMOTIONS,
  DEFAULT_BREATH_CONFIG,
  DEFAULT_FILLER_CONFIG,
  DEFAULT_HUMANIZATION_OPTIONS,
  type BreathGroupConfig,
  type CartesiaEmotion,
  type EmotionContext,
  type FillerConfig,
  type HumanizationOptions,
  type RhythmVariation,
} from './types.js';

// ============================================================================
// EMOTION MAPPING
// ============================================================================

export { getEmotionTransition, mapContextToEmotion } from './emotions.js';

// ============================================================================
// NATURAL FILLERS
// ============================================================================

export {
  FILLERS,
  injectNaturalFillers,
  PERSONA_FILLER_PREFERENCES,
  type FillerCategory,
} from './fillers.js';

// ============================================================================
// BREATH GROUP PACING
// ============================================================================

export { addBreathGroupPauses } from './breath-groups.js';

// ============================================================================
// SPEECH RHYTHM
// ============================================================================

export { analyzeRhythm, applyRhythmVariations, hasSignificantVariation } from './rhythm.js';

// ============================================================================
// MAIN PIPELINE
// ============================================================================

export { humanizeText } from './pipeline.js';

// ============================================================================
// PERSONA VOICE FINGERPRINTS (Better Than Human)
// ============================================================================

export {
  applyContextualEmotion,
  applyPersonaVoiceFingerprint,
  getPersonaAppropriateEmotion,
  getRandomPersonaEmotion,
  isEmotionInPersonaRange,
} from '../cartesia-expressiveness.js';

// Emotion profiles - from standalone file to avoid circular deps
// PersonaEmotionProfile type is canonical here (cartesia-expressiveness re-exports it)
export {
  getEmotionProfile,
  PERSONA_EMOTION_PROFILES,
  type PersonaEmotionProfile,
} from '../emotion-profiles.js';

// ============================================================================
// DEFAULT EXPORT (For backwards compatibility)
// ============================================================================

import { addBreathGroupPauses } from './breath-groups.js';
import {
  applyContextualEmotion,
  applyPersonaVoiceFingerprint,
  getPersonaAppropriateEmotion,
  getRandomPersonaEmotion,
} from '../cartesia-expressiveness.js';
import { getEmotionProfile, PERSONA_EMOTION_PROFILES } from '../emotion-profiles.js';
import { getEmotionTransition, mapContextToEmotion } from './emotions.js';
import { injectNaturalFillers } from './fillers.js';
import { humanizeText } from './pipeline.js';
import { analyzeRhythm, applyRhythmVariations } from './rhythm.js';
import { ALL_CARTESIA_EMOTIONS, CARTESIA_EMOTIONS } from './types.js';

export default {
  // Emotion system
  CARTESIA_EMOTIONS,
  ALL_CARTESIA_EMOTIONS,
  mapContextToEmotion,
  getEmotionTransition,

  // Persona voice fingerprints (Better Than Human)
  PERSONA_EMOTION_PROFILES,
  getEmotionProfile,
  applyPersonaVoiceFingerprint,
  applyContextualEmotion,
  getPersonaAppropriateEmotion,
  getRandomPersonaEmotion,

  // Filler system
  injectNaturalFillers,

  // Breath groups
  addBreathGroupPauses,

  // Rhythm
  analyzeRhythm,
  applyRhythmVariations,

  // Main pipeline
  humanizeText,
};
