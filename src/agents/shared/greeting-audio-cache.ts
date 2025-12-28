/**
 * Greeting Audio Cache
 *
 * ⚡ CRITICAL PERFORMANCE OPTIMIZATION
 *
 * Pre-generates TTS audio for common greetings during warmup.
 * This eliminates ~200-400ms of TTS latency on first speech.
 *
 * Flow:
 * 1. During warmup: Generate audio for common greetings per persona
 * 2. On session start: Check cache before calling Cartesia
 * 3. Cache HIT: Serve pre-generated audio instantly
 * 4. Cache MISS: Fall back to real-time TTS generation
 *
 * @module agents/shared/greeting-audio-cache
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getVoiceIdForPersona } from '../../speech/tts/cartesia-core.js';

const log = createLogger({ module: 'GreetingAudioCache' });

// ============================================================================
// TYPES
// ============================================================================

interface CachedGreetingAudio {
  /** Raw audio data (PCM) */
  audio: ArrayBuffer;
  /** Greeting text (for matching) */
  text: string;
  /** Persona/voice ID */
  voiceId: string;
  /** When this was generated */
  generatedAt: number;
  /** Audio duration in ms */
  durationMs: number;
}

interface GreetingCacheEntry {
  /** Normalized text key */
  key: string;
  /** Cached audio data */
  data: CachedGreetingAudio;
}

// ============================================================================
// CACHE STATE
// ============================================================================

/** In-memory cache of pre-generated greeting audio */
const greetingCache = new Map<string, CachedGreetingAudio>();

/** Whether warmup has completed */
let warmupComplete = false;

/** Metrics for monitoring */
const metrics = {
  cacheHits: 0,
  cacheMisses: 0,
  warmupDurationMs: 0,
  greetingsCached: 0,
};

// ============================================================================
// COMMON GREETINGS TO PRE-CACHE
// ============================================================================

/**
 * Common greetings per persona (without SSML tags).
 * These are the most frequently used opening phrases.
 */
const COMMON_GREETINGS: Record<string, string[]> = {
  ferni: [
    "Hey. What's going on?",
    "Hey. What's up?",
    'Hey. Talk to me.',
    "Hey. What's happening?",
    "Hey. What's on your mind?",
    'Hey.',
    'Morning.',
    'Oh, hey.',
  ],
  'maya-santos': [
    "Hey! What's on your mind?",
    'Hey! How can I help?',
    'Hi! What are we working on today?',
    'Hey!',
  ],
  'peter-john': [
    'Hey! What are you thinking about?',
    "Hey! What's interesting?",
    "Hey! What's on your mind?",
    'Hey!',
  ],
  'alex-chen': ["Hey! What's up?", "Hey! Alex here. What's up?", "Hey! What's going on?"],
  'jordan-taylor': [
    'Hey! What are we planning?',
    "Hey! What's happening?",
    'Hey! Tell me everything!',
  ],
  'nayan-patel': [
    "Hey. I'm listening.",
    'Hey. What brings you?',
    "Hello, friend. What's on your mind?",
  ],
};

// ============================================================================
// CARTESIA API (Lightweight direct call)
// ============================================================================

const CARTESIA_API_URL = 'https://api.cartesia.ai/tts/bytes';
const CARTESIA_API_VERSION = '2024-06-10';
const CARTESIA_MODEL = process.env.CARTESIA_MODEL || 'sonic-2-2025-03-07';

/**
 * Generate TTS audio directly via Cartesia API.
 * Uses a lightweight direct call rather than full SDK for warmup speed.
 */
async function generateGreetingAudio(text: string, voiceId: string): Promise<ArrayBuffer | null> {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) {
    log.debug('Cartesia API key not available for greeting cache');
    return null;
  }

  try {
    const response = await fetch(CARTESIA_API_URL, {
      method: 'POST',
      headers: {
        'Cartesia-Version': CARTESIA_API_VERSION,
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: CARTESIA_MODEL,
        transcript: text,
        voice: { mode: 'id', id: voiceId },
        output_format: {
          container: 'raw',
          encoding: 'pcm_s16le',
          sample_rate: 24000,
        },
        language: 'en',
      }),
    });

    if (!response.ok) {
      log.debug({ status: response.status, text }, 'Cartesia greeting generation failed');
      return null;
    }

    return await response.arrayBuffer();
  } catch (error) {
    log.debug({ error: String(error), text }, 'Cartesia API call failed');
    return null;
  }
}

// ============================================================================
// CACHE KEY GENERATION
// ============================================================================

/**
 * Generate a cache key from greeting text.
 * Normalizes text to handle minor variations.
 */
function getCacheKey(text: string, voiceId: string): string {
  // Strip SSML tags and normalize whitespace
  const normalized = text
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return `${voiceId}:${normalized}`;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Pre-warm greeting audio cache during worker startup.
 *
 * This is called from warmup.ts to pre-generate TTS audio
 * for common greetings, eliminating first-speech latency.
 *
 * @returns Number of greetings successfully cached
 */
export async function prewarmGreetingAudio(): Promise<number> {
  const startTime = Date.now();
  let cachedCount = 0;

  // Generate audio for each persona's greetings in parallel
  const tasks: Promise<void>[] = [];

  for (const [personaId, greetings] of Object.entries(COMMON_GREETINGS)) {
    const voiceId = getVoiceIdForPersona(personaId);
    if (!voiceId) continue;

    for (const greeting of greetings) {
      tasks.push(
        (async () => {
          try {
            const audio = await generateGreetingAudio(greeting, voiceId);
            if (audio && audio.byteLength > 0) {
              const key = getCacheKey(greeting, voiceId);
              greetingCache.set(key, {
                audio,
                text: greeting,
                voiceId,
                generatedAt: Date.now(),
                durationMs: estimateAudioDuration(audio.byteLength),
              });
              cachedCount++;
            }
          } catch {
            // Non-fatal - continue with other greetings
          }
        })()
      );
    }
  }

  // Wait for all with a timeout (don't block warmup too long)
  await Promise.race([
    Promise.all(tasks),
    new Promise<void>((resolve) => setTimeout(resolve, 5000)), // 5s max
  ]);

  warmupComplete = true;
  metrics.warmupDurationMs = Date.now() - startTime;
  metrics.greetingsCached = cachedCount;

  log.info({ cachedCount, durationMs: metrics.warmupDurationMs }, '⚡ Greeting audio cache warmed');

  return cachedCount;
}

/**
 * Get pre-cached greeting audio if available.
 *
 * @param text - The greeting text (may include SSML)
 * @param voiceId - The voice ID to use
 * @returns Cached audio buffer, or null if not cached
 */
export function getCachedGreetingAudio(text: string, voiceId: string): ArrayBuffer | null {
  if (!warmupComplete) return null;

  const key = getCacheKey(text, voiceId);
  const cached = greetingCache.get(key);

  if (cached) {
    metrics.cacheHits++;
    log.debug(
      { text: text.slice(0, 30), voiceId: voiceId.slice(0, 8), durationMs: cached.durationMs },
      '🎯 Greeting audio CACHE HIT'
    );
    return cached.audio;
  }

  metrics.cacheMisses++;
  return null;
}

/**
 * Check if a greeting is likely cached (for decision making).
 */
export function isGreetingCached(text: string, voiceId: string): boolean {
  if (!warmupComplete) return false;
  const key = getCacheKey(text, voiceId);
  return greetingCache.has(key);
}

/**
 * Get cache metrics for monitoring.
 */
export function getGreetingCacheMetrics() {
  return {
    ...metrics,
    cacheSize: greetingCache.size,
    hitRate:
      metrics.cacheHits + metrics.cacheMisses > 0
        ? metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses)
        : 0,
  };
}

/**
 * Clear the cache (for testing or memory pressure).
 */
export function clearGreetingCache(): void {
  greetingCache.clear();
  warmupComplete = false;
  metrics.cacheHits = 0;
  metrics.cacheMisses = 0;
}

// ============================================================================
// DIRECT AUDIO PLAYBACK (via LiveKit AudioSource)
// ============================================================================

import { AudioFrame } from '@livekit/rtc-node';

/**
 * Convert cached PCM audio to AudioFrames for LiveKit streaming.
 *
 * This enables instant playback of pre-cached greetings without
 * going through the TTS pipeline.
 */
export function* splitCachedAudioIntoFrames(
  audioBuffer: ArrayBuffer,
  sampleRate = 24000,
  frameDurationMs = 20
): Generator<AudioFrame> {
  const bytesPerSample = 2; // 16-bit PCM
  const samplesPerFrame = Math.floor((sampleRate * frameDurationMs) / 1000);
  const bytesPerFrame = samplesPerFrame * bytesPerSample;

  let offset = 0;
  while (offset < audioBuffer.byteLength) {
    const frameSize = Math.min(bytesPerFrame, audioBuffer.byteLength - offset);
    const frameBuffer = audioBuffer.slice(offset, offset + frameSize);
    const samplesPerChannel = frameSize / bytesPerSample;

    const int16Data = new Int16Array(frameBuffer);
    yield new AudioFrame(int16Data, sampleRate, 1, samplesPerChannel);

    offset += frameSize;
  }
}

/**
 * Get cached greeting as a ReadableStream of AudioFrames.
 *
 * This can be used directly with LiveKit's audio publishing.
 * Returns null if greeting is not cached.
 */
export function getCachedGreetingAudioStream(
  text: string,
  voiceId: string
): ReadableStream<AudioFrame> | null {
  const cachedAudio = getCachedGreetingAudio(text, voiceId);
  if (!cachedAudio) return null;

  const frames = [...splitCachedAudioIntoFrames(cachedAudio)];

  return new ReadableStream<AudioFrame>({
    start(controller) {
      for (const frame of frames) {
        controller.enqueue(frame);
      }
      controller.close();
    },
  });
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Estimate audio duration from buffer size.
 * Assumes 24kHz, 16-bit PCM (2 bytes per sample).
 */
function estimateAudioDuration(byteLength: number): number {
  const bytesPerSecond = 24000 * 2; // 24kHz, 16-bit
  return Math.round((byteLength / bytesPerSecond) * 1000);
}

export default {
  prewarmGreetingAudio,
  getCachedGreetingAudio,
  getCachedGreetingAudioStream,
  isGreetingCached,
  getGreetingCacheMetrics,
  clearGreetingCache,
  splitCachedAudioIntoFrames,
};
