/**
 * Embedding Worker - Background embedding computation
 *
 * Offloads expensive embedding API calls to a background worker,
 * maintaining a warm cache of pre-computed embeddings.
 *
 * OPTIMIZATION TARGETS:
 * - Embedding API calls: ~50-100ms → <5ms (cache hit)
 * - Pre-warm common queries during idle time
 * - Batch embedding requests for efficiency
 *
 * @module tools/semantic-router/advanced/workers/embedding-worker
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import { getEmbedding, getEmbeddings } from '../../embedding-providers.js';
import type { EmbeddingVector } from '../../types.js';
// Rust-accelerated batch operations (10-50x faster for 10K+ cache entries)
import { topKSimilar } from '../../../../memory/rust-accelerator.js';

const log = createLogger({ module: 'semantic-router:embedding-worker' });

// ============================================================================
// TYPES
// ============================================================================

interface CachedEmbedding {
  text: string;
  vector: EmbeddingVector;
  timestamp: number;
  hitCount: number;
}

interface EmbeddingRequest {
  id: string;
  text: string;
  priority: 'high' | 'normal' | 'low';
  callback?: (vector: EmbeddingVector) => void;
}

interface WorkerStats {
  cacheSize: number;
  cacheHitRate: number;
  avgLatencyMs: number;
  pendingRequests: number;
  prewarmedCount: number;
}

// ============================================================================
// EMBEDDING WORKER
// ============================================================================

export class EmbeddingWorker {
  // LRU cache for embeddings
  private cache = new Map<string, CachedEmbedding>();
  private readonly maxCacheSize = 10000;
  private readonly cacheTTL = 24 * 60 * 60 * 1000; // 24 hours

  // Request queue for batching
  private requestQueue: EmbeddingRequest[] = [];
  private isProcessing = false;
  private readonly batchSize = 20;
  private readonly batchDelayMs = 50;

  // Stats
  private totalRequests = 0;
  private cacheHits = 0;
  private totalLatencyMs = 0;

  // Pre-warming
  private prewarmQueue: string[] = [];
  private isPrewarming = false;

  constructor() {
    // Start background processing
    this.startBackgroundProcessing();
  }

  /**
   * Get embedding - returns from cache or queues for computation
   */
  async getEmbedding(
    text: string,
    priority: 'high' | 'normal' | 'low' = 'normal'
  ): Promise<EmbeddingVector> {
    this.totalRequests++;
    const startTime = Date.now();

    // Normalize text for cache key
    const cacheKey = this.normalizeText(text);

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      cached.hitCount++;
      this.cacheHits++;
      this.totalLatencyMs += Date.now() - startTime;
      return cached.vector;
    }

    // High priority: compute immediately
    if (priority === 'high') {
      const vector = await getEmbedding(text);
      this.cacheEmbedding(cacheKey, text, vector);
      this.totalLatencyMs += Date.now() - startTime;
      return vector;
    }

    // Queue for batched processing
    return new Promise((resolve) => {
      this.requestQueue.push({
        id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        text,
        priority,
        callback: (vector) => {
          this.totalLatencyMs += Date.now() - startTime;
          resolve(vector);
        },
      });

      // Trigger processing if not already running
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  /**
   * Batch get embeddings - efficient for multiple texts
   */
  async getEmbeddings(texts: string[]): Promise<EmbeddingVector[]> {
    const results: EmbeddingVector[] = new Array(texts.length);
    const uncachedIndices: number[] = [];
    const uncachedTexts: string[] = [];

    // Check cache for all texts
    for (let i = 0; i < texts.length; i++) {
      const cacheKey = this.normalizeText(texts[i]);
      const cached = this.cache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        cached.hitCount++;
        this.cacheHits++;
        results[i] = cached.vector;
      } else {
        uncachedIndices.push(i);
        uncachedTexts.push(texts[i]);
      }
    }

    this.totalRequests += texts.length;

    // Fetch uncached embeddings in batch
    if (uncachedTexts.length > 0) {
      const vectors = await getEmbeddings(uncachedTexts);

      for (let i = 0; i < uncachedIndices.length; i++) {
        const idx = uncachedIndices[i];
        const text = uncachedTexts[i];
        const vector = vectors[i];

        results[idx] = vector;
        this.cacheEmbedding(this.normalizeText(text), text, vector);
      }
    }

    return results;
  }

  /**
   * Pre-warm cache with common queries
   */
  prewarm(texts: string[]): void {
    this.prewarmQueue.push(...texts);

    if (!this.isPrewarming) {
      this.startPrewarming();
    }
  }

  /**
   * Find similar cached embeddings (SIMD-accelerated for 10K+ entries)
   *
   * Uses Rust topKSimilar for O(n) → O(n) with SIMD parallelism.
   * 10-50x faster than JS for large cache sizes.
   */
  findSimilar(queryVector: EmbeddingVector, topK = 5): Array<{ text: string; similarity: number }> {
    const cacheEntries = Array.from(this.cache.values());

    if (cacheEntries.length === 0) {
      return [];
    }

    // Convert to format expected by Rust accelerator
    const candidates = cacheEntries.map((entry) => Array.from(entry.vector));
    const queryArray = Array.from(queryVector);

    // Use SIMD-accelerated topK search (auto-falls back to JS for small batches)
    const { indices, similarities } = topKSimilar(queryArray, candidates, topK);

    // Map back to text results
    return indices.map((idx, i) => ({
      text: cacheEntries[idx].text,
      similarity: similarities[i],
    }));
  }

  /**
   * Get worker stats
   */
  getStats(): WorkerStats {
    return {
      cacheSize: this.cache.size,
      cacheHitRate: this.totalRequests > 0 ? this.cacheHits / this.totalRequests : 0,
      avgLatencyMs: this.totalRequests > 0 ? this.totalLatencyMs / this.totalRequests : 0,
      pendingRequests: this.requestQueue.length,
      prewarmedCount: this.prewarmQueue.length,
    };
  }

  /**
   * Clear cache (for testing/memory management)
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheHits = 0;
    this.totalRequests = 0;
    this.totalLatencyMs = 0;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private normalizeText(text: string): string {
    return text.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  private cacheEmbedding(key: string, text: string, vector: EmbeddingVector): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxCacheSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      text,
      vector,
      timestamp: Date.now(),
      hitCount: 0,
    });
  }

  private evictOldest(): void {
    // Evict least recently used (by hit count, then by timestamp)
    let oldestKey: string | null = null;
    let oldestScore = Infinity;

    const entries = Array.from(this.cache.entries());
    for (const [key, entry] of entries) {
      // Score: higher = more likely to evict
      const age = Date.now() - entry.timestamp;
      const score = entry.hitCount * 1000 - age; // Hits protect, age exposes

      if (score < oldestScore) {
        oldestScore = score;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  private startBackgroundProcessing(): void {
    // Process queue every batchDelayMs
    setInterval(() => {
      if (this.requestQueue.length > 0 && !this.isProcessing) {
        this.processQueue();
      }
    }, this.batchDelayMs);

    // Periodic cache cleanup
    setInterval(
      () => {
        this.cleanupExpiredEntries();
      },
      60 * 60 * 1000
    ); // Every hour
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      // Sort by priority and take batch
      this.requestQueue.sort((a, b) => {
        const priorityOrder = { high: 0, normal: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      const batch = this.requestQueue.splice(0, this.batchSize);
      const texts = batch.map((r) => r.text);

      // Batch fetch
      const vectors = await getEmbeddings(texts);

      // Cache and callback
      for (let i = 0; i < batch.length; i++) {
        const request = batch[i];
        const vector = vectors[i];

        this.cacheEmbedding(this.normalizeText(request.text), request.text, vector);

        if (request.callback) {
          request.callback(vector);
        }
      }
    } catch (error) {
      log.error({ error }, 'Failed to process embedding batch');
    } finally {
      this.isProcessing = false;
    }
  }

  private async startPrewarming(): Promise<void> {
    if (this.isPrewarming) {
      return;
    }

    this.isPrewarming = true;
    log.info({ count: this.prewarmQueue.length }, 'Starting pre-warm');

    try {
      while (this.prewarmQueue.length > 0) {
        // Take batch
        const batch = this.prewarmQueue.splice(0, this.batchSize);

        // Skip already cached
        const uncached = batch.filter((text) => !this.cache.has(this.normalizeText(text)));

        if (uncached.length > 0) {
          const vectors = await getEmbeddings(uncached);

          for (let i = 0; i < uncached.length; i++) {
            this.cacheEmbedding(this.normalizeText(uncached[i]), uncached[i], vectors[i]);
          }
        }

        // Small delay to avoid overwhelming API
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 100);
        });
      }
    } catch (error) {
      log.error({ error }, 'Pre-warm failed');
    } finally {
      this.isPrewarming = false;
      log.info({ cacheSize: this.cache.size }, 'Pre-warm complete');
    }
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let removed = 0;

    const keys = Array.from(this.cache.keys());
    for (const key of keys) {
      const entry = this.cache.get(key);
      if (entry && now - entry.timestamp > this.cacheTTL) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      log.debug({ removed }, 'Cleaned up expired cache entries');
    }
  }
}

// ============================================================================
// COMMON QUERIES FOR PRE-WARMING
// ============================================================================

export const COMMON_QUERIES = [
  // Music
  'play music',
  'play some jazz',
  'play something relaxing',
  'pause the music',
  'stop playing',
  'next song',
  'play focus music',

  // Handoff
  'talk to maya',
  'talk to peter',
  'talk to alex',
  'talk to jordan',
  'talk to nayan',
  'switch to ferni',

  // Calendar
  "what's on my calendar",
  'schedule a meeting',
  'set a reminder',
  'when is my next event',

  // Habits
  'track my meditation',
  'log my workout',
  'how am I doing on habits',

  // Emotional
  "I'm feeling stressed",
  "I'm feeling anxious",
  'I need help',

  // General
  'how are you',
  'thank you',
  'never mind',
];

// ============================================================================
// SINGLETON
// ============================================================================

let workerInstance: EmbeddingWorker | null = null;

export function getEmbeddingWorker(): EmbeddingWorker {
  if (!workerInstance) {
    workerInstance = new EmbeddingWorker();
    // Pre-warm with common queries
    workerInstance.prewarm(COMMON_QUERIES);
  }
  return workerInstance;
}
