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
export type { EnhancementState, HeavyContentType, PresenceLevel, SuperhumanVoiceContext, SuperhumanVoiceResult, SuperhumanVoiceSession, VulnerabilityDepth, } from './types.js';
export { calculateProsodicMirroring, PROSODIC_MIRRORING_CONFIG } from './prosodic-mirroring.js';
export { getVulnerabilityVoiceAdjustments, VULNERABILITY_VOICE_ADJUSTMENTS, } from './vulnerability-softening.js';
export { getSilencePresencePhrase, SILENCE_PRESENCE_PHRASES } from './silence-presence.js';
export { ANTICIPATORY_COMFORT_SOUNDS, detectHeavyContentType, getAnticipatoryComfortSound, } from './anticipatory-comfort.js';
export { getMemoryInformedBaseline, MEMORY_INFORMED_ADJUSTMENTS } from './memory-baseline.js';
export { EMOTIONAL_TRANSITION_BRIDGES, getEmotionalTransitionBridge, } from './emotion-transitions.js';
export { getActiveSuperhmanVoiceSessionCount, getLastEmotion, getSuperhmanVoiceSession, resetAllSuperhmanVoiceSessions, resetSuperhmanVoiceSession, updateSuperhmanVoiceSession, } from './session.js';
export { applySuperhmanVoice } from './orchestrator.js';
import { applySuperhmanVoice as _applySuperhmanVoice } from './orchestrator.js';
import { calculateProsodicMirroring as _calculateProsodicMirroring } from './prosodic-mirroring.js';
import { getVulnerabilityVoiceAdjustments as _getVulnerabilityVoiceAdjustments } from './vulnerability-softening.js';
import { getSilencePresencePhrase as _getSilencePresencePhrase } from './silence-presence.js';
import { getAnticipatoryComfortSound as _getAnticipatoryComfortSound, detectHeavyContentType as _detectHeavyContentType } from './anticipatory-comfort.js';
import { getMemoryInformedBaseline as _getMemoryInformedBaseline } from './memory-baseline.js';
import { getEmotionalTransitionBridge as _getEmotionalTransitionBridge } from './emotion-transitions.js';
import { getSuperhmanVoiceSession as _getSuperhmanVoiceSession, updateSuperhmanVoiceSession as _updateSuperhmanVoiceSession, getLastEmotion as _getLastEmotion, resetSuperhmanVoiceSession as _resetSuperhmanVoiceSession, resetAllSuperhmanVoiceSessions as _resetAllSuperhmanVoiceSessions, getActiveSuperhmanVoiceSessionCount as _getActiveSuperhmanVoiceSessionCount } from './session.js';
declare const _default: {
    applySuperhmanVoice: typeof _applySuperhmanVoice;
    calculateProsodicMirroring: typeof _calculateProsodicMirroring;
    getVulnerabilityVoiceAdjustments: typeof _getVulnerabilityVoiceAdjustments;
    getSilencePresencePhrase: typeof _getSilencePresencePhrase;
    getAnticipatoryComfortSound: typeof _getAnticipatoryComfortSound;
    detectHeavyContentType: typeof _detectHeavyContentType;
    getMemoryInformedBaseline: typeof _getMemoryInformedBaseline;
    getEmotionalTransitionBridge: typeof _getEmotionalTransitionBridge;
    getSuperhmanVoiceSession: typeof _getSuperhmanVoiceSession;
    updateSuperhmanVoiceSession: typeof _updateSuperhmanVoiceSession;
    getLastEmotion: typeof _getLastEmotion;
    resetSuperhmanVoiceSession: typeof _resetSuperhmanVoiceSession;
    resetAllSuperhmanVoiceSessions: typeof _resetAllSuperhmanVoiceSessions;
    getActiveSuperhmanVoiceSessionCount: typeof _getActiveSuperhmanVoiceSessionCount;
};
export default _default;
//# sourceMappingURL=index.d.ts.map