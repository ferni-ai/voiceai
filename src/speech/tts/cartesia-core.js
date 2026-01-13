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
// Import voice configuration from config layer (single source of truth)
// NOTE: config/voice-ids.ts has minimal dependencies, safe to import here
import { CARTESIA_MODEL, DEFAULT_VOICE_IDS } from '../../config/voice-ids.js';
// Re-export for backwards compatibility
export { CARTESIA_MODEL, DEFAULT_VOICE_IDS };
// getVoiceIdForPersona is defined locally below with enhanced mapping
// ============================================================================
// LIGHTWEIGHT LOGGING (stderr only - no logger import)
// ============================================================================
const _log = (msg, data) => {
    if (process.env.NODE_ENV === 'test')
        return;
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';
    process.stderr.write(`[tts-core] ${msg}${dataStr}\n`);
};
// ============================================================================
// PREWARM STATE
// ============================================================================
let _prewarmState = null;
let _isPrewarming = false;
let _prewarmPromise = null;
// ============================================================================
// CORE TTS FACTORY
// ============================================================================
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
export function createCartesiaTTS(voiceId, options) {
    const model = options?.model || CARTESIA_MODEL;
    const encoding = options?.encoding || 'pcm_s16le';
    const sampleRate = options?.sampleRate || 24000;
    const language = options?.language || 'en';
    return new cartesia.TTS({
        voice: voiceId,
        model,
        language,
        encoding,
        sampleRate,
    });
}
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
export function createTTSFromConfig(personaName, config, options) {
    const voiceId = config.voiceId || DEFAULT_VOICE_IDS.FERNI;
    const model = config.model || CARTESIA_MODEL;
    const language = options?.language || 'en';
    // Check for prewarmed instance (only if language matches default)
    if (_prewarmState && _prewarmState.voiceId === voiceId && language === 'en') {
        _log(`Using prewarmed TTS for ${personaName} ✅`);
        const tts = _prewarmState.instance;
        _prewarmState = null; // One-time use
        return tts;
    }
    _log(`Creating TTS for ${personaName}`, { voice: voiceId.slice(0, 8), model, language });
    return createCartesiaTTS(voiceId, { model, language });
}
// ============================================================================
// PREWARMING
// ============================================================================
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
export async function prewarmTTS(voiceId = DEFAULT_VOICE_IDS.FERNI) {
    if (_isPrewarming || _prewarmState) {
        _log('TTS prewarm already in progress or complete');
        return _prewarmPromise || Promise.resolve();
    }
    _isPrewarming = true;
    const startTime = Date.now();
    _log(`Prewarming TTS for voice ${voiceId.slice(0, 8)}...`);
    _prewarmPromise = (async () => {
        try {
            const tts = createCartesiaTTS(voiceId);
            _prewarmState = {
                instance: tts,
                voiceId,
                timestamp: Date.now(),
            };
            const elapsed = Date.now() - startTime;
            _log(`TTS prewarmed in ${elapsed}ms ✅`);
        }
        catch (error) {
            _log(`TTS prewarm failed: ${error}`);
            // Non-fatal - TTS will be created on first use
        }
        finally {
            _isPrewarming = false;
        }
    })();
    await _prewarmPromise;
}
/**
 * Check if TTS is prewarmed.
 */
export function isTTSPrewarmed() {
    return _prewarmState !== null;
}
/**
 * Wait for TTS prewarm to complete (if in progress).
 */
export async function waitForTTSPrewarm() {
    if (_prewarmPromise) {
        await _prewarmPromise;
    }
}
/**
 * Get the prewarmed voice ID (null if not prewarmed).
 */
export function getPrewarmedVoiceId() {
    return _prewarmState?.voiceId ?? null;
}
/**
 * Clear the prewarmed TTS instance.
 * Useful for testing or when voice requirements change.
 */
export function clearPrewarmedTTS() {
    _prewarmState = null;
    _prewarmPromise = null;
    _isPrewarming = false;
}
// ============================================================================
// PERSONA VOICE LOOKUP
// ============================================================================
/**
 * Get voice ID for a persona by ID.
 *
 * Supports canonical names, legacy names, and short aliases.
 * Falls back to Ferni's voice for unknown personas.
 *
 * @param personaId - Persona identifier
 * @returns Voice ID
 */
export function getVoiceIdForPersona(personaId) {
    const normalized = personaId.toLowerCase();
    const PERSONA_VOICE_MAP = {
        // Ferni / Coach
        ferni: DEFAULT_VOICE_IDS.FERNI,
        'jack-b': DEFAULT_VOICE_IDS.FERNI,
        coach: DEFAULT_VOICE_IDS.FERNI,
        'life-coach': DEFAULT_VOICE_IDS.FERNI,
        // Peter John
        'peter-john': DEFAULT_VOICE_IDS.PETER_JOHN,
        peter: DEFAULT_VOICE_IDS.PETER_JOHN,
        // Alex Chen
        'alex-chen': DEFAULT_VOICE_IDS.ALEX_CHEN,
        alex: DEFAULT_VOICE_IDS.ALEX_CHEN,
        'comm-specialist': DEFAULT_VOICE_IDS.ALEX_CHEN,
        // Maya Santos
        'maya-santos': DEFAULT_VOICE_IDS.MAYA_SANTOS,
        maya: DEFAULT_VOICE_IDS.MAYA_SANTOS,
        'spend-save': DEFAULT_VOICE_IDS.MAYA_SANTOS,
        // Jordan Taylor
        'jordan-taylor': DEFAULT_VOICE_IDS.JORDAN_TAYLOR,
        jordan: DEFAULT_VOICE_IDS.JORDAN_TAYLOR,
        'event-planner': DEFAULT_VOICE_IDS.JORDAN_TAYLOR,
        // Nayan Patel
        'nayan-patel': DEFAULT_VOICE_IDS.NAYAN_PATEL,
        nayan: DEFAULT_VOICE_IDS.NAYAN_PATEL,
        guru: DEFAULT_VOICE_IDS.NAYAN_PATEL,
        mystic: DEFAULT_VOICE_IDS.NAYAN_PATEL,
        'lifetime-advisor': DEFAULT_VOICE_IDS.NAYAN_PATEL,
        // Generic
        'generic-advisor': DEFAULT_VOICE_IDS.GENERIC,
    };
    const voiceId = PERSONA_VOICE_MAP[normalized];
    if (!voiceId) {
        _log(`Unknown persona '${personaId}' - using Ferni voice`);
        return DEFAULT_VOICE_IDS.FERNI;
    }
    return voiceId;
}
// ============================================================================
// UNIFIED TTS FACTORY (Provider Switching)
// ============================================================================
/**
 * Get the default TTS provider from environment
 */
export function getDefaultTTSProvider() {
    const provider = process.env.TTS_PROVIDER?.toLowerCase();
    if (provider === 'btcw' || provider === 'cosyvoice') {
        return 'btcw';
    }
    return 'cartesia';
}
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
export async function createUnifiedTTS(personaName, config) {
    const provider = config.provider || getDefaultTTSProvider();
    if (provider === 'btcw' || provider === 'cosyvoice') {
        // Dynamic import to avoid loading BTCW when not needed
        const { createBTCWTTS, getBTCWVoiceIdForPersona, cartesiaVoiceToBTCW } = await import('./btcw-core.js');
        // Convert Cartesia voice ID to BTCW persona name if needed
        let btcwVoice;
        if (config.voiceId.includes('-')) {
            // Looks like a UUID (Cartesia format)
            btcwVoice = cartesiaVoiceToBTCW(config.voiceId);
        }
        else {
            // Already a persona name
            btcwVoice = getBTCWVoiceIdForPersona(config.voiceId);
        }
        _log(`Creating BTCW TTS for ${personaName}`, {
            voice: btcwVoice,
            endpoint: config.btcwEndpoint?.slice(0, 30),
        });
        return createBTCWTTS(btcwVoice, {
            endpoint: config.btcwEndpoint,
            apiKey: config.btcwApiKey,
            defaultEmotion: config.btcwDefaultEmotion || 'neutral',
        });
    }
    // Default: Cartesia
    return createTTSFromConfig(personaName, config);
}
//# sourceMappingURL=cartesia-core.js.map