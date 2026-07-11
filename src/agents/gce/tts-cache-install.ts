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

function estimatePcmDurationMs(byteLength: number): number {
  // 16-bit PCM mono at 24kHz
  return Math.round((byteLength / 2 / PCM_SAMPLE_RATE) * 1000);
}

/**
 * Wire greeting + conversational prewarm caches into the TTS gateway cache.
 * Safe to call once after warmup prewarm tasks complete.
 */
export async function installProductionTTSCache(): Promise<void> {
  const { getCachedGreetingAudio } = await import('../shared/greeting-audio-cache.js');
  const { getCachedAudio: getCachedConversationalAudio } =
    await import('../shared/conversational-audio-cache.js');

  const legacyCacheLookup = async (
    text: string,
    voiceId: string
  ): Promise<{ audio: ArrayBuffer; durationMs: number } | null> => {
    const conversational = getCachedConversationalAudio(text, voiceId);
    if (conversational) {
      return {
        audio: conversational,
        durationMs: estimatePcmDurationMs(conversational.byteLength),
      };
    }
    const greeting = getCachedGreetingAudio(text, voiceId);
    if (greeting) {
      return { audio: greeting, durationMs: estimatePcmDurationMs(greeting.byteLength) };
    }
    return null;
  };

  const cache = createDelegatingTTSCache({}, legacyCacheLookup);
  setTTSCache(cache);
  log.info('TTS cache: delegating cache installed for gateway hot path');
}
