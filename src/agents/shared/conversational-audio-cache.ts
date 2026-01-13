/**
 * Conversational Audio Cache
 *
 * ⚡ CRITICAL PERFORMANCE OPTIMIZATION
 *
 * Pre-generates TTS audio for ALL conversational phrases during worker warmup:
 * - Greetings (initial session hello)
 * - Handoff banter (departing persona's goodbye)
 * - Arriving banter (new persona's welcome)
 * - Backchannels (mm-hmm, yeah, etc.)
 *
 * TARGET: All phrases under 800ms latency (most under 200ms when cached)
 *
 * @module agents/shared/conversational-audio-cache
 */

import { CARTESIA_MODEL } from '../../config/voice-ids.js';
import { getVoiceIdForPersona } from '../../speech/tts/cartesia-core.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ConversationalAudioCache' });

// ============================================================================
// TYPES
// ============================================================================

interface CachedAudio {
  /** Raw audio data (PCM) */
  audio: ArrayBuffer;
  /** Original text (for matching) */
  text: string;
  /** Voice ID used */
  voiceId: string;
  /** When generated */
  generatedAt: number;
  /** Audio duration in ms */
  durationMs: number;
  /** Category of phrase */
  category: 'greeting' | 'handoff' | 'arriving' | 'backchannel';
}

interface CacheMetrics {
  cacheHits: number;
  cacheMisses: number;
  warmupDurationMs: number;
  totalPhrasesCached: number;
  byCategory: Record<string, number>;
}

// ============================================================================
// CACHE STATE
// ============================================================================

/** Main audio cache - key is `${voiceId}:${normalizedText}` */
const audioCache = new Map<string, CachedAudio>();

/** Whether warmup is complete */
let warmupComplete = false;

/** Metrics */
const metrics: CacheMetrics = {
  cacheHits: 0,
  cacheMisses: 0,
  warmupDurationMs: 0,
  totalPhrasesCached: 0,
  byCategory: {},
};

// ============================================================================
// PHRASES TO PRE-CACHE
// ============================================================================

const PERSONAS = [
  'ferni',
  'maya-santos',
  'peter-john',
  'alex-chen',
  'jordan-taylor',
  'nayan-patel',
];

/**
 * Short greetings for instant response.
 * These are the most common opening phrases.
 */
const GREETINGS: Record<string, string[]> = {
  ferni: [
    'Hey.',
    "Hey. What's going on?",
    "Hey. What's up?",
    'Hey. Talk to me.',
    "Hey. What's on your mind?",
  ],
  'maya-santos': [
    'Hey!',
    "Hey! What's on your mind?",
    'Hey! Maya here.',
    'Hi! What are we working on?',
  ],
  'peter-john': [
    'Hey!',
    'Hey! Peter here.',
    "Hey! What's interesting?",
    'Hey! What are you thinking about?',
  ],
  'alex-chen': ['Hey!', "Hey! What's up?", 'Hey! Alex here.', "Hey! What's going on?"],
  'jordan-taylor': [
    'Hey!',
    'Hey! Jordan here!',
    "Hey! What's happening?",
    'Hey! Tell me everything!',
  ],
  'nayan-patel': ['Hey.', "Hey. I'm listening.", 'Hello, friend.', 'Hey. What brings you?'],
};

/**
 * Handoff banter - departing persona's goodbye (SOFT OPEN).
 * Keep short - spoken BEFORE voice switch.
 */
const HANDOFF_BANTER: Record<string, string[]> = {
  ferni: [
    'Let me get Alex for you.',
    'Let me get Maya for you.',
    'Let me get Jordan for you.',
    'Let me get Peter for you.',
    'Let me get Nayan for you.',
    'One moment.',
    "They're perfect for this.",
  ],
  'maya-santos': [
    'Let me get Ferni for you.',
    'Let me get Alex for you.',
    "I'll bring in Jordan.",
    "Ferni's great for this.",
    'One moment.',
  ],
  'peter-john': [
    'Let me get Ferni.',
    "Maya's perfect for this.",
    "I'll get Jordan for you.",
    'One moment.',
  ],
  'alex-chen': [
    'Let me get Ferni.',
    "Maya's perfect for this.",
    "I'll get Jordan for you.",
    'One moment.',
  ],
  'jordan-taylor': ['Let me get Ferni!', "Maya's got this!", "I'll get Peter!", 'One moment!'],
  'nayan-patel': ['Let me bring in Ferni.', 'Maya would be good for this.', 'One moment.'],
};

/**
 * Arriving banter - new persona's welcome (AFTER voice switch).
 * Keep warm and SHORT.
 */
const ARRIVING_BANTER: Record<string, string[]> = {
  ferni: [
    "Hey, I'm here.",
    'Hey! Good to see you.',
    'Hey, good to be back.',
    "Hey! What's going on?",
  ],
  'maya-santos': [
    'Hey! Maya here.',
    'Hey there!',
    "Hey! I'm here for you.",
    'Hey! Good to connect.',
  ],
  'peter-john': ['Hey! Peter here.', 'Hey there!', 'Hey! Good to meet you.', "Hey! I've got you."],
  'alex-chen': ['Hey! Alex here.', 'Hey there!', "Hey! I'm here to help.", 'Hey! Good to see you.'],
  'jordan-taylor': ['Hey! Jordan here!', 'Hey hey!', 'Hey! So good to meet you!', "Hey! Let's go!"],
  'nayan-patel': ['Hello. Nayan here.', 'Namaste.', "Hello. I'm here.", 'Hello. Good to meet you.'],
};

/**
 * Backchannels - short acknowledgments during conversation.
 * Most critical for latency - used during active listening.
 */
const BACKCHANNELS: Record<string, string[]> = {
  ferni: ['Mm', 'Yeah', 'Mhm', 'Right', 'I hear you', 'Mm-hmm', 'Oh'],
  'maya-santos': ['Mm', 'Yeah', 'Mhm', 'Okay', 'I hear you', 'Oh', 'Right'],
  'peter-john': ['Mm', 'Yeah', 'Okay', 'Interesting', 'Oh!', 'Right'],
  'alex-chen': ['Mm', 'Yeah', 'Got it', 'Right', 'Okay', 'I see'],
  'jordan-taylor': ['Yeah', 'Mhm', 'Oh!', 'Yes!', 'Uh-huh', 'Mm'],
  'nayan-patel': ['Mm', 'Yes', 'Indeed', 'I see', 'Ah'],
};

// ============================================================================
// CARTESIA API (Direct calls for speed)
// ============================================================================

const CARTESIA_API_URL = 'https://api.cartesia.ai/tts/bytes';
const CARTESIA_API_VERSION = '2024-06-10';
// CARTESIA_MODEL imported from config/voice-ids.ts for consistency

/**
 * Generate TTS audio directly via Cartesia API.
 */
async function generateAudio(text: string, voiceId: string): Promise<ArrayBuffer | null> {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) return null;

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

    if (!response.ok) return null;
    return await response.arrayBuffer();
  } catch {
    return null;
  }
}

// ============================================================================
// CACHE KEY GENERATION
// ============================================================================

/**
 * Generate cache key from text and voice.
 * Strips SSML tags and normalizes for consistent matching.
 */
function getCacheKey(text: string, voiceId: string): string {
  const normalized = text
    .replace(/<[^>]+>/g, '') // Strip SSML
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return `${voiceId}:${normalized}`;
}

/**
 * Estimate audio duration from buffer size.
 * 24kHz, 16-bit PCM = 48000 bytes/second
 */
function estimateDuration(byteLength: number): number {
  return Math.round((byteLength / 48000) * 1000);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Pre-warm ALL conversational audio during worker startup.
 *
 * This generates TTS for greetings, handoffs, and backchannels
 * for all personas. Total ~200-300 phrases.
 *
 * @returns Number of phrases successfully cached
 */
export async function prewarmConversationalAudio(): Promise<number> {
  // SKIP_CONVERSATIONAL_PREWARM=true skips this entirely for faster dev restarts
  // The phrases will be generated on-demand (slightly higher first-use latency)
  if (process.env.SKIP_CONVERSATIONAL_PREWARM === 'true') {
    log.info({}, '⏭️ Skipping conversational audio prewarm (SKIP_CONVERSATIONAL_PREWARM=true)');
    warmupComplete = true; // Allow cache lookups even though cache is empty
    return 0;
  }

  const startTime = Date.now();
  let cachedCount = 0;
  const categoryCount: Record<string, number> = {
    greeting: 0,
    handoff: 0,
    arriving: 0,
    backchannel: 0,
  };

  // Collect all phrases to generate
  const tasks: Array<{
    text: string;
    personaId: string;
    category: 'greeting' | 'handoff' | 'arriving' | 'backchannel';
  }> = [];

  for (const personaId of PERSONAS) {
    // Greetings
    const greetings = GREETINGS[personaId] || [];
    for (const text of greetings) {
      tasks.push({ text, personaId, category: 'greeting' });
    }

    // Handoff banter
    const handoffs = HANDOFF_BANTER[personaId] || [];
    for (const text of handoffs) {
      tasks.push({ text, personaId, category: 'handoff' });
    }

    // Arriving banter
    const arrivals = ARRIVING_BANTER[personaId] || [];
    for (const text of arrivals) {
      tasks.push({ text, personaId, category: 'arriving' });
    }

    // Backchannels (MOST CRITICAL for latency)
    const backchannels = BACKCHANNELS[personaId] || [];
    for (const text of backchannels) {
      tasks.push({ text, personaId, category: 'backchannel' });
    }
  }

  log.info({ totalPhrases: tasks.length }, '⚡ Starting conversational audio prewarm');

  // Process in parallel batches
  // Increased from 10 to 25 for faster warmup (~3x speedup)
  // Cartesia can handle 25 concurrent requests without issues
  const BATCH_SIZE = 25;
  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    const batch = tasks.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async ({ text, personaId, category }) => {
        const voiceId = getVoiceIdForPersona(personaId);
        if (!voiceId) return;

        const key = getCacheKey(text, voiceId);
        if (audioCache.has(key)) {
          cachedCount++;
          return;
        }

        const audio = await generateAudio(text, voiceId);
        if (audio && audio.byteLength > 0) {
          audioCache.set(key, {
            audio,
            text,
            voiceId,
            generatedAt: Date.now(),
            durationMs: estimateDuration(audio.byteLength),
            category,
          });
          cachedCount++;
          categoryCount[category]++;
        }
      })
    );
  }

  warmupComplete = true;
  metrics.warmupDurationMs = Date.now() - startTime;
  metrics.totalPhrasesCached = cachedCount;
  metrics.byCategory = categoryCount;

  log.info(
    {
      cachedCount,
      durationMs: metrics.warmupDurationMs,
      byCategory: categoryCount,
    },
    '⚡ Conversational audio prewarm complete'
  );

  return cachedCount;
}

/**
 * Get cached audio for any conversational phrase.
 *
 * @param text - The phrase (may include SSML)
 * @param voiceId - Cartesia voice ID
 * @returns Cached audio buffer, or null if not cached
 */
export function getCachedAudio(text: string, voiceId: string): ArrayBuffer | null {
  if (!warmupComplete) return null;

  const key = getCacheKey(text, voiceId);
  const cached = audioCache.get(key);

  if (cached) {
    metrics.cacheHits++;
    log.debug(
      { text: text.slice(0, 20), category: cached.category, durationMs: cached.durationMs },
      '🎯 Audio CACHE HIT'
    );
    return cached.audio;
  }

  metrics.cacheMisses++;
  return null;
}

/**
 * Get cached audio for a specific persona's phrase.
 */
export function getCachedAudioForPersona(text: string, personaId: string): ArrayBuffer | null {
  const voiceId = getVoiceIdForPersona(personaId);
  if (!voiceId) return null;
  return getCachedAudio(text, voiceId);
}

/**
 * Check if a phrase is cached.
 */
export function isPhraseCached(text: string, voiceId: string): boolean {
  if (!warmupComplete) return false;
  const key = getCacheKey(text, voiceId);
  return audioCache.has(key);
}

/**
 * Get cache metrics for monitoring.
 */
export function getConversationalCacheMetrics(): CacheMetrics & {
  cacheSize: number;
  hitRate: number;
} {
  const total = metrics.cacheHits + metrics.cacheMisses;
  return {
    ...metrics,
    cacheSize: audioCache.size,
    hitRate: total > 0 ? metrics.cacheHits / total : 0,
  };
}

/**
 * Clear the cache (for testing or memory pressure).
 */
export function clearConversationalCache(): void {
  audioCache.clear();
  warmupComplete = false;
  metrics.cacheHits = 0;
  metrics.cacheMisses = 0;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  prewarmConversationalAudio,
  getCachedAudio,
  getCachedAudioForPersona,
  isPhraseCached,
  getConversationalCacheMetrics,
  clearConversationalCache,
};
