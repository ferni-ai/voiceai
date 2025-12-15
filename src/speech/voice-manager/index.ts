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

// ============================================================================
// TYPES
// ============================================================================

export type { PersonaVoiceConfig, VoiceAgentId, VoiceConfig } from './types.js';

// ============================================================================
// CONFIG
// ============================================================================

export { VOICES } from './config.js';

// ============================================================================
// VOICE MANAGER
// ============================================================================

export {
  VoiceManager,
  // Session-scoped (production-ready)
  getSessionVoiceManager,
  getSessionVoiceManagerCount,
  getVoiceManager,
  normalizeAgentId,
  resetAllSessionVoiceManagers,
  resetSessionVoiceManager,
  resetVoiceManager,
} from './manager.js';

// Default export
export { getVoiceManager as default } from './manager.js';

// ============================================================================
// DYNAMIC TTS
// ============================================================================

export { DynamicTTS, createDynamicTTS } from './dynamic-tts.js';

// ============================================================================
// PERSONA-AWARE TTS (from unified tts module)
// ============================================================================

export { PersonaAwareTTS, createPersonaAwareTTS } from '../tts/persona-aware.js';

// ============================================================================
// TTS CORE (lightweight factory for child processes)
// ============================================================================

export {
  CARTESIA_MODEL,
  DEFAULT_VOICE_IDS,
  createCartesiaTTS,
  createTTSFromConfig,
  getVoiceIdForPersona,
  isTTSPrewarmed,
  prewarmTTS,
  waitForTTSPrewarm,
} from '../tts/cartesia-core.js';
