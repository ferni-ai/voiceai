/**
 * Voice Manager Module
 *
 * Manages TTS voice switching between all personas in the team.
 * Uses Cartesia's API to switch voices mid-session.
 *
 * Features:
 * - DynamicTTS class that switches voices based on current agent
 * - Automatic voice switching on handoff events
 * - Support for all 6 personas: Ferni, Jack Bogle, Peter John, Alex, Maya, Jordan
 *
 * Voice IDs are now sourced from the voice-registry (single source of truth).
 *
 * @module voice-manager
 */
export type { PersonaVoiceConfig, VoiceAgentId, VoiceConfig } from './types.js';
export { VOICES } from './config.js';
export { VoiceManager, getSessionVoiceManager, getSessionVoiceManagerCount, getVoiceManager, normalizeAgentId, resetAllSessionVoiceManagers, resetSessionVoiceManager, resetVoiceManager, } from './manager.js';
export { getVoiceManager as default } from './manager.js';
export { DynamicTTS, createDynamicTTS } from './dynamic-tts.js';
export { PersonaAwareTTS, createPersonaAwareTTS } from '../tts/persona-aware.js';
export { CARTESIA_MODEL, DEFAULT_VOICE_IDS, createCartesiaTTS, createTTSFromConfig, getVoiceIdForPersona, isTTSPrewarmed, prewarmTTS, waitForTTSPrewarm, } from '../tts/cartesia-core.js';
//# sourceMappingURL=index.d.ts.map