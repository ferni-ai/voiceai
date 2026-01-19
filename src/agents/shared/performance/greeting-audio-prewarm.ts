/**
 * Greeting Audio Pre-warm
 *
 * ⚡ CRITICAL PERFORMANCE OPTIMIZATION
 *
 * Pre-generates TTS audio for the MOST COMMON warm greetings during GCE warmup.
 * This ensures the very first greeting users hear has ZERO TTS latency.
 *
 * Savings: ~100-200ms on first greeting (TTS generation time eliminated)
 *
 * @module agents/shared/performance/greeting-audio-prewarm
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getVoiceIdForPersona } from '../../../speech/tts/cartesia-core.js';
import { generateWarmGreeting, type GreetingContext } from '../warm-greeting.js';
import { CARTESIA_MODEL } from '../../../config/voice-ids.js';

const log = createLogger({ module: 'GreetingAudioPrewarm' });

// ============================================================================
// CONSTANTS
// ============================================================================

const CARTESIA_API_URL = 'https://api.cartesia.ai/tts/bytes';
const CARTESIA_API_VERSION = '2024-06-10';
// CARTESIA_MODEL imported from config/voice-ids.ts for consistency

/** Primary personas to pre-warm (most likely to be used) */
const PRIMARY_PERSONAS = ['ferni', 'maya-santos'] as const;

/** Secondary personas (pre-warm if time allows) */
const SECONDARY_PERSONAS = ['peter-john', 'alex-chen', 'jordan-taylor', 'nayan-patel'] as const;

/** Context variations to pre-warm (time periods) */
const CONTEXT_VARIATIONS: GreetingContext[] = [
  { hour: 9, relationshipStage: 'friend', isReturningUser: true }, // Morning friend
  { hour: 14, relationshipStage: 'friend', isReturningUser: true }, // Afternoon friend
  { hour: 20, relationshipStage: 'friend', isReturningUser: true }, // Evening friend
  { hour: 10, relationshipStage: 'stranger', isReturningUser: false }, // New user morning
];

// ============================================================================
// CACHE
// ============================================================================

interface CachedGreetingAudio {
  audio: ArrayBuffer;
  text: string;
  voiceId: string;
  generatedAt: number;
  durationMs: number;
}

const greetingAudioCache = new Map<string, CachedGreetingAudio>();

// ============================================================================
// TTS GENERATION
// ============================================================================

/**
 * Generate TTS audio via Cartesia API
 */
async function generateTTSAudio(text: string, voiceId: string): Promise<ArrayBuffer | null> {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) return null;

  try {
    // Strip SSML for direct Cartesia API call
    // Note: For pre-warm, we use plain text. SSML is handled at runtime.
    const plainText = text
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const response = await fetch(CARTESIA_API_URL, {
      method: 'POST',
      headers: {
        'Cartesia-Version': CARTESIA_API_VERSION,
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: CARTESIA_MODEL,
        transcript: plainText,
        voice: { mode: 'id', id: voiceId },
        output_format: {
          container: 'raw',
          encoding: 'pcm_s16le',
          sample_rate: 24000,
        },
        language: 'en',
      }),
    });

    if (!response.ok) return null;
    return await response.arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * Estimate audio duration from buffer size (24kHz, 16-bit PCM = 48000 bytes/second)
 */
function estimateDuration(byteLength: number): number {
  return Math.round((byteLength / 48000) * 1000);
}

/**
 * Generate cache key
 */
function getCacheKey(text: string, voiceId: string): string {
  // Normalize: strip SSML and lowercase
  const normalized = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return `greeting:${voiceId}:${normalized.slice(0, 50)}`;
}

// ============================================================================
// PUBLIC API
// ============================================================================

export interface PrewarmResult {
  cachedCount: number;
  durationMs: number;
  personas: string[];
}

/**
 * Pre-warm greeting audio during GCE worker startup.
 *
 * Generates TTS audio for the most likely greetings so the first
 * user interaction has INSTANT audio.
 *
 * @param fullWarmup - If true, pre-warm all personas. If false, only primary.
 * @returns Number of greetings cached and timing info
 */
export async function prewarmGreetingAudio(fullWarmup = false): Promise<PrewarmResult> {
  const startTime = Date.now();
  let cachedCount = 0;
  const personas = fullWarmup
    ? [...PRIMARY_PERSONAS, ...SECONDARY_PERSONAS]
    : [...PRIMARY_PERSONAS];

  log.info({ personas: personas.length, fullWarmup }, '⚡ Starting greeting audio prewarm');

  // Generate greetings for each persona + context variation
  const tasks: Array<{ personaId: string; greeting: string; voiceId: string }> = [];

  for (const personaId of personas) {
    const voiceId = getVoiceIdForPersona(personaId);
    if (!voiceId) continue;

    for (const ctx of CONTEXT_VARIATIONS) {
      const greeting = generateWarmGreeting(personaId, ctx);
      tasks.push({ personaId, greeting, voiceId });
    }
  }

  // Process in parallel batches
  const BATCH_SIZE = 5;
  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    const batch = tasks.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async ({ personaId, greeting, voiceId }) => {
        const key = getCacheKey(greeting, voiceId);
        if (greetingAudioCache.has(key)) {
          cachedCount++;
          return;
        }

        const audio = await generateTTSAudio(greeting, voiceId);
        if (audio && audio.byteLength > 0) {
          greetingAudioCache.set(key, {
            audio,
            text: greeting,
            voiceId,
            generatedAt: Date.now(),
            durationMs: estimateDuration(audio.byteLength),
          });
          cachedCount++;
          log.debug({ personaId, greeting: greeting.slice(0, 30) }, '✅ Greeting audio cached');
        }
      })
    );
  }

  const durationMs = Date.now() - startTime;
  log.info({ cachedCount, durationMs, personas }, '⚡ Greeting audio prewarm complete');

  return { cachedCount, durationMs, personas };
}

/**
 * Get pre-warmed greeting audio.
 *
 * @param text - The greeting text (will be normalized)
 * @param voiceIdOrPersonaId - Either Cartesia voice UUID or persona ID (like "ferni")
 * @returns ArrayBuffer of audio data, or null if not cached
 */
export function getPrewarmedGreetingAudio(text: string, voiceIdOrPersonaId: string): ArrayBuffer | null {
  // Handle both voiceId (Cartesia UUID) and personaId (like "ferni")
  // UUIDs are longer and contain dashes
  const voiceId = voiceIdOrPersonaId.includes('-') && voiceIdOrPersonaId.length > 20
    ? voiceIdOrPersonaId  // Already a Cartesia UUID
    : getVoiceIdForPersona(voiceIdOrPersonaId);  // Resolve persona name
  
  if (!voiceId) return null;

  const key = getCacheKey(text, voiceId);
  const cached = greetingAudioCache.get(key);

  if (cached) {
    log.debug(
      { voiceId: voiceId.slice(0, 8), text: text.slice(0, 30), durationMs: cached.durationMs },
      '🎯 Greeting audio CACHE HIT'
    );
    return cached.audio;
  }

  return null;
}

/**
 * Check if greeting audio is cached
 */
export function isGreetingAudioCached(text: string, voiceIdOrPersonaId: string): boolean {
  // Handle both voiceId and personaId
  const voiceId = voiceIdOrPersonaId.includes('-') && voiceIdOrPersonaId.length > 20
    ? voiceIdOrPersonaId
    : getVoiceIdForPersona(voiceIdOrPersonaId);
  if (!voiceId) return false;

  const key = getCacheKey(text, voiceId);
  return greetingAudioCache.has(key);
}

/**
 * Get cache statistics
 */
export function getGreetingAudioCacheStats(): {
  cacheSize: number;
  totalAudioDurationMs: number;
} {
  let totalAudioDurationMs = 0;
  for (const cached of greetingAudioCache.values()) {
    totalAudioDurationMs += cached.durationMs;
  }

  return {
    cacheSize: greetingAudioCache.size,
    totalAudioDurationMs,
  };
}

/**
 * Clear the cache (for testing)
 */
export function clearGreetingAudioCache(): void {
  greetingAudioCache.clear();
}

/**
 * Get metrics for integration.ts
 */
export function getGreetingAudioPrewarmMetrics(): {
  cacheSize: number;
  totalAudioDurationMs: number;
  hitRate?: number;
} {
  return getGreetingAudioCacheStats();
}

export default {
  prewarmGreetingAudio,
  getPrewarmedGreetingAudio,
  isGreetingAudioCached,
  getGreetingAudioCacheStats,
  getGreetingAudioPrewarmMetrics,
  clearGreetingAudioCache,
};
