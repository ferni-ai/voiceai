/**
 * TTS Module - Unified Voice Synthesis
 *
 * This module provides a clean architecture for TTS with two entry points:
 *
 * 1. **Lightweight (for child processes):**
 *    ```ts
 *    import { createCartesiaTTS, prewarmTTS } from '@ferni/speech/tts';
 *    const tts = createCartesiaTTS(voiceId);
 *    ```
 *
 * 2. **Full-Featured (for main voice agent):**
 *    ```ts
 *    import { createPersonaAwareTTS, PersonaAwareTTS } from '@ferni/speech/tts';
 *    const tts = createPersonaAwareTTS('Ferni', personaConfig.voice);
 *    tts.switchVoice('Peter', peterVoiceId);
 *    ```
 *
 * Architecture:
 * ```
 * src/speech/tts/
 *   ├── types.ts          # Shared types (zero imports)
 *   ├── cartesia-core.ts  # Lightweight factory (zero heavy imports)
 *   ├── persona-aware.ts  # Full-featured TTS with voice switching
 *   └── index.ts          # This file - unified exports
 * ```
 *
 * @module @ferni/speech/tts
 */

// ============================================================================
// TYPES
// ============================================================================

export type { PersonaVoiceConfig, PrewarmState, TTSOptions, VoiceConfig } from './types.js';

// ============================================================================
// CORE (Lightweight - Zero Heavy Imports)
// ============================================================================

export {
  // Configuration
  CARTESIA_MODEL,
  DEFAULT_VOICE_IDS,
  clearPrewarmedTTS,
  // Factory
  createCartesiaTTS,
  createTTSFromConfig,
  getPrewarmedVoiceId,
  // Voice lookup
  getVoiceIdForPersona,
  isTTSPrewarmed,
  // Prewarming
  prewarmTTS,
  waitForTTSPrewarm,
} from './cartesia-core.js';

// ============================================================================
// PERSONA-AWARE (Full-Featured)
// ============================================================================

export {
  DEFAULT_ACCENT,
  // Class
  PersonaAwareTTS,
  SUPPORTED_ACCENTS,
  // Factory
  createPersonaAwareTTS,

  // Accent types
  type EnglishAccent,
} from './persona-aware.js';

// ============================================================================
// LEGACY ALIASES (for backwards compatibility)
// ============================================================================

// These are deprecated - use the new names above
export {
  createTTSFromConfig as createLightweightTTS,
  prewarmTTS as prewarmTTSConnection,
} from './cartesia-core.js';
