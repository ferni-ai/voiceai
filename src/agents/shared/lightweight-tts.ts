/**
 * Lightweight TTS Factory - NO HEAVY IMPORTS
 * 
 * This module creates Cartesia TTS instances directly without importing
 * the full voice-manager module (which has a massive import chain).
 * 
 * Used by child processes to avoid the 112+ second import hang.
 * 
 * @module lightweight-tts
 */

import * as cartesia from '@livekit/agents-plugin-cartesia';

// Default Ferni voice
const DEFAULT_VOICE_ID = 'a0e99841-438c-4a64-b679-ae501e7d6091';

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
 */
export function createLightweightTTS(
  personaName: string,
  config: VoiceConfig
): InstanceType<typeof cartesia.TTS> {
  const voiceId = config.voiceId || DEFAULT_VOICE_ID;
  const model = config.model || 'sonic-2024-10-01';
  
  process.stderr.write(
    `[lightweight-tts] Creating TTS for ${personaName} with voice ${voiceId.slice(0, 8)}...\n`
  );

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

