/**
 * Cartesia TTS Core - ZERO HEAVY IMPORTS
 *
 * This module provides the foundational TTS factory with:
 * - Environment-based configuration
 * - Prewarming support
 * - Zero external dependencies (only Cartesia SDK)
 *
 * CRITICAL: This file must NOT import any modules that trigger heavy import chains.
 * Used by child processes where import speed is critical.
 *
 * For full-featured TTS with voice switching, use PersonaAwareTTS from ./persona-aware.ts
 *
 * @module @ferni/speech/tts/core
 */
import * as cartesia from '@livekit/agents-plugin-cartesia';
import type { TTSOptions, VoiceConfig } from './types.js';
import { CARTESIA_MODEL, DEFAULT_VOICE_IDS } from '../../config/voice-ids.js';
export { CARTESIA_MODEL, DEFAULT_VOICE_IDS };
/**
 * Create a raw Cartesia TTS instance.
 *
 * This is the lowest-level factory - it creates a plain Cartesia TTS
 * without any wrapper. Use this when you need maximum performance
 * and don't need voice switching.
 *
 * @param voiceId - Cartesia voice ID
 * @param options - TTS options (model, encoding, etc.)
 * @returns Raw Cartesia TTS instance
 *
 * @example
 * ```ts
 * const tts = createCartesiaTTS(VOICE_IDS.FERNI);
 * const stream = tts.stream();
 * ```
 */
export declare function createCartesiaTTS(voiceId: string, options?: Partial<TTSOptions>): cartesia.TTS;
/**
 * Create a TTS instance from a voice configuration.
 *
 * This is a convenience wrapper that extracts the voice ID from
 * a VoiceConfig object and handles defaults.
 *
 * If a prewarmed instance exists with matching voiceId, it will be
 * returned instead of creating a new one (one-time use).
 *
 * @param personaName - Name for logging purposes
 * @param config - Voice configuration
 * @returns Cartesia TTS instance
 */
export declare function createTTSFromConfig(personaName: string, config: VoiceConfig, options?: {
    language?: string;
}): cartesia.TTS;
/**
 * Prewarm a TTS instance for faster first-use.
 *
 * Creates a TTS instance during idle time so the first actual
 * synthesis call doesn't incur creation overhead.
 *
 * The prewarmed instance is consumed by the first matching
 * createTTSFromConfig() call.
 *
 * @param voiceId - Voice ID to prewarm (default: Ferni)
 */
export declare function prewarmTTS(voiceId?: string): Promise<void>;
/**
 * Check if TTS is prewarmed.
 */
export declare function isTTSPrewarmed(): boolean;
/**
 * Wait for TTS prewarm to complete (if in progress).
 */
export declare function waitForTTSPrewarm(): Promise<void>;
/**
 * Get the prewarmed voice ID (null if not prewarmed).
 */
export declare function getPrewarmedVoiceId(): string | null;
/**
 * Clear the prewarmed TTS instance.
 * Useful for testing or when voice requirements change.
 */
export declare function clearPrewarmedTTS(): void;
/**
 * Get voice ID for a persona by ID.
 *
 * Supports canonical names, legacy names, and short aliases.
 * Falls back to Ferni's voice for unknown personas.
 *
 * @param personaId - Persona identifier
 * @returns Voice ID
 */
export declare function getVoiceIdForPersona(personaId: string): string;
/**
 * Get the default TTS provider from environment
 */
export declare function getDefaultTTSProvider(): 'cartesia' | 'btcw';
/**
 * Create a TTS instance from config, with automatic provider switching.
 *
 * This is the recommended factory for new code - it will automatically
 * use the correct provider based on config or environment.
 *
 * @param personaName - Name for logging
 * @param config - Voice configuration with optional provider
 * @returns TTS instance (Cartesia or BTCW)
 */
export declare function createUnifiedTTS(personaName: string, config: VoiceConfig): Promise<cartesia.TTS | import('./btcw-core.js').BTCWTTS>;
export type { PrewarmState, TTSOptions, VoiceConfig } from './types.js';
//# sourceMappingURL=cartesia-core.d.ts.map