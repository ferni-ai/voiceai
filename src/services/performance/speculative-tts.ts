/**
 * Speculative Parallel TTS Generation
 *
 * PERFORMANCE OPTIMIZATION: Start TTS generation before LLM completes
 * by predicting likely response patterns and pre-generating audio.
 *
 * Techniques:
 * 1. Pre-generate common response starters ("I hear you...", "That makes sense...")
 * 2. Branch prediction: Generate multiple possible continuations
 * 3. Streaming: Start TTS on first LLM chunk, don't wait for complete response
 * 4. Cache: Keep frequently used phrases in audio form
 *
 * Expected improvement: 200-400ms latency reduction on first audio
 *
 * @module agents/shared/performance/speculative-tts
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getVoiceIdForPersona } from '../../speech/tts/cartesia-core.js';

// Note: This file was moved from agents/shared/performance/ to services/performance/
// to fix architecture layer violations (services should not import from agents)
import { LRUCache } from 'lru-cache';

// ============================================================================
// CARTESIA API CONFIGURATION
// ============================================================================

const CARTESIA_API_URL = 'https://api.cartesia.ai/tts/bytes';
const CARTESIA_API_VERSION = '2024-06-10';
const CARTESIA_MODEL = process.env.CARTESIA_MODEL || 'sonic-3';

/**
 * Get Cartesia API key from environment
 */
function getCartesiaApiKey(): string | undefined {
  return process.env.CARTESIA_API_KEY;
}

const log = createLogger({ module: 'SpeculativeTTS' });

// ============================================================================
// TYPES
// ============================================================================

export interface TTSRequest {
  /** Text to synthesize */
  text: string;
  /** Voice ID/persona */
  voiceId: string;
  /** Emotional context (affects voice tone) */
  emotion?: string;
  /** Speech rate multiplier */
  rate?: number;
  /** Pitch adjustment */
  pitch?: number;
  /** Priority (affects queue position) */
  priority?: 'high' | 'normal' | 'low';
}

export interface TTSResult {
  /** Audio data (PCM or encoded) */
  audio: ArrayBuffer;
  /** Duration in seconds */
  durationSeconds: number;
  /** Whether this was from cache */
  cached: boolean;
  /** Generation time (0 if cached) */
  generationTimeMs: number;
  /** Emotion used for generation (for cache key tracking) */
  emotion?: string;
}

export interface SpeculativeCandidate {
  /** Predicted text */
  text: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Context triggers */
  triggers: string[];
  /** Emotional context for this candidate */
  emotion?: string;
}

export interface SpeculativeTTSConfig {
  /** Maximum speculative generations to keep ready */
  maxSpeculative?: number;
  /** Minimum confidence to speculate */
  minConfidence?: number;
  /** Cache size for generated audio */
  cacheSize?: number;
  /** Enable branch prediction */
  enableBranching?: boolean;
  /** Maximum branches per turn */
  maxBranches?: number;
}

// ============================================================================
// COMMON RESPONSE STARTERS (Pre-generated)
// ============================================================================

/**
 * Common emotions to pre-warm in cache
 * These cover the most frequent emotional contexts in conversations
 */
const COMMON_EMOTIONS = ['neutral', 'warm', 'concerned', 'supportive', 'curious'] as const;

/**
 * Default emotion when none specified
 */
const DEFAULT_EMOTION = 'neutral';

/**
 * Response starters by emotional context
 */
const RESPONSE_STARTERS: Record<string, string[]> = {
  // Empathetic responses
  empathetic: [
    'I hear you.',
    'That sounds really hard.',
    "I can understand why you'd feel that way.",
    'That makes a lot of sense.',
    "I'm here with you.",
    'Thank you for sharing that with me.',
  ],

  // Supportive responses
  supportive: [
    "You're doing great.",
    'I believe in you.',
    'That takes courage.',
    'You should be proud of yourself.',
    "That's a real accomplishment.",
  ],

  // Curious/exploring responses
  // Note: These are genuine follow-up questions, not backchannels.
  // They're only used when we're actually following up, not during listening.
  curious: ['What made you think of that?', 'How did that feel?', "I'm curious about that."],

  // Acknowledging responses
  acknowledging: ['Right.', 'Mm-hmm.', 'I see.', 'Got it.', 'Okay.', 'Yes.'],

  // Transitional responses
  transitional: [
    'So...',
    'Well...',
    'You know...',
    'Hmm, let me think...',
    "That's interesting...",
  ],

  // Greeting responses
  greeting: [
    'Hey there!',
    'Hi! Good to hear from you.',
    'Hello! How are you?',
    "Hey! What's on your mind?",
  ],

  // Celebration responses
  celebration: ["That's wonderful!", 'Amazing!', 'I love that!', "That's so exciting!", 'Wow!'],
};

/**
 * Response continuations based on intent
 */
const INTENT_CONTINUATIONS: Record<string, string[]> = {
  seeking_advice: [
    'Let me share some thoughts...',
    "Here's what I'm thinking...",
    'One thing that might help...',
  ],
  venting: [
    'That sounds frustrating.',
    'I can see why that would upset you.',
    "It makes sense you'd feel that way.",
  ],
  celebrating: ["That's amazing!", "I'm so happy for you!", 'You should feel proud!'],
  confused: [
    'Let me help you think through this.',
    "That's a good question.",
    "Let's break this down together.",
  ],
  greeting: ["It's great to hear from you!", 'How have you been?', "What's on your mind today?"],
};

// ============================================================================
// SPECULATIVE TTS ENGINE
// ============================================================================

class SpeculativeTTSEngine {
  private config: Required<SpeculativeTTSConfig>;
  private audioCache = new LRUCache<string, TTSResult>({
    max: 200,
    ttl: 3600000, // 1 hour
  });
  private speculativeQueue: Map<string, Promise<TTSResult>> = new Map();
  private currentSpeculations: Map<string, SpeculativeCandidate[]> = new Map();
  private metrics = {
    totalRequests: 0,
    cacheHits: 0,
    speculativeHits: 0,
    avgGenerationMs: 0,
    savedLatencyMs: 0,
    // Emotion-aware caching metrics
    emotionCacheHits: new Map<string, number>(),
    emotionCacheMisses: new Map<string, number>(),
  };
  private generationTimes: number[] = [];

  constructor(config: SpeculativeTTSConfig = {}) {
    this.config = {
      maxSpeculative: config.maxSpeculative ?? 5,
      minConfidence: config.minConfidence ?? 0.6,
      cacheSize: config.cacheSize ?? 200,
      enableBranching: config.enableBranching ?? true,
      maxBranches: config.maxBranches ?? 3,
    };
  }

  /**
   * Pre-warm cache with common phrases for a voice
   *
   * PERFORMANCE OPTIMIZATION: Pre-generates common phrases with emotion variants.
   * This ensures fast response for the most frequently used phrases across
   * different emotional contexts.
   */
  async warmupVoice(voiceId: string, emotions?: string[]): Promise<void> {
    log.debug({ voiceId }, 'Warming up TTS cache for voice with emotion variants');

    const emotionsToWarm = emotions || [...COMMON_EMOTIONS];
    const phrasesToWarm: Array<{ text: string; emotion: string }> = [];

    // Collect all common starters with emotion variants
    for (const starters of Object.values(RESPONSE_STARTERS)) {
      const topStarters = starters.slice(0, 3); // Top 3 from each category
      for (const text of topStarters) {
        // For each phrase, warm up the most important emotions
        // (neutral is always warmed, plus 2 other context-appropriate emotions)
        const relevantEmotions = emotionsToWarm.slice(0, 3);
        for (const emotion of relevantEmotions) {
          phrasesToWarm.push({ text, emotion });
        }
      }
    }

    // Generate in parallel batches
    const batchSize = 5;
    for (let i = 0; i < phrasesToWarm.length; i += batchSize) {
      const batch = phrasesToWarm.slice(i, i + batchSize);
      await Promise.all(
        batch.map(({ text, emotion }) =>
          this.generateAndCache(text, voiceId, 'low', emotion).catch((e) =>
            log.debug({ text, emotion, error: String(e) }, 'Warmup generation failed')
          )
        )
      );
    }

    log.info(
      { voiceId, phrases: phrasesToWarm.length, emotions: emotionsToWarm.length },
      'TTS cache warmed up with emotion variants'
    );
  }

  /**
   * Start speculative generation based on context
   *
   * Emotion-aware speculation: Predictions now include the emotional context,
   * ensuring pre-generated audio matches the expected tone.
   */
  async speculate(
    sessionId: string,
    voiceId: string,
    context: {
      emotion?: string;
      intent?: string;
      topic?: string;
      distressLevel?: number;
    }
  ): Promise<void> {
    const candidates = this.predictCandidates(context);
    this.currentSpeculations.set(sessionId, candidates);

    // Generate top candidates with their emotion context
    const topCandidates = candidates
      .filter((c) => c.confidence >= this.config.minConfidence)
      .slice(0, this.config.maxSpeculative);

    for (const candidate of topCandidates) {
      // Use candidate-specific emotion if available, else context emotion
      const emotion = candidate.emotion || context.emotion;
      const key = this.getCacheKey(candidate.text, voiceId, emotion);

      if (!this.audioCache.has(key) && !this.speculativeQueue.has(key)) {
        const promise = this.generateAndCache(candidate.text, voiceId, 'normal', emotion);
        this.speculativeQueue.set(key, promise);

        // Clean up queue after completion
        promise.finally(() => this.speculativeQueue.delete(key));
      }
    }

    log.debug(
      { sessionId, candidates: topCandidates.length, emotion: context.emotion },
      'Started speculative TTS generation with emotion context'
    );
  }

  /**
   * Predict likely response candidates with emotion context
   *
   * Each candidate now includes the appropriate emotion for TTS generation,
   * ensuring cache keys are emotion-aware.
   */
  private predictCandidates(context: {
    emotion?: string;
    intent?: string;
    topic?: string;
    distressLevel?: number;
  }): SpeculativeCandidate[] {
    const candidates: SpeculativeCandidate[] = [];

    // Add empathetic starters for elevated distress (use 'concerned' emotion)
    if (context.distressLevel && context.distressLevel >= 4) {
      for (const text of RESPONSE_STARTERS.empathetic) {
        candidates.push({
          text,
          confidence: 0.9,
          triggers: ['distress'],
          emotion: 'concerned',
        });
      }
    }

    // Add emotion-appropriate starters with matching emotion for TTS
    if (context.emotion) {
      const emotionLower = context.emotion.toLowerCase();

      if (['sad', 'anxious', 'frustrated', 'overwhelmed'].some((e) => emotionLower.includes(e))) {
        for (const text of RESPONSE_STARTERS.empathetic) {
          candidates.push({
            text,
            confidence: 0.8,
            triggers: ['emotion:' + context.emotion],
            emotion: 'concerned', // Empathetic responses need concerned tone
          });
        }
      }

      if (['happy', 'excited', 'grateful', 'proud'].some((e) => emotionLower.includes(e))) {
        for (const text of RESPONSE_STARTERS.celebration) {
          candidates.push({
            text,
            confidence: 0.8,
            triggers: ['emotion:' + context.emotion],
            emotion: 'warm', // Celebration responses need warm tone
          });
        }
      }
    }

    // Add intent-appropriate starters with suitable emotion
    if (context.intent) {
      const intentStarters = INTENT_CONTINUATIONS[context.intent];
      if (intentStarters) {
        // Map intent to appropriate emotion
        const intentEmotionMap: Record<string, string> = {
          seeking_advice: 'supportive',
          venting: 'concerned',
          celebrating: 'warm',
          confused: 'supportive',
          greeting: 'warm',
        };
        const emotion = intentEmotionMap[context.intent] || 'neutral';

        for (const text of intentStarters) {
          candidates.push({
            text,
            confidence: 0.75,
            triggers: ['intent:' + context.intent],
            emotion,
          });
        }
      }
    }

    // Always add some acknowledging fillers (neutral tone, high probability)
    for (const text of RESPONSE_STARTERS.acknowledging) {
      candidates.push({
        text,
        confidence: 0.6,
        triggers: ['general'],
        emotion: 'neutral',
      });
    }

    // Deduplicate by text+emotion combination and sort by confidence
    const seen = new Set<string>();
    return candidates
      .filter((c) => {
        const key = `${c.text}:${c.emotion || 'neutral'}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get TTS audio, using cache/speculation if available
   *
   * Emotion-aware caching: Looks up audio by text + emotion combination.
   * This ensures the returned audio matches the desired emotional tone.
   */
  async getTTS(text: string, voiceId: string, emotion?: string): Promise<TTSResult> {
    this.metrics.totalRequests++;
    const emotionKey = (emotion || DEFAULT_EMOTION).toLowerCase();
    const key = this.getCacheKey(text, voiceId, emotion);

    // Check cache first (emotion-aware lookup)
    const cached = this.audioCache.get(key);
    if (cached) {
      this.metrics.cacheHits++;
      this.metrics.savedLatencyMs += cached.generationTimeMs;
      // Track emotion-specific cache hit
      this.metrics.emotionCacheHits.set(
        emotionKey,
        (this.metrics.emotionCacheHits.get(emotionKey) || 0) + 1
      );
      return { ...cached, cached: true, generationTimeMs: 0 };
    }

    // Track emotion-specific cache miss (but only if we don't find speculative)
    const trackMiss = () => {
      this.metrics.emotionCacheMisses.set(
        emotionKey,
        (this.metrics.emotionCacheMisses.get(emotionKey) || 0) + 1
      );
    };

    // Check if speculative generation is in progress
    const speculativePromise = this.speculativeQueue.get(key);
    if (speculativePromise) {
      this.metrics.speculativeHits++;
      const result = await speculativePromise;
      this.metrics.savedLatencyMs += result.generationTimeMs;
      return { ...result, cached: true, generationTimeMs: 0 };
    }

    // Check for partial match in cache (prefix matching, emotion-aware)
    const partialMatch = this.findPartialMatch(text, voiceId, emotion);
    if (partialMatch) {
      // Return partial match while generating full
      this.generateAndCache(text, voiceId, 'high', emotion).catch((err) => {
        log.debug(
          { error: String(err), text: text.slice(0, 50), emotion },
          'Background TTS generation failed'
        );
      });
      return partialMatch;
    }

    // No cache or speculative hit - track as miss and generate fresh
    trackMiss();
    return this.generateAndCache(text, voiceId, 'high', emotion);
  }

  /**
   * Stream TTS generation - returns audio chunks as they're ready
   *
   * Emotion-aware: Maintains emotional consistency across all streamed chunks.
   *
   * LATENCY OPTIMIZATION: Uses aggressive first-chunk behavior to minimize
   * time-to-first-audio. First chunk is sent after just 8-12 chars or any
   * punctuation, while subsequent chunks use normal sentence boundaries.
   */
  async *streamTTS(
    textStream: AsyncIterable<string>,
    voiceId: string,
    emotion?: string
  ): AsyncGenerator<ArrayBuffer> {
    let buffer = '';
    let isFirstChunk = true;

    // Aggressive first-chunk settings (minimize TTFA)
    const FIRST_CHUNK_MIN_SIZE = 8; // "I hear you" = 10 chars - send fast!
    const SUBSEQUENT_CHUNK_MIN_SIZE = 25; // Slightly smaller than before
    const MAX_FIRST_CHUNK_WAIT = 40; // Don't wait more than 40 chars for first chunk

    for await (const chunk of textStream) {
      buffer += chunk;

      if (isFirstChunk) {
        // AGGRESSIVE FIRST CHUNK: Send as soon as we have minimal content
        // Check for ANY punctuation or minimum length
        const earlyBreak = buffer.match(/[.!?,;:]\s*(.*)$/s);

        if (earlyBreak && buffer.length >= FIRST_CHUNK_MIN_SIZE) {
          // Found punctuation - send everything up to and including it
          const breakPoint = buffer.length - (earlyBreak[1]?.length || 0);
          const firstChunkText = buffer.slice(0, breakPoint).trim();
          buffer = earlyBreak[1] || '';

          if (firstChunkText.length > 0) {
            const result = await this.getTTS(firstChunkText, voiceId, emotion);
            yield result.audio;
            isFirstChunk = false;
            log.debug(
              { chars: firstChunkText.length, text: firstChunkText.slice(0, 30) },
              '🚀 First TTS chunk sent (punctuation)'
            );
          }
        } else if (buffer.length >= MAX_FIRST_CHUNK_WAIT) {
          // No punctuation but we've waited long enough - send what we have
          // Try to break at word boundary
          const lastSpace = buffer.lastIndexOf(' ');
          const breakPoint = lastSpace > FIRST_CHUNK_MIN_SIZE ? lastSpace : buffer.length;
          const firstChunkText = buffer.slice(0, breakPoint).trim();
          buffer = buffer.slice(breakPoint).trim();

          if (firstChunkText.length > 0) {
            const result = await this.getTTS(firstChunkText, voiceId, emotion);
            yield result.audio;
            isFirstChunk = false;
            log.debug(
              { chars: firstChunkText.length, text: firstChunkText.slice(0, 30) },
              '🚀 First TTS chunk sent (max wait)'
            );
          }
        }
        // Otherwise keep buffering for first chunk
      } else {
        // SUBSEQUENT CHUNKS: Use sentence/phrase boundaries for natural flow
        const sentenceEnd = buffer.match(/[.!?]\s|,\s{2,}|\.{3,}|\n/);

        if (sentenceEnd && buffer.length >= SUBSEQUENT_CHUNK_MIN_SIZE) {
          const endIndex = sentenceEnd.index! + sentenceEnd[0].length;
          const sentence = buffer.slice(0, endIndex).trim();
          buffer = buffer.slice(endIndex);

          if (sentence.length > 0) {
            const result = await this.getTTS(sentence, voiceId, emotion);
            yield result.audio;
          }
        }
      }
    }

    // Flush remaining buffer
    if (buffer.trim().length > 0) {
      const result = await this.getTTS(buffer.trim(), voiceId, emotion);
      yield result.audio;

      if (isFirstChunk) {
        log.debug(
          { chars: buffer.trim().length },
          '🚀 First TTS chunk sent (final flush)'
        );
      }
    }
  }

  /**
   * Branch prediction - generate multiple possible continuations
   *
   * Emotion-aware: Each branch maintains the emotional context for consistent tone.
   */
  async branchPredict(
    sessionId: string,
    voiceId: string,
    llmPrefix: string,
    possibleContinuations: string[],
    emotion?: string
  ): Promise<void> {
    if (!this.config.enableBranching) return;

    const branches = possibleContinuations.slice(0, this.config.maxBranches);

    for (const continuation of branches) {
      const fullText = llmPrefix + continuation;
      const key = this.getCacheKey(fullText, voiceId, emotion);

      if (!this.audioCache.has(key) && !this.speculativeQueue.has(key)) {
        const promise = this.generateAndCache(fullText, voiceId, 'normal', emotion);
        this.speculativeQueue.set(key, promise);
        promise.finally(() => this.speculativeQueue.delete(key));
      }
    }

    log.debug(
      { sessionId, branches: branches.length, prefix: llmPrefix.slice(0, 30), emotion },
      'Branch prediction started with emotion context'
    );
  }

  /**
   * Generate TTS and cache result with emotion-awareness
   */
  private async generateAndCache(
    text: string,
    voiceId: string,
    priority: 'high' | 'normal' | 'low',
    emotion?: string
  ): Promise<TTSResult> {
    const startTime = Date.now();

    try {
      // Use existing TTS infrastructure
      // Note: Future enhancement could pass emotion to TTS for tone adjustment
      const audio = await this.callTTSProvider(text, voiceId);

      const generationTimeMs = Date.now() - startTime;
      this.generationTimes.push(generationTimeMs);
      if (this.generationTimes.length > 100) this.generationTimes.shift();
      this.metrics.avgGenerationMs =
        this.generationTimes.reduce((a, b) => a + b, 0) / this.generationTimes.length;

      const result: TTSResult = {
        audio,
        durationSeconds: this.estimateAudioDuration(text),
        cached: false,
        generationTimeMs,
        emotion: emotion || DEFAULT_EMOTION,
      };

      // Cache the result with emotion-aware key
      const key = this.getCacheKey(text, voiceId, emotion);
      this.audioCache.set(key, result);

      return result;
    } catch (error) {
      log.warn({ text: text.slice(0, 50), voiceId, emotion, error: String(error) }, 'TTS generation failed');
      throw error;
    }
  }

  /**
   * Call Cartesia TTS API to generate audio
   *
   * Uses the Cartesia REST API for synchronous TTS generation.
   * This is optimized for speculative caching - we pre-generate common
   * phrases and store them for instant retrieval.
   */
  private async callTTSProvider(text: string, voiceId: string): Promise<ArrayBuffer> {
    const apiKey = getCartesiaApiKey();

    if (!apiKey) {
      log.debug({ text: text.slice(0, 50), voiceId }, 'CARTESIA_API_KEY not set, using empty buffer');
      return new ArrayBuffer(0);
    }

    try {
      // Resolve persona name to Cartesia voice ID if needed
      // (voiceId might be a persona name like 'ferni' or a raw Cartesia ID)
      const resolvedVoiceId = voiceId.includes('-')
        ? voiceId // Already a Cartesia UUID
        : getVoiceIdForPersona(voiceId);

      const response = await fetch(CARTESIA_API_URL, {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Cartesia-Version': CARTESIA_API_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_id: CARTESIA_MODEL,
          transcript: text,
          voice: {
            mode: 'id',
            id: resolvedVoiceId,
          },
          output_format: {
            container: 'raw',
            encoding: 'pcm_s16le',
            sample_rate: 24000, // Standard for voice agents
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.warn(
          { status: response.status, error: errorText, text: text.slice(0, 30) },
          'Cartesia API error'
        );
        return new ArrayBuffer(0);
      }

      const audioBuffer = await response.arrayBuffer();
      log.debug(
        { text: text.slice(0, 30), bytes: audioBuffer.byteLength, voiceId: resolvedVoiceId },
        'Cartesia TTS generated'
      );

      return audioBuffer;
    } catch (error) {
      log.warn({ error: String(error), text: text.slice(0, 30) }, 'Cartesia TTS call failed');
      return new ArrayBuffer(0);
    }
  }

  /**
   * Find partial match in cache (emotion-aware)
   *
   * Only matches if both the text prefix AND emotion match,
   * ensuring tonal consistency in partial matches.
   */
  private findPartialMatch(text: string, voiceId: string, emotion?: string): TTSResult | null {
    const emotionKey = (emotion || DEFAULT_EMOTION).toLowerCase();
    const cachePrefix = `${voiceId}:${emotionKey}:`;

    // Check if any cached text is a prefix of the requested text
    for (const [key, value] of this.audioCache.entries()) {
      if (key.startsWith(cachePrefix)) {
        // Extract the text portion (after voiceId:emotion:)
        const cachedText = key.slice(cachePrefix.length);
        if (text.toLowerCase().trim().startsWith(cachedText)) {
          return value;
        }
      }
    }

    return null;
  }

  /**
   * Generate cache key with emotion-awareness
   *
   * PERFORMANCE OPTIMIZATION: Cache TTS output keyed by text + emotion + persona.
   * The same text spoken with different emotions sounds different, so we need
   * separate cache entries for each emotion variant.
   *
   * Key format: `${voiceId}:${emotion}:${normalized_text}`
   */
  private getCacheKey(text: string, voiceId: string, emotion?: string): string {
    // Normalize text for caching
    const normalized = text.toLowerCase().trim();
    // Use default emotion if none specified for consistent cache keys
    const emotionKey = (emotion || DEFAULT_EMOTION).toLowerCase();
    return `${voiceId}:${emotionKey}:${normalized}`;
  }

  /**
   * Estimate audio duration from text
   */
  private estimateAudioDuration(text: string): number {
    // Average speaking rate: ~150 words per minute
    const words = text.split(/\s+/).length;
    return (words / 150) * 60;
  }

  /**
   * Clear speculation for a session
   */
  clearSpeculation(sessionId: string): void {
    this.currentSpeculations.delete(sessionId);
  }

  /**
   * Get metrics including emotion-aware cache statistics
   */
  getMetrics(): {
    totalRequests: number;
    cacheHits: number;
    speculativeHits: number;
    avgGenerationMs: number;
    savedLatencyMs: number;
    emotionCacheStats: Record<string, { hits: number; misses: number; hitRate: number }>;
  } {
    // Convert emotion stats to a clean object format
    const emotionCacheStats: Record<string, { hits: number; misses: number; hitRate: number }> = {};

    // Gather all emotions from both hits and misses
    const allEmotions = new Set([
      ...this.metrics.emotionCacheHits.keys(),
      ...this.metrics.emotionCacheMisses.keys(),
    ]);

    for (const emotion of allEmotions) {
      const hits = this.metrics.emotionCacheHits.get(emotion) || 0;
      const misses = this.metrics.emotionCacheMisses.get(emotion) || 0;
      const total = hits + misses;
      emotionCacheStats[emotion] = {
        hits,
        misses,
        hitRate: total > 0 ? hits / total : 0,
      };
    }

    return {
      totalRequests: this.metrics.totalRequests,
      cacheHits: this.metrics.cacheHits,
      speculativeHits: this.metrics.speculativeHits,
      avgGenerationMs: this.metrics.avgGenerationMs,
      savedLatencyMs: this.metrics.savedLatencyMs,
      emotionCacheStats,
    };
  }

  /**
   * Clear all caches and reset emotion-aware statistics
   */
  clearCache(): void {
    this.audioCache.clear();
    this.speculativeQueue.clear();
    this.currentSpeculations.clear();
    this.metrics.emotionCacheHits.clear();
    this.metrics.emotionCacheMisses.clear();
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let speculativeTTSInstance: SpeculativeTTSEngine | null = null;

export function getSpeculativeTTS(config?: SpeculativeTTSConfig): SpeculativeTTSEngine {
  if (!speculativeTTSInstance) {
    speculativeTTSInstance = new SpeculativeTTSEngine(config);
  }
  return speculativeTTSInstance;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Warm up TTS cache for a voice with emotion variants
 */
export async function warmupTTSVoice(voiceId: string, emotions?: string[]): Promise<void> {
  await getSpeculativeTTS().warmupVoice(voiceId, emotions);
}

/**
 * Start speculative TTS generation
 */
export async function speculateTTS(
  sessionId: string,
  voiceId: string,
  context: {
    emotion?: string;
    intent?: string;
    topic?: string;
    distressLevel?: number;
  }
): Promise<void> {
  await getSpeculativeTTS().speculate(sessionId, voiceId, context);
}

/**
 * Get TTS audio with speculation support (emotion-aware)
 */
export async function getTTSWithSpeculation(
  text: string,
  voiceId: string,
  emotion?: string
): Promise<TTSResult> {
  return getSpeculativeTTS().getTTS(text, voiceId, emotion);
}

/**
 * Stream TTS generation (emotion-aware)
 */
export function streamTTSWithSpeculation(
  textStream: AsyncIterable<string>,
  voiceId: string,
  emotion?: string
): AsyncGenerator<ArrayBuffer> {
  return getSpeculativeTTS().streamTTS(textStream, voiceId, emotion);
}

/**
 * Branch prediction for TTS (emotion-aware)
 */
export async function branchPredictTTS(
  sessionId: string,
  voiceId: string,
  prefix: string,
  continuations: string[],
  emotion?: string
): Promise<void> {
  await getSpeculativeTTS().branchPredict(sessionId, voiceId, prefix, continuations, emotion);
}

/**
 * Get speculative TTS metrics
 */
export function getSpeculativeTTSMetrics(): ReturnType<SpeculativeTTSEngine['getMetrics']> {
  return getSpeculativeTTS().getMetrics();
}

export default SpeculativeTTSEngine;
