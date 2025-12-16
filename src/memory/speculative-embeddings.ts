/**
 * Speculative Embedding Pre-computation
 *
 * PERFORMANCE OPTIMIZATION: Pre-compute embeddings for common phrases,
 * greetings, and patterns that are frequently searched/compared.
 *
 * This saves 50-200ms per embedding call by having common vectors ready.
 *
 * Strategy:
 * 1. Pre-compute embeddings for greetings and common phrases at startup
 * 2. Cache user's recent query patterns for re-use
 * 3. Predict likely next queries based on conversation context
 *
 * @module memory/speculative-embeddings
 */

import { createLogger } from '../utils/safe-logger.js';
import { embed } from './embeddings.js';

const log = createLogger({ module: 'SpeculativeEmbeddings' });

// ============================================================================
// TYPES
// ============================================================================

export interface CachedEmbedding {
  text: string;
  embedding: number[];
  createdAt: number;
  accessCount: number;
  lastAccessedAt: number;
  category: 'greeting' | 'common' | 'user_pattern' | 'predicted';
}

export interface SpeculativeConfig {
  /** Maximum cached embeddings (default: 500) */
  maxCacheSize?: number;
  /** TTL for user patterns in ms (default: 1 hour) */
  userPatternTtlMs?: number;
  /** TTL for predicted embeddings in ms (default: 5 min) */
  predictedTtlMs?: number;
  /** Enable background pre-computation (default: true) */
  enableBackgroundPrecompute?: boolean;
}

export interface SpeculativeMetrics {
  cacheSize: number;
  hits: number;
  misses: number;
  hitRate: number;
  precomputedCount: number;
  userPatternCount: number;
  avgLookupTimeMs: number;
}

// ============================================================================
// COMMON PHRASES TO PRE-COMPUTE
// ============================================================================

/**
 * Greetings and session start phrases
 */
const GREETING_PHRASES = [
  'hello',
  'hi',
  'hey',
  "how's it going",
  "what's up",
  'good morning',
  'good afternoon',
  'good evening',
  "i'm back",
  "it's me again",
  'hey ferni',
  'hi ferni',
  'hello ferni',
];

/**
 * Common emotional expressions
 */
const EMOTIONAL_PHRASES = [
  "i'm feeling stressed",
  "i'm anxious",
  "i'm worried",
  "i'm sad",
  "i'm happy",
  "i'm excited",
  "i'm frustrated",
  "i'm overwhelmed",
  "i'm tired",
  "i'm confused",
  "i don't know what to do",
  'i need help',
  "i'm not sure",
  'i feel stuck',
  'things are going well',
  'things are tough',
  'i had a good day',
  'i had a bad day',
];

/**
 * Common topic phrases
 */
const TOPIC_PHRASES = [
  'work',
  'job',
  'career',
  'family',
  'relationship',
  'health',
  'fitness',
  'sleep',
  'stress',
  'anxiety',
  'money',
  'finances',
  'goals',
  'habits',
  'productivity',
  'time management',
  'exercise',
  'diet',
  'meditation',
  'mindfulness',
];

/**
 * Common question patterns
 */
const QUESTION_PATTERNS = [
  'what should i do',
  'how do i',
  'can you help me',
  'i want to',
  'i need to',
  "i'm trying to",
  'what do you think',
  "i'm not sure if",
  'should i',
  'can i',
];

/**
 * Farewell phrases
 */
const FAREWELL_PHRASES = [
  'goodbye',
  'bye',
  'see you later',
  'talk to you later',
  'thanks',
  'thank you',
  'that was helpful',
  'gotta go',
  "i'll be back",
  'goodnight',
];

// ============================================================================
// SPECULATIVE EMBEDDING CACHE
// ============================================================================

class SpeculativeEmbeddingCache {
  private cache = new Map<string, CachedEmbedding>();
  private config: Required<SpeculativeConfig>;
  private metrics = {
    hits: 0,
    misses: 0,
    lookupTimes: [] as number[],
  };
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(config: SpeculativeConfig = {}) {
    this.config = {
      maxCacheSize: config.maxCacheSize ?? 500,
      userPatternTtlMs: config.userPatternTtlMs ?? 60 * 60 * 1000, // 1 hour
      predictedTtlMs: config.predictedTtlMs ?? 5 * 60 * 1000, // 5 min
      enableBackgroundPrecompute: config.enableBackgroundPrecompute ?? true,
    };
  }

  /**
   * Initialize cache with pre-computed embeddings
   * Call this at startup (non-blocking)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    const startTime = Date.now();
    log.debug('Initializing speculative embedding cache...');

    // Collect all phrases to pre-compute
    const allPhrases = [
      ...GREETING_PHRASES.map((p) => ({ text: p, category: 'greeting' as const })),
      ...EMOTIONAL_PHRASES.map((p) => ({ text: p, category: 'common' as const })),
      ...TOPIC_PHRASES.map((p) => ({ text: p, category: 'common' as const })),
      ...QUESTION_PATTERNS.map((p) => ({ text: p, category: 'common' as const })),
      ...FAREWELL_PHRASES.map((p) => ({ text: p, category: 'greeting' as const })),
    ];

    // Pre-compute in batches of 10 to avoid rate limiting
    const batchSize = 10;
    let computed = 0;
    let failed = 0;

    for (let i = 0; i < allPhrases.length; i += batchSize) {
      const batch = allPhrases.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async ({ text, category }) => {
          try {
            const embedding = await embed(text);
            this.setCached(text, embedding, category);
            computed++;
          } catch (error) {
            failed++;
            // Don't log every failure, just track count
          }
        })
      );

      // Small delay between batches to avoid rate limits
      if (i + batchSize < allPhrases.length) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 50);
        });
      }
    }

    this.initialized = true;
    const durationMs = Date.now() - startTime;

    log.info(
      {
        computed,
        failed,
        durationMs,
        cacheSize: this.cache.size,
      },
      '✅ Speculative embeddings initialized'
    );
  }

  /**
   * Get embedding with cache-first strategy
   * Returns cached embedding if available, otherwise generates and caches
   */
  async get(text: string): Promise<number[]> {
    const startTime = Date.now();
    const normalizedText = this.normalizeText(text);

    // Check cache
    const cached = this.cache.get(normalizedText);
    if (cached && !this.isExpired(cached)) {
      cached.accessCount++;
      cached.lastAccessedAt = Date.now();
      this.metrics.hits++;
      this.recordLookupTime(Date.now() - startTime);
      return cached.embedding;
    }

    // Cache miss - generate embedding
    this.metrics.misses++;

    try {
      const embedding = await embed(text);

      // Cache the result
      this.setCached(normalizedText, embedding, 'user_pattern');

      this.recordLookupTime(Date.now() - startTime);
      return embedding;
    } catch (error) {
      log.warn({ error: String(error), text: text.slice(0, 50) }, 'Embedding generation failed');
      throw error;
    }
  }

  /**
   * Get embedding if cached, otherwise return null (no generation)
   * Use this for fast lookups where you want to avoid API calls
   */
  getCached(text: string): number[] | null {
    const normalizedText = this.normalizeText(text);
    const cached = this.cache.get(normalizedText);

    if (cached && !this.isExpired(cached)) {
      cached.accessCount++;
      cached.lastAccessedAt = Date.now();
      this.metrics.hits++;
      return cached.embedding;
    }

    this.metrics.misses++;
    return null;
  }

  /**
   * Pre-compute embedding for a predicted query
   * Call this when you anticipate a query might be asked
   */
  async precompute(text: string): Promise<void> {
    const normalizedText = this.normalizeText(text);

    // Skip if already cached
    if (this.cache.has(normalizedText)) return;

    try {
      const embedding = await embed(text);
      this.setCached(normalizedText, embedding, 'predicted');
    } catch (error) {
      // Precompute failures are non-critical
      log.debug({ error: String(error) }, 'Precompute embedding failed');
    }
  }

  /**
   * Pre-compute multiple embeddings in parallel
   */
  async precomputeBatch(texts: string[]): Promise<number> {
    const toCompute = texts.filter((text) => {
      const normalized = this.normalizeText(text);
      return !this.cache.has(normalized);
    });

    if (toCompute.length === 0) return 0;

    let computed = 0;
    await Promise.all(
      toCompute.map(async (text) => {
        try {
          await this.precompute(text);
          computed++;
        } catch {
          // Ignore individual failures
        }
      })
    );

    return computed;
  }

  /**
   * Predict and pre-compute likely next queries based on context
   */
  async predictAndPrecompute(context: {
    lastUserMessage?: string;
    currentTopic?: string;
    emotion?: string;
  }): Promise<void> {
    if (!this.config.enableBackgroundPrecompute) return;

    const predictions: string[] = [];

    // If discussing a topic, pre-compute related queries
    if (context.currentTopic) {
      predictions.push(
        `more about ${context.currentTopic}`,
        `help with ${context.currentTopic}`,
        `${context.currentTopic} advice`,
        `${context.currentTopic} tips`
      );
    }

    // If emotional, pre-compute related queries
    if (context.emotion) {
      predictions.push(
        `feeling ${context.emotion}`,
        `dealing with ${context.emotion}`,
        `${context.emotion} about`,
        `help with ${context.emotion}`
      );
    }

    // Pre-compute in background (don't await)
    if (predictions.length > 0) {
      void this.precomputeBatch(predictions);
    }
  }

  /**
   * Record a user's query pattern for future caching
   */
  recordUserPattern(userId: string, query: string): void {
    const normalizedText = this.normalizeText(query);

    // If we already have this embedding, just update access time
    const existing = this.cache.get(normalizedText);
    if (existing) {
      existing.accessCount++;
      existing.lastAccessedAt = Date.now();
      return;
    }

    // Pre-compute in background
    void this.precompute(query);
  }

  /**
   * Get metrics
   */
  getMetrics(): SpeculativeMetrics {
    const avgLookupTimeMs =
      this.metrics.lookupTimes.length > 0
        ? this.metrics.lookupTimes.reduce((a, b) => a + b, 0) / this.metrics.lookupTimes.length
        : 0;

    const total = this.metrics.hits + this.metrics.misses;
    const hitRate = total > 0 ? this.metrics.hits / total : 0;

    let precomputedCount = 0;
    let userPatternCount = 0;

    for (const entry of this.cache.values()) {
      if (entry.category === 'greeting' || entry.category === 'common') {
        precomputedCount++;
      } else if (entry.category === 'user_pattern') {
        userPatternCount++;
      }
    }

    return {
      cacheSize: this.cache.size,
      hits: this.metrics.hits,
      misses: this.metrics.misses,
      hitRate,
      precomputedCount,
      userPatternCount,
      avgLookupTimeMs,
    };
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.cache.clear();
    this.metrics.hits = 0;
    this.metrics.misses = 0;
    this.metrics.lookupTimes = [];
    this.initialized = false;
    this.initPromise = null;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private normalizeText(text: string): string {
    return text.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  private setCached(
    text: string,
    embedding: number[],
    category: CachedEmbedding['category']
  ): void {
    // Evict if at capacity
    if (this.cache.size >= this.config.maxCacheSize) {
      this.evictLRU();
    }

    const now = Date.now();
    this.cache.set(text, {
      text,
      embedding,
      category,
      createdAt: now,
      accessCount: 1,
      lastAccessedAt: now,
    });
  }

  private isExpired(entry: CachedEmbedding): boolean {
    const now = Date.now();

    switch (entry.category) {
      case 'greeting':
      case 'common':
        // Pre-computed embeddings never expire
        return false;
      case 'user_pattern':
        return now - entry.lastAccessedAt > this.config.userPatternTtlMs;
      case 'predicted':
        return now - entry.createdAt > this.config.predictedTtlMs;
      default:
        return false;
    }
  }

  private evictLRU(): void {
    // Find least recently used non-core entry
    let lruKey: string | null = null;
    let lruTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      // Don't evict core pre-computed embeddings
      if (entry.category === 'greeting' || entry.category === 'common') {
        continue;
      }

      if (entry.lastAccessedAt < lruTime) {
        lruTime = entry.lastAccessedAt;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
    }
  }

  private recordLookupTime(ms: number): void {
    this.metrics.lookupTimes.push(ms);
    // Keep only last 100 samples
    if (this.metrics.lookupTimes.length > 100) {
      this.metrics.lookupTimes = this.metrics.lookupTimes.slice(-100);
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let instance: SpeculativeEmbeddingCache | null = null;

/**
 * Get the speculative embedding cache
 */
export function getSpeculativeEmbeddingCache(
  config?: SpeculativeConfig
): SpeculativeEmbeddingCache {
  if (!instance) {
    instance = new SpeculativeEmbeddingCache(config);
  }
  return instance;
}

/**
 * Initialize speculative embeddings at startup
 * Call this during warmup phase for best performance
 */
export async function initializeSpeculativeEmbeddings(): Promise<void> {
  return getSpeculativeEmbeddingCache().initialize();
}

/**
 * Get embedding with speculative cache
 */
export async function embedWithCache(text: string): Promise<number[]> {
  return getSpeculativeEmbeddingCache().get(text);
}

/**
 * Get cached embedding only (no API call)
 */
export function getCachedEmbedding(text: string): number[] | null {
  return getSpeculativeEmbeddingCache().getCached(text);
}

/**
 * Pre-compute embeddings for predicted queries
 */
export async function precomputeEmbeddings(texts: string[]): Promise<number> {
  return getSpeculativeEmbeddingCache().precomputeBatch(texts);
}

/**
 * Get speculative embedding metrics
 */
export function getSpeculativeEmbeddingMetrics(): SpeculativeMetrics {
  return getSpeculativeEmbeddingCache().getMetrics();
}
