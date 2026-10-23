/**
 * Adaptive SSML Tagger Module
 *
 * Wraps the existing SSML tagger with adaptive parameters based on speech context.
 * Adjusts speed, pauses, laughter, and emotion based on user and conversation state.
 *
 * Now supports persona-aware SSML via the new modular ssml/ system.
 *
 * @module adaptive-ssml
 */

// ============================================================================
// TYPES
// ============================================================================

export type { CognitiveSsmlOptions } from './types.js';

// ============================================================================
// EMOTION ADAPTATION
// ============================================================================

export { applyEmotionAdaptation } from './emotion-adaptation.js';

// ============================================================================
// SMART EMPHASIS
// ============================================================================

export { applySmartEmphasis, type EmphasisOptions } from './smart-emphasis.js';

// ============================================================================
// NONVERBAL SOUNDS
// ============================================================================

export {
  NONVERBALS,
  addNonverbalSounds,
  hasNonverbalSounds,
  type NonverbalOptions,
} from './nonverbal-sounds.js';

// ============================================================================
// CONTEXTUAL LAUGHTER - Smart Laugh Timing
// ============================================================================

export {
  LAUGH_TYPES,
  PERSONA_LAUGH_STYLES,
  addContextualLaughter,
  applyLaughter,
  decideLaughter,
  resetLaughterSession,
  type LaughterContext,
  type LaughterDecision,
  type PersonaLaughStyle,
} from './contextual-laughter.js';

// ============================================================================
// AUDIO SMOOTHING
// ============================================================================

export {
  applyAudioSmoothing,
  hasAudioSmoothing,
  removeAudioSmoothing,
  type AudioSmoothingOptions,
} from './audio-smoothing.js';

// ============================================================================
// DYNAMIC SPEED CONTROL
// ============================================================================

export type { SpeedControlResult } from './dynamic-speed-control.js';

// ============================================================================
// SUPERHUMAN VOICE - "Better Than Human" Enhancements
// ============================================================================

export {
  applySuperhmanVoice,
  calculateProsodicMirroring,
  detectHeavyContentType,
  getActiveSuperhmanVoiceSessionCount,
  getAnticipatoryComfortSound,
  getEmotionalTransitionBridge,
  getLastEmotion,
  getMemoryInformedBaseline,
  getSilencePresencePhrase,
  getSuperhmanVoiceSession,
  getVulnerabilityVoiceAdjustments,
  resetAllSuperhmanVoiceSessions,
  resetSuperhmanVoiceSession,
  updateSuperhmanVoiceSession,
  type SuperhumanVoiceContext,
  type SuperhumanVoiceResult,
} from './superhuman-voice.js';

// ============================================================================
// ACTIVE PRESENCE - Quality Over Quantity Presence
// ============================================================================

export {
  addActivePresence,
  resetActivePresenceSession,
  resetAllActivePresenceSessions,
  type ActivePresenceContext,
  type ActivePresenceResult,
} from './active-presence.js';

// ============================================================================
// STRESS AUTO-ADAPTATION - Gradual Stress-Based Voice Modulation
// ============================================================================

export {
  applyStressAdaptationSsml,
  calculateStressAdaptation,
  getActiveStressAdaptationCount,
  getStressAdaptationEngine,
  getStressAdaptationState,
  recordStressReading,
  resetStressAdaptationEngine,
  stressAdaptation,
  STRESS_ADAPTATION_CONFIG,
  type StressAdaptation,
  type StressReading,
} from './stress-adaptation.js';
