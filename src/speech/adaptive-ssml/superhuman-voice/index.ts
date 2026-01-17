/**
 * Superhuman Voice Enhancements
 *
 * > "Better than human."
 *
 * This module implements voice features that make Ferni feel MORE present,
 * MORE attuned, and MORE emotionally intelligent than a human could be:
 *
 * 1. **Prosodic Mirroring** - Match user's speaking pace naturally
 * 2. **Vulnerability Voice Softening** - Drop energy when they're vulnerable
 * 3. **Silence Presence Phrases** - Comfortable silences with presence
 * 4. **Anticipatory Comfort Sounds** - Empathetic sounds before they finish
 * 5. **Memory-Informed Baseline** - Adjust warmth from what we know
 * 6. **Emotional Transition Bridges** - Smooth shifts between emotions
 *
 * These features work together to create a voice that feels impossibly present -
 * like talking to someone who TRULY gets you.
 *
 * @module speech/adaptive-ssml/superhuman-voice
 */

// ============================================================================
// TYPES
// ============================================================================

export type {
  EnhancementState,
  HeavyContentType,
  PresenceLevel,
  SuperhumanVoiceContext,
  SuperhumanVoiceResult,
  SuperhumanVoiceSession,
  VulnerabilityDepth,
} from './types.js';

// ============================================================================
// PROSODIC MIRRORING
// ============================================================================

export { calculateProsodicMirroring, PROSODIC_MIRRORING_CONFIG } from './prosodic-mirroring.js';

// ============================================================================
// VULNERABILITY SOFTENING
// ============================================================================

export {
  getVulnerabilityVoiceAdjustments,
  VULNERABILITY_VOICE_ADJUSTMENTS,
} from './vulnerability-softening.js';

// ============================================================================
// SILENCE PRESENCE
// ============================================================================

export { getSilencePresencePhrase, SILENCE_PRESENCE_PHRASES } from './silence-presence.js';

// ============================================================================
// ANTICIPATORY COMFORT
// ============================================================================

export {
  ANTICIPATORY_COMFORT_SOUNDS,
  detectHeavyContentType,
  getAnticipatoryComfortSound,
} from './anticipatory-comfort.js';

// ============================================================================
// MEMORY-INFORMED BASELINE
// ============================================================================

export { getMemoryInformedBaseline, MEMORY_INFORMED_ADJUSTMENTS } from './memory-baseline.js';

// ============================================================================
// EMOTIONAL TRANSITIONS
// ============================================================================

export {
  EMOTIONAL_TRANSITION_BRIDGES,
  getEmotionalTransitionBridge,
} from './emotion-transitions.js';

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

export {
  getActiveSuperhmanVoiceSessionCount,
  getLastEmotion,
  getSuperhmanVoiceSession,
  resetAllSuperhmanVoiceSessions,
  resetSuperhmanVoiceSession,
  updateSuperhmanVoiceSession,
} from './session.js';

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

export { applySuperhmanVoice } from './orchestrator.js';

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

// Note: We need to re-import for the default export object
import { applySuperhmanVoice as _applySuperhmanVoice } from './orchestrator.js';
import { calculateProsodicMirroring as _calculateProsodicMirroring } from './prosodic-mirroring.js';
import { getVulnerabilityVoiceAdjustments as _getVulnerabilityVoiceAdjustments } from './vulnerability-softening.js';
import { getSilencePresencePhrase as _getSilencePresencePhrase } from './silence-presence.js';
import {
  getAnticipatoryComfortSound as _getAnticipatoryComfortSound,
  detectHeavyContentType as _detectHeavyContentType,
} from './anticipatory-comfort.js';
import { getMemoryInformedBaseline as _getMemoryInformedBaseline } from './memory-baseline.js';
import { getEmotionalTransitionBridge as _getEmotionalTransitionBridge } from './emotion-transitions.js';
import {
  getSuperhmanVoiceSession as _getSuperhmanVoiceSession,
  updateSuperhmanVoiceSession as _updateSuperhmanVoiceSession,
  getLastEmotion as _getLastEmotion,
  resetSuperhmanVoiceSession as _resetSuperhmanVoiceSession,
  resetAllSuperhmanVoiceSessions as _resetAllSuperhmanVoiceSessions,
  getActiveSuperhmanVoiceSessionCount as _getActiveSuperhmanVoiceSessionCount,
} from './session.js';

export default {
  applySuperhmanVoice: _applySuperhmanVoice,
  calculateProsodicMirroring: _calculateProsodicMirroring,
  getVulnerabilityVoiceAdjustments: _getVulnerabilityVoiceAdjustments,
  getSilencePresencePhrase: _getSilencePresencePhrase,
  getAnticipatoryComfortSound: _getAnticipatoryComfortSound,
  detectHeavyContentType: _detectHeavyContentType,
  getMemoryInformedBaseline: _getMemoryInformedBaseline,
  getEmotionalTransitionBridge: _getEmotionalTransitionBridge,
  getSuperhmanVoiceSession: _getSuperhmanVoiceSession,
  updateSuperhmanVoiceSession: _updateSuperhmanVoiceSession,
  getLastEmotion: _getLastEmotion,
  resetSuperhmanVoiceSession: _resetSuperhmanVoiceSession,
  resetAllSuperhmanVoiceSessions: _resetAllSuperhmanVoiceSessions,
  getActiveSuperhmanVoiceSessionCount: _getActiveSuperhmanVoiceSessionCount,
};
