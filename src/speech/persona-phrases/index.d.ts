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
export type { PersonaId, BackchannelEmotionType, BackchannelCategory, AcknowledgmentMood, PersonaBackchannelStyle, CatchphraseConfig, } from './types.js';
export { normalizePersonaId } from './helpers.js';
export { SOFT_BACKCHANNELS, BACKCHANNEL_LIBRARY, PERSONA_BACKCHANNEL_STYLE, getSoftBackchannel, getPersonaBackchannelStyle, getBackchannelPhrase, } from './backchannels.js';
export { ACKNOWLEDGMENT_PREFIXES, getAcknowledgmentPrefix } from './acknowledgments.js';
export { getThinkingFiller, getContextAwareThinkingFiller } from './thinking-fillers.js';
export { PERSONA_CATCHPHRASES, getCatchphraseWithSsml } from './catchphrases.js';
export { SILENCE_PRESENCE_PHRASES, ANTICIPATORY_COMFORT_SOUNDS, EMOTIONAL_TRANSITION_BRIDGES, getPersonaSilencePresencePhrase, getPersonaAnticipatoryComfortSound, getPersonaEmotionalTransitionBridge, } from './superhuman-voice.js';
export { getToolFiller, isLongRunningTool, TOOL_FILLERS } from '../tool-fillers.js';
declare const _default: {};
export default _default;
//# sourceMappingURL=index.d.ts.map