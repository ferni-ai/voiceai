/**
 * TTS Types - Zero Dependencies
 *
 * Shared type definitions for TTS modules.
 * This file has NO imports to ensure it can be used anywhere.
 *
 * @module @ferni/speech/tts/types
 */
/**
 * Default TTS options.
 */
export const DEFAULT_TTS_OPTIONS = {
    model: 'sonic-3-latest', // Will be overridden by env var
    encoding: 'pcm_s16le',
    sampleRate: 24000,
    language: 'en',
};
//# sourceMappingURL=types.js.map