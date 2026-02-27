/**
 * TTS Module - Unified Voice Synthesis
 *
 * After Sonata migration (Feb 2026), this module provides:
 *
 * 1. **Persona-Aware TTS (for main voice agent):**
 *    ```ts
 *    import { createPersonaAwareTTS, PersonaAwareTTS } from '@ferni/speech/tts';
 *    const tts = createPersonaAwareTTS('Ferni', personaConfig.voice);
 *    tts.switchVoice('Peter', peterVoiceId);
 *    ```
 *
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

// Re-export AudioFrame from LiveKit for consumers that need it
export { AudioFrame } from '@livekit/rtc-node';

// ============================================================================
// TTS BULKHEAD (Session Isolation)
// ============================================================================

export * from './tts-bulkhead.js';

// ============================================================================
// CARTESIA CONTEXT (Prosody Continuity)
// ============================================================================

export * from './cartesia-context-patch.js';

// ============================================================================
// CARTESIA EXPRESSIVENESS (Emotion/Speed/Volume Mapping)
// ============================================================================

export * from './cartesia-expressiveness.js';

// ============================================================================
// TTS CONTEXT (Prosody Continuity Across Turns)
// ============================================================================

export * from './tts-context.js';
