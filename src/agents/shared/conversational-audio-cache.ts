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

import {
  getVoiceIdForPersona,
  CARTESIA_MODEL,
  CARTESIA_API_VERSION,
  cartesiaPronunciation,
} from '../../config/voice-ids.js';
import { ARRIVING_OPENERS } from '../../services/team-engagement/banter.js';
import { createLogger } from '../../utils/safe-logger.js';
import { toolAckClipTexts } from '../personas/tool-ack-clip-lines.js';
import { backchannelsFor, bootBackchannels } from './reaction-clips.js';
import {
  backchannelTakeTexts,
  renderBackchannelTake,
  renderVoicedTake,
  voicedTakeTexts,
} from './voiced-take-render.js';

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

/** Maximum cache size to prevent unbounded memory growth */
const MAX_CACHE_SIZE = 1000;

/** Main audio cache - key is `${voiceId}:${normalizedText}` */
const audioCache = new Map<string, CachedAudio>();

/** LRU order tracking - most recently used keys at the end */
const lruOrder: string[] = [];

/** Whether warmup is complete */
let warmupComplete = false;

/** Metrics */
const metrics: CacheMetrics & { evictions: number } = {
  cacheHits: 0,
  cacheMisses: 0,
  warmupDurationMs: 0,
  totalPhrasesCached: 0,
  byCategory: {},
  evictions: 0,
};

/**
 * Update LRU order for a key (move to end = most recently used)
 */
function touchLRU(key: string): void {
  const idx = lruOrder.indexOf(key);
  if (idx !== -1) {
    lruOrder.splice(idx, 1);
  }
  lruOrder.push(key);
}

/**
 * Evict least recently used entries if cache exceeds max size
 */
function evictLRU(): void {
  while (audioCache.size > MAX_CACHE_SIZE && lruOrder.length > 0) {
    const lruKey = lruOrder.shift();
    if (lruKey) {
      audioCache.delete(lruKey);
      metrics.evictions++;
    }
  }
}

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

/** Arriving openers (team-engagement/banter.ts): pre-rendered so the first words after a handoff are instant. */
const ARRIVING_BANTER = ARRIVING_OPENERS;

// ============================================================================
// CARTESIA API (Direct calls for speed)
// ============================================================================

const CARTESIA_API_URL = 'https://api.cartesia.ai/tts/bytes';

/**
 * Generate TTS audio directly via Cartesia API.
 */
async function generateAudio(text: string, voiceId: string): Promise<ArrayBuffer | null> {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) return null;

  // 🔧 FIX: Strip SSML tags before sending to Cartesia
  // SSML tags get fragmented by Cartesia's tokenizer and spoken literally
  const plainText = text
    .replace(/<[^>]+>/g, ' ') // Strip all XML-like tags
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim();

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
        ...cartesiaPronunciation(),
        transcript: plainText, // Use stripped text
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

/** Render one phrase into the cache unless it is already there. */
async function cachePhrase(
  text: string,
  voiceId: string,
  category: CachedAudio['category'],
  render: (text: string, voiceId: string) => Promise<ArrayBuffer | null> = generateAudio
): Promise<'cached' | 'generated' | 'failed'> {
  const key = getCacheKey(text, voiceId);
  if (audioCache.has(key)) return 'cached';
  const audio = await render(text, voiceId);
  if (!audio || audio.byteLength === 0) return 'failed';
  audioCache.set(key, {
    audio,
    text,
    voiceId,
    generatedAt: Date.now(),
    durationMs: estimateDuration(audio.byteLength),
    category,
  });
  touchLRU(key);
  evictLRU();
  return 'generated';
}

/** A failed warm (no key, Cartesia down) is retried after this, not on every lookup. */
const REACTION_RETRY_MS = 60_000;
const reactionWarms = new Map<string, { at: number; done: Promise<number> }>();

/**
 * Render a persona's missing reaction clips in its voice. Called when a
 * persona's TTS is set up for a call (persona-tts.ts: the start of a call or a
 * handoff) and on its first clip lookup; repeat calls within REACTION_RETRY_MS
 * share one run. Resolves to the number of clips newly rendered.
 */
export async function warmPersonaReactions(personaId: string): Promise<number> {
  const prev = reactionWarms.get(personaId);
  if (prev && Date.now() - prev.at < REACTION_RETRY_MS) return prev.done;
  const voiceId = getVoiceIdForPersona(personaId);
  const reactions = backchannelsFor(personaId);
  const voiced = voicedTakeTexts(reactions);
  // BACKCHANNEL_TIMING: the bag's takes in this persona's voice (none with it off).
  const takes = backchannelTakeTexts([...reactions, ...voiced]);
  const done = Promise.all([
    ...reactions.map(async (text) => cachePhrase(text, voiceId, 'backchannel')),
    // TOOL_ACK_CLIP: "Let me look." / "On it." in this persona's voice (none with it off).
    ...toolAckClipTexts().map(async (text) => cachePhrase(text, voiceId, 'backchannel')),
    ...voiced.map(async (text) => cachePhrase(text, voiceId, 'backchannel', renderVoicedTake)),
    ...takes.map(async (text) => cachePhrase(text, voiceId, 'backchannel', renderBackchannelTake)),
  ]).then((results) => results.filter((r) => r === 'generated').length);
  reactionWarms.set(personaId, { at: Date.now(), done });
  return done;
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
  const tasks: Array<{ text: string; personaId: string; category: CachedAudio['category'] }> = [];
  for (const personaId of PERSONAS) {
    const byCategory: Record<CachedAudio['category'], readonly string[] | undefined> = {
      greeting: GREETINGS[personaId],
      handoff: HANDOFF_BANTER[personaId],
      arriving: ARRIVING_BANTER[personaId],
      backchannel: bootBackchannels(personaId), // most critical for latency
    };
    for (const [category, texts] of Object.entries(byCategory)) {
      for (const text of texts ?? []) {
        tasks.push({ text, personaId, category: category as CachedAudio['category'] });
      }
    }
  }

  log.info({ totalPhrases: tasks.length }, '⚡ Starting conversational audio prewarm');

  // Process in parallel batches
  // Increased to 50 for faster warmup (~5x speedup from original 10)
  // Cartesia can handle 50 concurrent requests without issues
  // For local dev, set SKIP_CONVERSATIONAL_PREWARM=true to skip entirely
  const BATCH_SIZE = 50;
  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    const batch = tasks.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async ({ text, personaId, category }) => {
        const voiceId = getVoiceIdForPersona(personaId);
        if (!voiceId) return;

        const result = await cachePhrase(text, voiceId, category);
        if (result !== 'failed') cachedCount++;
        if (result === 'generated') categoryCount[category]++;
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
    touchLRU(key);
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
  void warmPersonaReactions(personaId);
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
  lruOrder.length = 0;
  reactionWarms.clear();
  warmupComplete = false;
  metrics.cacheHits = 0;
  metrics.cacheMisses = 0;
}
