/**
 * Persona-Aware TTS - DEPRECATED
 *
 * This module is now a re-export from the unified TTS module.
 * Use `import { PersonaAwareTTS } from '../tts/persona-aware.js'` directly.
 *
 * @deprecated Use '../tts/persona-aware.js' instead
 * @module voice-manager/persona-aware-tts
 */

// Re-export everything from the new unified module
export {
  PersonaAwareTTS,
  createPersonaAwareTTS,
  type EnglishAccent,
  DEFAULT_ACCENT,
  SUPPORTED_ACCENTS,
} from '../tts/persona-aware.js';

// Re-export types that might be expected from this path
export type { PersonaVoiceConfig } from '../tts/types.js';
