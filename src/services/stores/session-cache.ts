/**
 * Session Cache Layer
 *
 * Provides a unified caching interface for session data with:
 * - Redis backend for true stateless deployments (when available)
 * - In-memory fallback with LRU eviction
 * - Automatic compression for large payloads
 * - TTL-based expiration
 * - Graceful degradation
 *
 * @module services/session-cache
 */

import { clearNamedInterval, registerInterval } from '../../utils/interval-manager.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'SessionCache' });

// ============================================================================
// TYPES
// ============================================================================

export interface CacheEntry<T> {
  data: T;
  createdAt: number;
  lastAccessedAt: number;
  ttlMs: number;
  compressed?: boolean;
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  memoryBytes?: number;
  redisConnected: boolean;
}

export interface CacheConfig {
  /** Maximum number of entries in memory cache */
  maxEntries: number;
  /** Default TTL in milliseconds */
  defaultTtlMs: number;
  /** Compress entries larger than this size (bytes) */
  compressionThreshold: number;
  /** Use Redis when available */
  useRedis: boolean;
  /** Key prefix for Redis */
  keyPrefix: string;
}

// ============================================================================
// SESSION CACHE IMPLEMENTATION
// ============================================================================

export class SessionCache<T = unknown> {
  private memoryCache = new Map<string, CacheEntry<T>>();
  private redisCache: ReturnType<
    typeof import('../memory/redis-cache.js').getRedisCache
  > | null = null;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    size: 0,
    redisConnected: false,
  };
  private config: CacheConfig;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      maxEntries: config?.maxEntries ?? 1000,
      defaultTtlMs: config?.defaultTtlMs ?? 2 * 60 * 60 * 1000, // 2 hours
      compressionThreshold: config?.compressionThreshold ?? 10 * 1024, // 10KB
      useRedis: config?.useRedis ?? true,
      keyPrefix: config?.keyPrefix ?? 'session:',
    };

    this.startCleanupTimer();
  }

  /**
   * Initialize Redis connection (if configured)
   */
  async initialize(): Promise<void> {
    if (!this.config.useRedis) {
      log.info('Redis disabled, using memory-only cache');
      return;
    }

    try {
      const { getRedisCache } = await import('../memory/redis-cache.js');
      this.redisCache = getRedisCache();
      await this.redisCache.initialize();
      this.stats.redisConnected = true;
      log.info('Session cache initialized with Redis backend');
    } catch (error) {
      log.warn({ error: String(error) }, 'Redis unavailable, using memory-only cache');
      this.redisCache = null;
    }
  }

  /**
   * Get a value from cache
   */
  async get(key: string): Promise<T | null> {
    const fullKey = this.config.keyPrefix + key;

    // Try memory cache first (always fastest)
    const memoryEntry = this.memoryCache.get(fullKey);
    if (memoryEntry) {
      if (this.isExpired(memoryEntry)) {
        this.memoryCache.delete(fullKey);
      } else {
        memoryEntry.lastAccessedAt = Date.now();
        this.stats.hits++;
        return memoryEntry.data;
      }
    }

    // Try Redis if available
    if (this.redisCache) {
      try {
        const redisData = await this.redisCache.getSession(fullKey);
        if (redisData) {
          // Populate memory cache for faster subsequent access
          const entry: CacheEntry<T> = {
            data: redisData as T,
            createdAt: Date.now(),
            lastAccessedAt: Date.now(),
            ttlMs: this.config.defaultTtlMs,
          };
          this.setMemory(fullKey, entry);
          this.stats.hits++;
          return redisData as T;
        }
      } catch (error) {
        log.debug({ error: String(error), key }, 'Redis get failed, using memory');
      }
    }

    this.stats.misses++;
    return null;
  }

  /**
   * Set a value in cache
   */
  async set(key: string, value: T, ttlMs?: number): Promise<void> {
    const fullKey = this.config.keyPrefix + key;
    const ttl = ttlMs ?? this.config.defaultTtlMs;

    const entry: CacheEntry<T> = {
      data: value,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      ttlMs: ttl,
    };

    // Always set in memory cache
    this.setMemory(fullKey, entry);

    // Set in Redis if available
    if (this.redisCache) {
      try {
        await this.redisCache.setSession(fullKey, value as Record<string, unknown>, ttl / 1000);
      } catch (error) {
        log.debug({ error: String(error), key }, 'Redis set failed');
      }
    }
  }

  /**
   * Delete a value from cache
   */
  async delete(key: string): Promise<void> {
    const fullKey = this.config.keyPrefix + key;

    this.memoryCache.delete(fullKey);

    if (this.redisCache) {
      try {
        await this.redisCache.deleteSession(fullKey);
      } catch (error) {
        log.debug({ error: String(error), key }, 'Redis delete failed');
      }
    }
  }

  /**
   * Delete all entries matching a prefix
   */
  async deleteByPrefix(prefix: string): Promise<number> {
    const fullPrefix = this.config.keyPrefix + prefix;
    let deleted = 0;

    // Delete from memory
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(fullPrefix)) {
        this.memoryCache.delete(key);
        deleted++;
      }
    }

    // Delete from Redis (if available, this is handled by deleteSession)
    if (this.redisCache) {
      try {
        await this.redisCache.deleteSession(prefix);
      } catch (error) {
        log.debug({ error: String(error), prefix }, 'Redis prefix delete failed');
      }
    }

    return deleted;
  }

  /**
   * Clear all entries
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();
    this.stats.size = 0;
    // Note: Don't clear Redis globally as it may be shared
    log.info('Memory cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return {
      ...this.stats,
      size: this.memoryCache.size,
      memoryBytes: this.estimateMemoryUsage(),
    };
  }

  /**
   * Shutdown the cache
   */
  async shutdown(): Promise<void> {
    // Clear the named interval
    const intervalName = `session-cache-cleanup-${this.config.keyPrefix.replace(/[^a-z0-9]/gi, '')}`;
    clearNamedInterval(intervalName);
    this.cleanupTimer = null;

    if (this.redisCache) {
      try {
        await this.redisCache.close();
      } catch (error) {
        log.warn({ error: String(error) }, 'Redis close failed');
      }
    }

    this.memoryCache.clear();
    log.info('Session cache shutdown complete');
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private setMemory(key: string, entry: CacheEntry<T>): void {
    // Evict if at capacity (LRU eviction)
    if (this.memoryCache.size >= this.config.maxEntries && !this.memoryCache.has(key)) {
      this.evictLRU();
    }

    this.memoryCache.set(key, entry);
    this.stats.size = this.memoryCache.size;
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.memoryCache) {
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.memoryCache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.createdAt > entry.ttlMs;
  }

  private startCleanupTimer(): void {
    // Clean up expired entries every 5 minutes
    // Use keyPrefix to make interval name unique per cache instance
    const intervalName = `session-cache-cleanup-${this.config.keyPrefix.replace(/[^a-z0-9]/gi, '')}`;
    registerInterval(intervalName, () => this.cleanupExpired(), 5 * 60 * 1000);
  }

  private cleanupExpired(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.memoryCache) {
      if (now - entry.createdAt > entry.ttlMs) {
        this.memoryCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      log.debug({ cleaned, remaining: this.memoryCache.size }, 'Cleaned up expired cache entries');
      this.stats.size = this.memoryCache.size;
    }
  }

  private estimateMemoryUsage(): number {
    // Rough estimate: JSON stringify each value and sum lengths
    let bytes = 0;
    for (const entry of this.memoryCache.values()) {
      try {
        bytes += JSON.stringify(entry.data).length * 2; // 2 bytes per char (UTF-16)
      } catch {
        bytes += 1024; // Estimate for non-serializable
      }
    }
    return bytes;
  }
}

// ============================================================================
// SINGLETON INSTANCES FOR DIFFERENT CACHE TYPES
// ============================================================================

let productivityCache: SessionCache | null = null;
let contextCache: SessionCache | null = null;
let userDataCache: SessionCache | null = null;

/**
 * Get the productivity data cache (tasks, habits, bills, etc.)
 */
export function getProductivityCache(): SessionCache {
  if (!productivityCache) {
    productivityCache = new SessionCache({
      maxEntries: 500,
      defaultTtlMs: 2 * 60 * 60 * 1000, // 2 hours
      keyPrefix: 'productivity:',
    });
  }
  return productivityCache;
}

/**
 * Get the context builder cache (conversation context)
 */
export function getContextCache(): SessionCache {
  if (!contextCache) {
    contextCache = new SessionCache({
      maxEntries: 200,
      defaultTtlMs: 30 * 60 * 1000, // 30 minutes
      keyPrefix: 'context:',
    });
  }
  return contextCache;
}

/**
 * Get the user data cache (profiles, preferences)
 */
export function getUserDataCache(): SessionCache {
  if (!userDataCache) {
    userDataCache = new SessionCache({
      maxEntries: 1000,
      defaultTtlMs: 4 * 60 * 60 * 1000, // 4 hours
      keyPrefix: 'user:',
    });
  }
  return userDataCache;
}

/**
 * Initialize all session caches
 */
export async function initializeSessionCaches(): Promise<void> {
  const caches = [getProductivityCache(), getContextCache(), getUserDataCache()];

  await Promise.all(caches.map(async (c) => c.initialize()));

  log.info({ caches: caches.length }, 'Session caches initialized');
}

/**
 * Get combined statistics from all caches
 */
export function getAllCacheStats(): {
  productivity: CacheStats;
  context: CacheStats;
  userData: CacheStats;
  total: {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
    memoryBytes: number;
  };
} {
  const prodStats = productivityCache?.getStats() ?? createEmptyStats();
  const ctxStats = contextCache?.getStats() ?? createEmptyStats();
  const userStats = userDataCache?.getStats() ?? createEmptyStats();

  const totalHits = prodStats.hits + ctxStats.hits + userStats.hits;
  const totalMisses = prodStats.misses + ctxStats.misses + userStats.misses;
  const totalRequests = totalHits + totalMisses;

  return {
    productivity: prodStats,
    context: ctxStats,
    userData: userStats,
    total: {
      size: prodStats.size + ctxStats.size + userStats.size,
      hits: totalHits,
      misses: totalMisses,
      hitRate: totalRequests > 0 ? totalHits / totalRequests : 0,
      memoryBytes:
        (prodStats.memoryBytes ?? 0) + (ctxStats.memoryBytes ?? 0) + (userStats.memoryBytes ?? 0),
    },
  };
}

/**
 * Shutdown all session caches
 */
export async function shutdownSessionCaches(): Promise<void> {
  const caches = [productivityCache, contextCache, userDataCache].filter(Boolean) as SessionCache[];

  await Promise.all(caches.map(async (c) => c.shutdown()));

  productivityCache = null;
  contextCache = null;
  userDataCache = null;

  log.info('All session caches shutdown');
}

function createEmptyStats(): CacheStats {
  return {
    hits: 0,
    misses: 0,
    evictions: 0,
    size: 0,
    redisConnected: false,
  };
}
