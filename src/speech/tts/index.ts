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

export type {
  PersonaVoiceConfig,
  PrewarmState,
  TTSOptions,
  TTSProvider,
  VoiceConfig,
} from './types.js';

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
  createUnifiedTTS,
  getDefaultTTSProvider,
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
// BTCW (CosyVoice TTS)
// ============================================================================

export {
  // Classes
  BTCWTTS,
  BTCWChunkedStream,
  BTCWSynthesizeStream,

  // Factory functions
  createBTCWTTS,
  createBTCWTTSFromEnv,

  // Prewarming
  prewarmBTCWTTS,
  isBTCWTTSPrewarmed,
  getPrewarmedBTCWTTS,
  clearPrewarmedBTCWTTS,

  // Voice mapping
  cartesiaVoiceToBTCW,
  getBTCWVoiceIdForPersona,

  // Constants
  DEFAULT_BTCW_ENDPOINT,
  BTCW_VOICE_IDS,

  // Types
  type BTCWOptions,
  type BTCWEmotionType,
  type SuperhumanOptions,
  type SynthesisEvent,
  type SynthesisEventType,
} from './btcw-core.js';

// Re-export AudioFrame from LiveKit for consumers that need it
export { AudioFrame } from '@livekit/rtc-node';

// ============================================================================
// SUPERHUMAN TTS (Beyond Human Voice Experience)
// ============================================================================

export {
  // Main class
  SuperhumanTTS,

  // Factory functions
  createSuperhumanTTS,
  createSuperhumanTTSFromEnv,

  // Utility functions
  calculateRelationshipStage,
  isLateNightWisdomTime,
  determineMemoryWeight,

  // Types
  type RelationshipStage,
  type MemoryWeight,
  type MemoryReference,
  type UserState,
  type RelationshipContext,
  type SuperhumanContext,
  type SuperhumanResult,
  type SuperhumanTTSConfig,
} from './superhuman-tts.js';

// ============================================================================
// LEGACY ALIASES (for backwards compatibility)
// ============================================================================

// These are deprecated - use the new names above
export {
  createTTSFromConfig as createLightweightTTS,
  prewarmTTS as prewarmTTSConnection,
} from './cartesia-core.js';
