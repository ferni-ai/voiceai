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
import type { PrewarmState, TTSOptions, VoiceConfig } from './types.js';

// Import voice configuration from config layer (single source of truth)
// NOTE: config/voice-ids.ts has minimal dependencies, safe to import here
import { CARTESIA_MODEL, DEFAULT_VOICE_IDS } from '../../config/voice-ids.js';

// Re-export for backwards compatibility
export { CARTESIA_MODEL, DEFAULT_VOICE_IDS };
// getVoiceIdForPersona is defined locally below with enhanced mapping

// ============================================================================
// LIGHTWEIGHT LOGGING (stderr only - no logger import)
// ============================================================================

const _log = (msg: string, data?: Record<string, unknown>) => {
  if (process.env.NODE_ENV === 'test') return;
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  process.stderr.write(`[tts-core] ${msg}${dataStr}\n`);
};

// ============================================================================
// PREWARM STATE
// ============================================================================

let _prewarmState: PrewarmState | null = null;
let _isPrewarming = false;
let _prewarmPromise: Promise<void> | null = null;

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
export function createCartesiaTTS(voiceId: string, options?: Partial<TTSOptions>): cartesia.TTS {
  const model = options?.model || CARTESIA_MODEL;
  const encoding = options?.encoding || 'pcm_s16le';
  const sampleRate = options?.sampleRate || 24000;
  const language = options?.language || 'en';

  // 🔍 DEBUG: Log Cartesia TTS creation with voice ID
  process.stderr.write(
    `[TTS-DEBUG] 🔧 createCartesiaTTS() | voiceId="${voiceId}" | model="${model}"\n`
  );

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
export function createTTSFromConfig(personaName: string, config: VoiceConfig): cartesia.TTS {
  const voiceId = config.voiceId || DEFAULT_VOICE_IDS.FERNI;
  const model = config.model || CARTESIA_MODEL;

  // Check for prewarmed instance
  if (_prewarmState && _prewarmState.voiceId === voiceId) {
    _log(`Using prewarmed TTS for ${personaName} ✅`);
    const tts = _prewarmState.instance as cartesia.TTS;
    _prewarmState = null; // One-time use
    return tts;
  }

  _log(`Creating TTS for ${personaName}`, { voice: voiceId.slice(0, 8), model });

  return createCartesiaTTS(voiceId, { model });
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
export async function prewarmTTS(voiceId: string = DEFAULT_VOICE_IDS.FERNI): Promise<void> {
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
    } catch (error) {
      _log(`TTS prewarm failed: ${error}`);
      // Non-fatal - TTS will be created on first use
    } finally {
      _isPrewarming = false;
    }
  })();

  await _prewarmPromise;
}

/**
 * Check if TTS is prewarmed.
 */
export function isTTSPrewarmed(): boolean {
  return _prewarmState !== null;
}

/**
 * Wait for TTS prewarm to complete (if in progress).
 */
export async function waitForTTSPrewarm(): Promise<void> {
  if (_prewarmPromise) {
    await _prewarmPromise;
  }
}

/**
 * Get the prewarmed voice ID (null if not prewarmed).
 */
export function getPrewarmedVoiceId(): string | null {
  return _prewarmState?.voiceId ?? null;
}

/**
 * Clear the prewarmed TTS instance.
 * Useful for testing or when voice requirements change.
 */
export function clearPrewarmedTTS(): void {
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
export function getVoiceIdForPersona(personaId: string): string {
  const normalized = personaId.toLowerCase();

  const PERSONA_VOICE_MAP: Record<string, string> = {
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
// RE-EXPORTS
// ============================================================================

export type { PrewarmState, TTSOptions, VoiceConfig } from './types.js';
