/**
 * Lightweight TTS Factory - NO HEAVY IMPORTS
 *
 * This module creates Cartesia TTS instances directly without importing
 * the full voice-manager module (which has a massive import chain).
 *
 * Used by child processes to avoid the 112+ second import hang.
 *
 * Features:
 * - createLightweightTTS() - Create TTS instance
 * - prewarmTTSConnection() - Pre-establish WebSocket connection
 *
 * @module lightweight-tts
 */

import * as cartesia from '@livekit/agents-plugin-cartesia';

// Default Ferni voice - MUST match VOICE_IDS.FERNI in config/voice-ids.ts
// FIX: Previous value 'a0e99841-438c-4a64-b679-ae501e7d6091' was wrong and caused voice inconsistency
const DEFAULT_VOICE_ID = 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc';

// Use the same model as PersonaAwareTTS for voice consistency
const DEFAULT_MODEL = 'sonic-3';

// ============================================================================
// STATE
// ============================================================================

// Pre-warmed TTS instance (reused for first session)
let _prewarmedTTS: InstanceType<typeof cartesia.TTS> | null = null;
let _prewarmedVoiceId: string | null = null;
let _isPrewarming = false;
let _prewarmPromise: Promise<void> | null = null;

// ============================================================================
// LOGGING
// ============================================================================

const _log = (msg: string, data?: Record<string, unknown>) => {
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  process.stderr.write(`[lightweight-tts] ${msg}${dataStr}\n`);
};

// ============================================================================
// TTS CREATION
// ============================================================================

/**
 * Voice configuration from persona
 */
interface VoiceConfig {
  voiceId: string;
  provider?: string;
  model?: string;
  accent?: string;
}

/**
 * Create a Cartesia TTS instance with the given voice configuration.
 * This is a lightweight alternative to voice-manager.createPersonaAwareTTS()
 * that doesn't trigger the massive import chain.
 *
 * If a pre-warmed TTS exists with matching voiceId, returns that instead.
 */
export function createLightweightTTS(
  personaName: string,
  config: VoiceConfig
): InstanceType<typeof cartesia.TTS> {
  const voiceId = config.voiceId || DEFAULT_VOICE_ID;
  const model = config.model || DEFAULT_MODEL;

  // Return pre-warmed TTS if voiceId matches
  if (_prewarmedTTS && _prewarmedVoiceId === voiceId) {
    _log(`Using pre-warmed TTS for ${personaName} ✅`);
    const tts = _prewarmedTTS;
    _prewarmedTTS = null; // One-time use
    _prewarmedVoiceId = null;
    return tts;
  }

  _log(`Creating TTS for ${personaName} with voice ${voiceId.slice(0, 8)}...`);

  return new cartesia.TTS({
    voice: voiceId,
    model,
    language: 'en',
    encoding: 'pcm_s16le',
    sampleRate: 24000,
  });
}

/**
 * Create TTS from cached persona config (read from cache file)
 */
export function createTTSFromCache(
  personaName: string,
  cachedConfig: { voice: { voiceId: string; provider: string } }
): InstanceType<typeof cartesia.TTS> {
  return createLightweightTTS(personaName, {
    voiceId: cachedConfig.voice.voiceId,
    provider: cachedConfig.voice.provider,
  });
}

// ============================================================================
// TTS CONNECTION PREWARMING
// ============================================================================

/**
 * Pre-warm TTS WebSocket connection during prewarm phase.
 *
 * Creates a TTS instance and triggers connection establishment.
 * The pre-warmed TTS will be reused by the first createLightweightTTS() call
 * if the voiceId matches.
 *
 * @param voiceId - Voice ID to use (defaults to Ferni)
 */
export async function prewarmTTSConnection(voiceId: string = DEFAULT_VOICE_ID): Promise<void> {
  if (_isPrewarming || _prewarmedTTS) {
    _log('TTS prewarm already in progress or complete');
    return;
  }

  _isPrewarming = true;
  const startTime = Date.now();
  _log(`Pre-warming TTS connection for voice ${voiceId.slice(0, 8)}...`);

  _prewarmPromise = (async () => {
    try {
      // Create TTS instance - use same model as PersonaAwareTTS for consistency
      const tts = new cartesia.TTS({
        voice: voiceId,
        model: DEFAULT_MODEL,
        language: 'en',
        encoding: 'pcm_s16le',
        sampleRate: 24000,
      });

      // The Cartesia SDK establishes WebSocket on first use.
      // We can't easily trigger a connection without synthesizing,
      // but creating the instance initializes the client and validates the API key.
      // The actual WebSocket will connect on first synthesize() call.

      // Store for reuse
      _prewarmedTTS = tts;
      _prewarmedVoiceId = voiceId;

      const elapsed = Date.now() - startTime;
      _log(`TTS pre-warmed in ${elapsed}ms ✅`, { voiceId: voiceId.slice(0, 8) });
    } catch (error) {
      _log(`TTS prewarm failed: ${error}`);
      // Non-fatal - TTS will be created normally on first use
    } finally {
      _isPrewarming = false;
    }
  })();

  await _prewarmPromise;
}

/**
 * Check if TTS is pre-warmed.
 */
export function isTTSPrewarmed(): boolean {
  return _prewarmedTTS !== null;
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
 * Get the pre-warmed voiceId (null if not pre-warmed).
 */
export function getPrewarmedVoiceId(): string | null {
  return _prewarmedVoiceId;
}

