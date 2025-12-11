/**
 * Embedding Cache
 *
 * Intelligent caching layer for embeddings to reduce API calls and latency.
 * Uses content hashing for deduplication and LRU eviction for memory management.
 *
 * Philosophy: Embeddings are expensive to generate but stable for the same text.
 * Cache aggressively, prefetch intelligently, and never regenerate unnecessarily.
 */

import { createHash } from 'crypto';
import { getLogger } from '../utils/safe-logger.js';
import { embed, embedBatch, getEmbeddingProvider } from './embeddings.js';
import { err, memoryError, ok, type MemoryError, type Result } from './result.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface CachedEmbedding {
  embedding: number[];
  hash: string;
  createdAt: number;
  accessedAt: number;
  accessCount: number;
  model: string;
  textLength: number;
}

export interface EmbeddingCacheConfig {
  /** Maximum number of embeddings to cache (default: 10000) */
  maxSize: number;
  /** TTL in milliseconds (default: 24 hours) */
  ttlMs: number;
  /** Enable persistent cache to Redis/Firestore (default: false) */
  persistentCache: boolean;
  /** Minimum text length to cache (short texts may not be worth caching) */
  minTextLength: number;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
  totalBytesEstimate: number;
}

// ============================================================================
// EMBEDDING CACHE
// ============================================================================

export class EmbeddingCache {
  private cache = new Map<string, CachedEmbedding>();
  private config: EmbeddingCacheConfig;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  constructor(config?: Partial<EmbeddingCacheConfig>) {
    this.config = {
      maxSize: 10000,
      ttlMs: 24 * 60 * 60 * 1000, // 24 hours
      persistentCache: false,
      minTextLength: 10,
      ...config,
    };
  }

  /**
   * Get embedding with cache-first strategy
   */
  async get(text: string): Promise<Result<number[], MemoryError>> {
    const hash = this.hashText(text);

    // Check cache
    const cached = this.cache.get(hash);
    if (cached && !this.isExpired(cached)) {
      this.stats.hits++;
      cached.accessedAt = Date.now();
      cached.accessCount++;
      log.debug(`Embedding cache hit: ${hash.slice(0, 8)}...`);
      return ok(cached.embedding);
    }

    // Cache miss - generate embedding
    this.stats.misses++;
    log.debug(`Embedding cache miss: ${hash.slice(0, 8)}...`);

    try {
      const embedding = await embed(text);

      // Cache if text is long enough
      if (text.length >= this.config.minTextLength) {
        this.set(hash, embedding, text.length);
      }

      return ok(embedding);
    } catch (error) {
      return err(
        memoryError('embedding_failed', `Failed to generate embedding: ${error}`, {
          retryable: true,
          cause: error instanceof Error ? error : undefined,
        })
      );
    }
  }

  /**
   * Get or compute multiple embeddings with batching optimization
   */
  async getBatch(texts: string[]): Promise<Result<number[][], MemoryError>> {
    const results: (number[] | null)[] = new Array(texts.length).fill(null);
    const uncached: { index: number; text: string; hash: string }[] = [];

    // Check cache for each text
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      const hash = this.hashText(text);
      const cached = this.cache.get(hash);

      if (cached && !this.isExpired(cached)) {
        this.stats.hits++;
        cached.accessedAt = Date.now();
        cached.accessCount++;
        results[i] = cached.embedding;
      } else {
        this.stats.misses++;
        uncached.push({ index: i, text, hash });
      }
    }

    // Batch generate uncached embeddings
    if (uncached.length > 0) {
      try {
        const uncachedTexts = uncached.map((u) => u.text);
        const embeddings = await embedBatch(uncachedTexts);

        // Store results and cache
        for (let i = 0; i < uncached.length; i++) {
          const { index, text, hash } = uncached[i];
          const embedding = embeddings[i];

          results[index] = embedding;

          if (text.length >= this.config.minTextLength) {
            this.set(hash, embedding, text.length);
          }
        }
      } catch (error) {
        return err(
          memoryError('embedding_failed', `Batch embedding failed: ${error}`, {
            retryable: true,
            cause: error instanceof Error ? error : undefined,
          })
        );
      }
    }

    return ok(results as number[][]);
  }

  /**
   * Prefetch embeddings for expected queries (e.g., during session start)
   */
  async prefetch(texts: string[]): Promise<void> {
    // Filter out already cached texts
    const uncached = texts.filter((text) => {
      const hash = this.hashText(text);
      const cached = this.cache.get(hash);
      return !cached || this.isExpired(cached);
    });

    if (uncached.length === 0) {
      log.debug('Prefetch: all texts already cached');
      return;
    }

    log.info(`Prefetching ${uncached.length} embeddings`);

    // Generate in batches of 100
    const BATCH_SIZE = 100;
    for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
      const batch = uncached.slice(i, i + BATCH_SIZE);
      await this.getBatch(batch);
    }
  }

  /**
   * Check if an embedding is cached (without fetching)
   */
  has(text: string): boolean {
    const hash = this.hashText(text);
    const cached = this.cache.get(hash);
    return !!cached && !this.isExpired(cached);
  }

  /**
   * Invalidate a specific cached embedding
   */
  invalidate(text: string): boolean {
    const hash = this.hashText(text);
    return this.cache.delete(hash);
  }

  /**
   * Clear all cached embeddings
   */
  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0 };
    log.info('Embedding cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalAccesses = this.stats.hits + this.stats.misses;

    // Estimate memory usage (each float64 = 8 bytes)
    let totalBytes = 0;
    for (const cached of this.cache.values()) {
      totalBytes += cached.embedding.length * 8;
    }

    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: totalAccesses > 0 ? this.stats.hits / totalAccesses : 0,
      evictions: this.stats.evictions,
      totalBytesEstimate: totalBytes,
    };
  }

  /**
   * Warm up cache with common/important embeddings
   */
  async warmUp(texts: string[]): Promise<number> {
    const start = Date.now();
    await this.prefetch(texts);
    const duration = Date.now() - start;
    log.info(`Cache warmed up with ${texts.length} embeddings in ${duration}ms`);
    return texts.length;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Set a cached embedding
   */
  private set(hash: string, embedding: number[], textLength: number): void {
    // Evict if at capacity
    if (this.cache.size >= this.config.maxSize) {
      this.evictLRU();
    }

    const provider = getEmbeddingProvider();

    this.cache.set(hash, {
      embedding,
      hash,
      createdAt: Date.now(),
      accessedAt: Date.now(),
      accessCount: 1,
      model: provider.model,
      textLength,
    });
  }

  /**
   * Check if a cached embedding is expired
   */
  private isExpired(cached: CachedEmbedding): boolean {
    return Date.now() - cached.createdAt > this.config.ttlMs;
  }

  /**
   * Evict least recently used embeddings
   */
  private evictLRU(): void {
    // Find the least recently accessed entry
    let oldest: { hash: string; accessedAt: number } | null = null;

    for (const [hash, cached] of this.cache.entries()) {
      if (!oldest || cached.accessedAt < oldest.accessedAt) {
        oldest = { hash, accessedAt: cached.accessedAt };
      }
    }

    if (oldest) {
      this.cache.delete(oldest.hash);
      this.stats.evictions++;
      log.debug(`Evicted LRU embedding: ${oldest.hash.slice(0, 8)}...`);
    }
  }

  /**
   * Generate content hash for text
   */
  private hashText(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }

  /**
   * Prune expired entries (run periodically)
   */
  pruneExpired(): number {
    let pruned = 0;
    for (const [hash, cached] of this.cache.entries()) {
      if (this.isExpired(cached)) {
        this.cache.delete(hash);
        pruned++;
      }
    }
    if (pruned > 0) {
      log.info(`Pruned ${pruned} expired embeddings from cache`);
    }
    return pruned;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let defaultCache: EmbeddingCache | null = null;

/**
 * Get the default embedding cache instance
 */
export function getEmbeddingCache(config?: Partial<EmbeddingCacheConfig>): EmbeddingCache {
  if (!defaultCache) {
    defaultCache = new EmbeddingCache(config);
  }
  return defaultCache;
}

/**
 * Reset the default cache (for testing)
 */
export function resetEmbeddingCache(): void {
  if (defaultCache) {
    defaultCache.clear();
    defaultCache = null;
  }
}

// ============================================================================
// CACHED EMBEDDING FUNCTIONS
// ============================================================================

/**
 * Get embedding with caching (drop-in replacement for embed)
 */
export async function embedCached(text: string): Promise<Result<number[], MemoryError>> {
  return getEmbeddingCache().get(text);
}

/**
 * Get batch embeddings with caching
 */
export async function embedBatchCached(texts: string[]): Promise<Result<number[][], MemoryError>> {
  return getEmbeddingCache().getBatch(texts);
}

export default {
  EmbeddingCache,
  getEmbeddingCache,
  resetEmbeddingCache,
  embedCached,
  embedBatchCached,
};
