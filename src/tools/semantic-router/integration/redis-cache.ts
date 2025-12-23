/**
 * Redis Caching Layer for Semantic Router
 *
 * Provides distributed caching for multi-instance deployment.
 * Uses the existing RedisCache from src/memory/redis-cache.ts
 * Falls back to in-memory cache when Redis is unavailable.
 *
 * FEATURES:
 * - Embedding cache (24h TTL, compressed storage)
 * - Score cache (1h TTL)
 * - User profile cache (30min TTL, write-through to Firestore)
 * - Tool embedding index (7d TTL, pre-computed)
 *
 * @module tools/semantic-router/integration/redis-cache
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getRedisCacheAsync, RedisCache } from '../../../memory/redis-cache.js';
import type { EmbeddingVector } from '../types.js';

const log = createLogger({ module: 'semantic-router:redis-cache' });

// ============================================================================
// TYPES
// ============================================================================

interface CacheConfig {
  enabled: boolean;
  embeddingTTLSeconds: number;
  scoreTTLSeconds: number;
  profileTTLSeconds: number;
  toolIndexTTLSeconds: number;
  maxMemoryCacheSize: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  hitRate: number;
  redisConnected: boolean;
  memorySize: number;
}

interface CachedEmbedding {
  vector: EmbeddingVector;
  model: string;
  timestamp: number;
}

interface CachedScore {
  scores: Record<string, number>;
  timestamp: number;
}

interface CachedToolIndex {
  toolId: string;
  descriptionEmbedding: number[]; // Stored as number[] (converted from EmbeddingVector)
  exampleEmbeddings: number[][];
  model: string;
  version: string;
  timestamp: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: CacheConfig = {
  enabled: true,
  embeddingTTLSeconds: 24 * 60 * 60, // 24 hours
  scoreTTLSeconds: 60 * 60, // 1 hour
  profileTTLSeconds: 30 * 60, // 30 minutes
  toolIndexTTLSeconds: 7 * 24 * 60 * 60, // 7 days
  maxMemoryCacheSize: 10000,
};

let config: CacheConfig = { ...DEFAULT_CONFIG };

/**
 * Configure the cache layer
 */
export function configureCacheLayer(newConfig: Partial<CacheConfig>): void {
  config = { ...config, ...newConfig };
  log.info({ config }, 'Cache configured');
}

// ============================================================================
// IN-MEMORY FALLBACK CACHE
// ============================================================================

class MemoryCache<T> {
  private cache = new Map<string, { value: T; timestamp: number }>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  // Stats
  private hits = 0;
  private misses = 0;
  private sets = 0;

  constructor(maxSize: number, ttlMs: number) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.value;
  }

  set(key: string, value: T): void {
    this.sets++;

    // Evict if at capacity (FIFO)
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, { value, timestamp: Date.now() });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.sets = 0;
  }

  getStats(): { hits: number; misses: number; sets: number; size: number } {
    return {
      hits: this.hits,
      misses: this.misses,
      sets: this.sets,
      size: this.cache.size,
    };
  }
}

// ============================================================================
// SEMANTIC ROUTER CACHE
// ============================================================================

const KEY_PREFIX = 'sr:'; // Semantic Router prefix

/**
 * Semantic Router Cache
 *
 * Provides high-level caching for:
 * - Embeddings (expensive API calls)
 * - Routing scores (computation results)
 * - User profiles (personalization data)
 * - Tool embeddings index (pre-computed)
 */
export class SemanticRouterCache {
  private redis: RedisCache | null = null;
  private memoryCache = new MemoryCache<string>(
    config.maxMemoryCacheSize,
    config.embeddingTTLSeconds * 1000
  );
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  // Stats
  private hits = 0;
  private misses = 0;
  private sets = 0;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInitialize();
    await this.initPromise;
    this.initPromise = null;
  }

  private async doInitialize(): Promise<void> {
    try {
      this.redis = await getRedisCacheAsync();
      this.initialized = true;
      log.info({ redisConnected: this.redis.isConnected() }, 'Semantic router cache initialized');
    } catch (error) {
      log.warn({ error: String(error) }, 'Redis unavailable, using memory-only cache');
      this.initialized = true;
    }
  }

  // ============================================================================
  // EMBEDDING CACHE
  // ============================================================================

  async getEmbedding(text: string, model: string): Promise<EmbeddingVector | null> {
    const key = `${KEY_PREFIX}emb:${model}:${this.hashKey(text)}`;

    // Try memory first (fastest)
    const memCached = this.memoryCache.get(key);
    if (memCached) {
      this.hits++;
      const parsed: CachedEmbedding = JSON.parse(memCached);
      return parsed.vector;
    }

    // Try Redis
    if (this.redis?.isConnected()) {
      try {
        const cached = await this.redis.getCompressed<CachedEmbedding>(key);
        if (cached && Date.now() - cached.timestamp < config.embeddingTTLSeconds * 1000) {
          this.hits++;
          // Write to memory for faster subsequent access
          this.memoryCache.set(key, JSON.stringify(cached));
          return cached.vector;
        }
      } catch (err) {
        log.debug({ error: String(err) }, 'Redis get failed, falling back');
      }
    }

    this.misses++;
    return null;
  }

  async setEmbedding(text: string, model: string, vector: EmbeddingVector): Promise<void> {
    const key = `${KEY_PREFIX}emb:${model}:${this.hashKey(text)}`;
    const value: CachedEmbedding = {
      vector,
      model,
      timestamp: Date.now(),
    };

    this.sets++;
    const serialized = JSON.stringify(value);

    // Write to memory
    this.memoryCache.set(key, serialized);

    // Write to Redis (fire-and-forget)
    if (this.redis?.isConnected()) {
      this.redis.setCompressed(key, value, config.embeddingTTLSeconds).catch((err) => {
        log.debug({ error: String(err) }, 'Redis set failed');
      });
    }
  }

  // ============================================================================
  // SCORE CACHE
  // ============================================================================

  async getScores(query: string, context?: string): Promise<Record<string, number> | null> {
    const contextHash = context ? this.hashKey(context) : 'default';
    const key = `${KEY_PREFIX}scores:${contextHash}:${this.hashKey(query)}`;

    // Memory first
    const memCached = this.memoryCache.get(key);
    if (memCached) {
      this.hits++;
      const parsed: CachedScore = JSON.parse(memCached);
      return parsed.scores;
    }

    // Redis
    if (this.redis?.isConnected()) {
      try {
        const cached = await this.redis.get<CachedScore>(key);
        if (cached && Date.now() - cached.timestamp < config.scoreTTLSeconds * 1000) {
          this.hits++;
          this.memoryCache.set(key, JSON.stringify(cached));
          return cached.scores;
        }
      } catch (err) {
        log.debug({ error: String(err) }, 'Redis get scores failed');
      }
    }

    this.misses++;
    return null;
  }

  async setScores(query: string, scores: Record<string, number>, context?: string): Promise<void> {
    const contextHash = context ? this.hashKey(context) : 'default';
    const key = `${KEY_PREFIX}scores:${contextHash}:${this.hashKey(query)}`;
    const value: CachedScore = {
      scores,
      timestamp: Date.now(),
    };

    this.sets++;
    const serialized = JSON.stringify(value);
    this.memoryCache.set(key, serialized);

    if (this.redis?.isConnected()) {
      this.redis.set(key, value, config.scoreTTLSeconds).catch((err) => {
        log.debug({ error: String(err) }, 'Redis set scores failed');
      });
    }
  }

  // ============================================================================
  // PROFILE CACHE (write-through to Firestore)
  // ============================================================================

  async getProfile(userId: string): Promise<Record<string, unknown> | null> {
    const key = `${KEY_PREFIX}profile:${userId}`;

    // Memory first
    const memCached = this.memoryCache.get(key);
    if (memCached) {
      this.hits++;
      return JSON.parse(memCached);
    }

    // Redis
    if (this.redis?.isConnected()) {
      try {
        const cached = await this.redis.get<{ data: Record<string, unknown>; timestamp: number }>(
          key
        );
        if (cached && Date.now() - cached.timestamp < config.profileTTLSeconds * 1000) {
          this.hits++;
          this.memoryCache.set(key, JSON.stringify(cached.data));
          return cached.data;
        }
      } catch (err) {
        log.debug({ error: String(err) }, 'Redis get profile failed');
      }
    }

    this.misses++;
    return null;
  }

  async setProfile(userId: string, profile: Record<string, unknown>): Promise<void> {
    const key = `${KEY_PREFIX}profile:${userId}`;
    const value = { data: profile, timestamp: Date.now() };

    this.sets++;
    this.memoryCache.set(key, JSON.stringify(profile));

    if (this.redis?.isConnected()) {
      this.redis.set(key, value, config.profileTTLSeconds).catch((err) => {
        log.debug({ error: String(err) }, 'Redis set profile failed');
      });
    }
  }

  async invalidateProfile(userId: string): Promise<void> {
    const key = `${KEY_PREFIX}profile:${userId}`;
    this.memoryCache.delete(key);

    if (this.redis?.isConnected()) {
      this.redis.delete(key).catch((err) => {
        log.debug({ error: String(err) }, 'Redis delete profile failed');
      });
    }
  }

  // ============================================================================
  // TOOL EMBEDDING INDEX
  // ============================================================================

  /**
   * Get pre-computed tool embeddings from cache
   */
  async getToolIndex(toolId: string, version: string): Promise<CachedToolIndex | null> {
    const key = `${KEY_PREFIX}toolidx:${version}:${toolId}`;

    // Memory first
    const memCached = this.memoryCache.get(key);
    if (memCached) {
      this.hits++;
      return JSON.parse(memCached);
    }

    // Redis (use compressed for large embeddings)
    if (this.redis?.isConnected()) {
      try {
        const cached = await this.redis.getCompressed<CachedToolIndex>(key);
        if (cached && Date.now() - cached.timestamp < config.toolIndexTTLSeconds * 1000) {
          this.hits++;
          this.memoryCache.set(key, JSON.stringify(cached));
          return cached;
        }
      } catch (err) {
        log.debug({ error: String(err) }, 'Redis get tool index failed');
      }
    }

    this.misses++;
    return null;
  }

  /**
   * Store pre-computed tool embeddings
   */
  async setToolIndex(index: CachedToolIndex): Promise<void> {
    const key = `${KEY_PREFIX}toolidx:${index.version}:${index.toolId}`;

    this.sets++;
    const serialized = JSON.stringify(index);
    this.memoryCache.set(key, serialized);

    if (this.redis?.isConnected()) {
      this.redis.setCompressed(key, index, config.toolIndexTTLSeconds).catch((err) => {
        log.debug({ error: String(err) }, 'Redis set tool index failed');
      });
    }
  }

  /**
   * Get all cached tool indices for a version
   */
  async getAllToolIndices(version: string): Promise<CachedToolIndex[]> {
    // This requires a pattern search which isn't efficient in Redis
    // Better to load from Firestore and populate cache
    log.debug({ version }, 'getAllToolIndices - Redis pattern search not implemented');
    return [];
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  getStats(): CacheStats {
    const memStats = this.memoryCache.getStats();
    const totalOps = this.hits + this.misses;

    return {
      hits: this.hits,
      misses: this.misses,
      sets: this.sets,
      hitRate: totalOps > 0 ? this.hits / totalOps : 0,
      redisConnected: this.redis?.isConnected() ?? false,
      memorySize: memStats.size,
    };
  }

  /**
   * Clear all caches (for testing)
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();
    this.hits = 0;
    this.misses = 0;
    this.sets = 0;
    log.info('Semantic router cache cleared');
  }

  private hashKey(text: string): string {
    // Simple hash function for cache keys
    const normalized = text.toLowerCase().trim();
    let hash = 0;

    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    return Math.abs(hash).toString(36);
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let cacheInstance: SemanticRouterCache | null = null;

export function getSemanticRouterCache(): SemanticRouterCache {
  if (!cacheInstance) {
    cacheInstance = new SemanticRouterCache();
  }
  return cacheInstance;
}

export async function initializeCache(): Promise<void> {
  const cache = getSemanticRouterCache();
  await cache.initialize();
}

// Re-export the cached tool index type for the embedding index module
export type { CachedToolIndex };
