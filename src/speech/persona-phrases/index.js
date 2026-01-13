/**
 * Persona Phrases - Single Source of Truth
 *
 * All persona-specific phrases consolidated in one place.
 * This prevents duplication across backchanneling, response-naturalness, etc.
 *
 * INTEGRATION: Uses ProcessingIntelligence for thinking/processing phrases
 * when contextual composition is needed. Legacy THINKING_FILLERS are kept
 * for backward compatibility.
 *
 * @module persona-phrases
 */
// ============================================================================
// HELPERS
// ============================================================================
export { normalizePersonaId } from './helpers.js';
// ============================================================================
// BACKCHANNELS
// ============================================================================
export { SOFT_BACKCHANNELS, BACKCHANNEL_LIBRARY, PERSONA_BACKCHANNEL_STYLE, getSoftBackchannel, getPersonaBackchannelStyle, getBackchannelPhrase, } from './backchannels.js';
// ============================================================================
// ACKNOWLEDGMENTS (DEPRECATED)
// ============================================================================
export { ACKNOWLEDGMENT_PREFIXES, getAcknowledgmentPrefix } from './acknowledgments.js';
// ============================================================================
// THINKING FILLERS
// ============================================================================
export { getThinkingFiller, getContextAwareThinkingFiller } from './thinking-fillers.js';
// ============================================================================
// CATCHPHRASES
// ============================================================================
export { PERSONA_CATCHPHRASES, getCatchphraseWithSsml } from './catchphrases.js';
// ============================================================================
// SUPERHUMAN VOICE
// ============================================================================
export { SILENCE_PRESENCE_PHRASES, ANTICIPATORY_COMFORT_SOUNDS, EMOTIONAL_TRANSITION_BRIDGES, getPersonaSilencePresencePhrase, getPersonaAnticipatoryComfortSound, getPersonaEmotionalTransitionBridge, } from './superhuman-voice.js';
// ============================================================================
// TOOL FILLERS (Re-exported from dedicated module)
// ============================================================================
export { getToolFiller, isLongRunningTool, TOOL_FILLERS } from '../tool-fillers.js';
// ============================================================================
// DEFAULT EXPORT
// ============================================================================
export default {
// Data
// Note: Import individual exports for data constants
// Helpers
// Note: Import individual exports for helper functions
};
//# sourceMappingURL=index.js.map