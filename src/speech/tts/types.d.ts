/**
 * TTS Types - Zero Dependencies
 *
 * Shared type definitions for TTS modules.
 * This file has NO imports to ensure it can be used anywhere.
 *
 * @module @ferni/speech/tts/types
 */
/**
 * Supported TTS providers
 */
export type TTSProvider = 'cartesia' | 'btcw' | 'cosyvoice';
/**
 * Voice configuration for creating a TTS instance.
 */
export interface VoiceConfig {
    /** Cartesia voice ID (UUID format) or BTCW persona name */
    voiceId: string;
    /** TTS provider (default: 'cartesia') */
    provider?: TTSProvider;
    /** Cartesia model (default: from CARTESIA_MODEL env var or 'sonic-3') */
    model?: string;
    /** English accent variant */
    accent?: 'american' | 'british' | 'australian' | 'indian';
    /** Whether this is a localized (non-American) voice */
    isLocalizedVoice?: boolean;
    /** BTCW-specific: Server endpoint URL */
    btcwEndpoint?: string;
    /** BTCW-specific: API key for authentication */
    btcwApiKey?: string;
    /** BTCW-specific: Default emotion */
    btcwDefaultEmotion?: string;
}
/**
 * Persona voice configuration (from persona manifests).
 */
export interface PersonaVoiceConfig extends VoiceConfig {
    /** Default speech rate multiplier */
    defaultRate?: number | string;
}
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
export declare const DEFAULT_TTS_OPTIONS: Required<TTSOptions>;
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
//# sourceMappingURL=types.d.ts.map