/**
 * Install delegating TTS cache on the GCE worker hot path.
 *
 * Mirrors DI setup (src/services/di/setup.ts) so gateway-tts-node
 * getTTSCache() hits prewarmed greeting + conversational audio.
 *
 * @module agents/gce/tts-cache-install
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  createDelegatingTTSCache,
  setTTSCache,
} from '../../speech/tts-gateway/index.js';

const log = createLogger({ module: 'GceTtsCacheInstall' });

const PCM_SAMPLE_RATE = 24000;

type LegacyAudioBuffer = ArrayBuffer | ArrayBufferView;

function estimatePcmDurationMs(byteLength: number): number {
  // 16-bit PCM mono at 24kHz
  return Math.round((byteLength / 2 / PCM_SAMPLE_RATE) * 1000);
}

function toArrayBuffer(audio: LegacyAudioBuffer): ArrayBuffer {
  if (audio instanceof ArrayBuffer) {
    return audio;
  }

  const source = new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength);
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);

  if (!(copy.buffer instanceof ArrayBuffer)) {
    throw new Error('Expected copied legacy audio to be backed by ArrayBuffer');
  }

  return copy.buffer;
}

function createLegacyCacheEntry(
  audio: LegacyAudioBuffer
): { audio: ArrayBuffer; durationMs: number } {
  const arrayBuffer = toArrayBuffer(audio);
  return {
    audio: arrayBuffer,
    durationMs: estimatePcmDurationMs(arrayBuffer.byteLength),
  };
}

/**
 * Wire greeting + conversational prewarm caches into the TTS gateway cache.
 * Safe to call once after warmup prewarm tasks complete.
 */
export async function installProductionTTSCache(): Promise<void> {
  const { getCachedGreetingAudio } = await import('../shared/greeting-audio-cache.js');
  const { getPrewarmedGreetingAudio } = await import(
    '../shared/performance/greeting-audio-prewarm.js'
  );
  const { getCachedAudio: getCachedConversationalAudio } =
    await import('../shared/conversational-audio-cache.js');

  const legacyCacheLookup = async (
    text: string,
    voiceId: string
  ): Promise<{ audio: ArrayBuffer; durationMs: number } | null> => {
    const greeting = getCachedGreetingAudio(text, voiceId);
    if (greeting) {
      return createLegacyCacheEntry(greeting);
    }
    const prewarmedGreeting = getPrewarmedGreetingAudio(text, voiceId);
    if (prewarmedGreeting) {
      return createLegacyCacheEntry(prewarmedGreeting);
    }
    const conversational = getCachedConversationalAudio(text, voiceId);
    if (conversational) {
      return createLegacyCacheEntry(conversational);
    }
    return null;
  };

  const cache = createDelegatingTTSCache({}, legacyCacheLookup);
  setTTSCache(cache);
  log.info('TTS cache: delegating cache installed for gateway hot path');
}
