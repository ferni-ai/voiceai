/**
 * TTS Types - Zero Dependencies
 *
 * Shared type definitions for TTS modules.
 * This file has NO imports to ensure it can be used anywhere.
 *
 * @module @ferni/speech/tts/types
 */

// ============================================================================
// VOICE CONFIGURATION
// ============================================================================

/**
 * Voice configuration for creating a TTS instance.
 */
export interface VoiceConfig {
  /** Cartesia voice ID (UUID format) */
  voiceId: string;
  /** TTS provider (default: 'cartesia') */
  provider?: string;
  /** Cartesia model (default: from CARTESIA_MODEL env var or 'sonic-3') */
  model?: string;
  /** English accent variant */
  accent?: 'american' | 'british' | 'australian' | 'indian';
  /** Whether this is a localized (non-American) voice */
  isLocalizedVoice?: boolean;
}

/**
 * Persona voice configuration (from persona manifests).
 */
export interface PersonaVoiceConfig extends VoiceConfig {
  /** Default speech rate multiplier */
  defaultRate?: number | string;
}

// ============================================================================
// TTS OPTIONS
// ============================================================================

/**
 * Options for creating a TTS instance.
 */
export interface TTSOptions {
  /** Cartesia model to use */
  model?: string;
  /** Audio encoding format (Cartesia only supports pcm_s16le) */
  encoding?: 'pcm_s16le';
  /** Audio sample rate in Hz */
  sampleRate?: number;
  /** Language code */
  language?: string;
}

/**
 * Default TTS options.
 */
export const DEFAULT_TTS_OPTIONS: Required<TTSOptions> = {
  model: 'sonic-3', // Will be overridden by env var
  encoding: 'pcm_s16le',
  sampleRate: 24000,
  language: 'en',
};

// ============================================================================
// PREWARM STATE
// ============================================================================

/**
 * State for prewarmed TTS instances.
 */
export interface PrewarmState {
  /** The prewarmed TTS instance */
  instance: unknown;
  /** Voice ID the instance was created with */
  voiceId: string;
  /** Timestamp when prewarmed */
  timestamp: number;
}
