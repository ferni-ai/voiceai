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
}

export interface SpeculativeCandidate {
  /** Predicted text */
  text: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Context triggers */
  triggers: string[];
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
   */
  async warmupVoice(voiceId: string): Promise<void> {
    log.debug({ voiceId }, 'Warming up TTS cache for voice');

    const phrasesToWarm: string[] = [];

    // Collect all common starters
    for (const starters of Object.values(RESPONSE_STARTERS)) {
      phrasesToWarm.push(...starters.slice(0, 3)); // Top 3 from each category
    }

    // Generate in parallel batches
    const batchSize = 5;
    for (let i = 0; i < phrasesToWarm.length; i += batchSize) {
      const batch = phrasesToWarm.slice(i, i + batchSize);
      await Promise.all(
        batch.map((text) =>
          this.generateAndCache(text, voiceId, 'low').catch((e) =>
            log.debug({ text, error: String(e) }, 'Warmup generation failed')
          )
        )
      );
    }

    log.info({ voiceId, phrases: phrasesToWarm.length }, 'TTS cache warmed up');
  }

  /**
   * Start speculative generation based on context
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

    // Generate top candidates
    const topCandidates = candidates
      .filter((c) => c.confidence >= this.config.minConfidence)
      .slice(0, this.config.maxSpeculative);

    for (const candidate of topCandidates) {
      const key = this.getCacheKey(candidate.text, voiceId);

      if (!this.audioCache.has(key) && !this.speculativeQueue.has(key)) {
        const promise = this.generateAndCache(candidate.text, voiceId, 'normal');
        this.speculativeQueue.set(key, promise);

        // Clean up queue after completion
        promise.finally(() => this.speculativeQueue.delete(key));
      }
    }

    log.debug(
      { sessionId, candidates: topCandidates.length },
      'Started speculative TTS generation'
    );
  }

  /**
   * Predict likely response candidates
   */
  private predictCandidates(context: {
    emotion?: string;
    intent?: string;
    topic?: string;
    distressLevel?: number;
  }): SpeculativeCandidate[] {
    const candidates: SpeculativeCandidate[] = [];

    // Add empathetic starters for elevated distress
    if (context.distressLevel && context.distressLevel >= 4) {
      for (const text of RESPONSE_STARTERS.empathetic) {
        candidates.push({
          text,
          confidence: 0.9,
          triggers: ['distress'],
        });
      }
    }

    // Add emotion-appropriate starters
    if (context.emotion) {
      const emotionLower = context.emotion.toLowerCase();

      if (['sad', 'anxious', 'frustrated', 'overwhelmed'].some((e) => emotionLower.includes(e))) {
        for (const text of RESPONSE_STARTERS.empathetic) {
          candidates.push({
            text,
            confidence: 0.8,
            triggers: ['emotion:' + context.emotion],
          });
        }
      }

      if (['happy', 'excited', 'grateful', 'proud'].some((e) => emotionLower.includes(e))) {
        for (const text of RESPONSE_STARTERS.celebration) {
          candidates.push({
            text,
            confidence: 0.8,
            triggers: ['emotion:' + context.emotion],
          });
        }
      }
    }

    // Add intent-appropriate starters
    if (context.intent) {
      const intentStarters = INTENT_CONTINUATIONS[context.intent];
      if (intentStarters) {
        for (const text of intentStarters) {
          candidates.push({
            text,
            confidence: 0.75,
            triggers: ['intent:' + context.intent],
          });
        }
      }
    }

    // Always add some acknowledging fillers (high probability)
    for (const text of RESPONSE_STARTERS.acknowledging) {
      candidates.push({
        text,
        confidence: 0.6,
        triggers: ['general'],
      });
    }

    // Deduplicate and sort by confidence
    const seen = new Set<string>();
    return candidates
      .filter((c) => {
        if (seen.has(c.text)) return false;
        seen.add(c.text);
        return true;
      })
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get TTS audio, using cache/speculation if available
   */
  async getTTS(text: string, voiceId: string): Promise<TTSResult> {
    this.metrics.totalRequests++;
    const key = this.getCacheKey(text, voiceId);

    // Check cache first
    const cached = this.audioCache.get(key);
    if (cached) {
      this.metrics.cacheHits++;
      this.metrics.savedLatencyMs += cached.generationTimeMs;
      return { ...cached, cached: true, generationTimeMs: 0 };
    }

    // Check if speculative generation is in progress
    const speculativePromise = this.speculativeQueue.get(key);
    if (speculativePromise) {
      this.metrics.speculativeHits++;
      const result = await speculativePromise;
      this.metrics.savedLatencyMs += result.generationTimeMs;
      return { ...result, cached: true, generationTimeMs: 0 };
    }

    // Check for partial match in cache (prefix matching)
    const partialMatch = this.findPartialMatch(text, voiceId);
    if (partialMatch) {
      // Return partial match while generating full
      this.generateAndCache(text, voiceId, 'high').catch((err) => {
        log.debug(
          { error: String(err), text: text.slice(0, 50) },
          'Background TTS generation failed'
        );
      });
      return partialMatch;
    }

    // Generate fresh
    return this.generateAndCache(text, voiceId, 'high');
  }

  /**
   * Stream TTS generation - returns audio chunks as they're ready
   */
  async *streamTTS(
    textStream: AsyncIterable<string>,
    voiceId: string
  ): AsyncGenerator<ArrayBuffer> {
    let buffer = '';
    const minChunkSize = 30; // Characters

    for await (const chunk of textStream) {
      buffer += chunk;

      // Check if we have enough for a sentence or pause
      const sentenceEnd = buffer.match(/[.!?]\s|,\s{2,}|\.{3,}|\n/);

      if (sentenceEnd && buffer.length >= minChunkSize) {
        const endIndex = sentenceEnd.index! + sentenceEnd[0].length;
        const sentence = buffer.slice(0, endIndex).trim();
        buffer = buffer.slice(endIndex);

        if (sentence.length > 0) {
          const result = await this.getTTS(sentence, voiceId);
          yield result.audio;
        }
      }
    }

    // Flush remaining buffer
    if (buffer.trim().length > 0) {
      const result = await this.getTTS(buffer.trim(), voiceId);
      yield result.audio;
    }
  }

  /**
   * Branch prediction - generate multiple possible continuations
   */
  async branchPredict(
    sessionId: string,
    voiceId: string,
    llmPrefix: string,
    possibleContinuations: string[]
  ): Promise<void> {
    if (!this.config.enableBranching) return;

    const branches = possibleContinuations.slice(0, this.config.maxBranches);

    for (const continuation of branches) {
      const fullText = llmPrefix + continuation;
      const key = this.getCacheKey(fullText, voiceId);

      if (!this.audioCache.has(key) && !this.speculativeQueue.has(key)) {
        const promise = this.generateAndCache(fullText, voiceId, 'normal');
        this.speculativeQueue.set(key, promise);
        promise.finally(() => this.speculativeQueue.delete(key));
      }
    }

    log.debug(
      { sessionId, branches: branches.length, prefix: llmPrefix.slice(0, 30) },
      'Branch prediction started'
    );
  }

  /**
   * Generate TTS and cache result
   */
  private async generateAndCache(
    text: string,
    voiceId: string,
    priority: 'high' | 'normal' | 'low'
  ): Promise<TTSResult> {
    const startTime = Date.now();

    try {
      // Use existing TTS infrastructure
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
      };

      // Cache the result
      const key = this.getCacheKey(text, voiceId);
      this.audioCache.set(key, result);

      return result;
    } catch (error) {
      log.warn({ text: text.slice(0, 50), voiceId, error: String(error) }, 'TTS generation failed');
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
   * Find partial match in cache
   */
  private findPartialMatch(text: string, voiceId: string): TTSResult | null {
    // Check if any cached text is a prefix of the requested text
    const prefix = text.slice(0, 50); // First 50 chars

    for (const [key, value] of this.audioCache.entries()) {
      if (key.startsWith(`${voiceId}:`) && text.startsWith(key.slice(voiceId.length + 1))) {
        return value;
      }
    }

    return null;
  }

  /**
   * Generate cache key
   */
  private getCacheKey(text: string, voiceId: string): string {
    // Normalize text for caching
    const normalized = text.toLowerCase().trim();
    return `${voiceId}:${normalized}`;
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
   * Get metrics
   */
  getMetrics(): typeof this.metrics {
    return { ...this.metrics };
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.audioCache.clear();
    this.speculativeQueue.clear();
    this.currentSpeculations.clear();
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
 * Warm up TTS cache for a voice
 */
export async function warmupTTSVoice(voiceId: string): Promise<void> {
  await getSpeculativeTTS().warmupVoice(voiceId);
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
 * Get TTS audio with speculation support
 */
export async function getTTSWithSpeculation(text: string, voiceId: string): Promise<TTSResult> {
  return getSpeculativeTTS().getTTS(text, voiceId);
}

/**
 * Stream TTS generation
 */
export function streamTTSWithSpeculation(
  textStream: AsyncIterable<string>,
  voiceId: string
): AsyncGenerator<ArrayBuffer> {
  return getSpeculativeTTS().streamTTS(textStream, voiceId);
}

/**
 * Branch prediction for TTS
 */
export async function branchPredictTTS(
  sessionId: string,
  voiceId: string,
  prefix: string,
  continuations: string[]
): Promise<void> {
  await getSpeculativeTTS().branchPredict(sessionId, voiceId, prefix, continuations);
}

/**
 * Get speculative TTS metrics
 */
export function getSpeculativeTTSMetrics(): ReturnType<SpeculativeTTSEngine['getMetrics']> {
  return getSpeculativeTTS().getMetrics();
}

export default SpeculativeTTSEngine;
