/**
 * Memory Cache Manager
 *
 * Manages in-memory Maps with LRU eviction, TTL expiration, and memory pressure handling.
 * Prevents unbounded memory growth from caches that never get cleaned up.
 *
 * Philosophy: Memory is precious. Like a well-organized mind, we keep what's
 * frequently accessed and let rarely-used information fade gracefully.
 *
 * PERFORMANCE OPTIMIZATION (Jan 2026):
 * - Added RedisBackedCache for L2 caching with Redis
 * - L1 (memory) provides sub-ms access, L2 (Redis) provides cross-instance sharing
 * - Automatic fallback to memory-only if Redis is unavailable
 *
 * @module services/data-layer/memory-cache-manager
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { RedisCache } from '../../memory/redis-cache.js';

const log = createLogger({ module: 'MemoryCacheManager' });

// ============================================================================
// TYPES
// ============================================================================

interface CacheEntry<T> {
  value: T;
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
  sizeBytes?: number;
}

interface CacheConfig {
  /** Maximum number of entries */
  maxEntries: number;
  /** TTL in milliseconds (0 = no TTL) */
  ttlMs: number;
  /** Whether to track access for LRU */
  trackAccess: boolean;
  /** Callback when entry is evicted */
  onEvict?: (key: string, value: unknown) => void;
}

interface CacheStats {
  entries: number;
  hits: number;
  misses: number;
  evictions: number;
  estimatedSizeBytes: number;
}

// ============================================================================
// MANAGED CACHE CLASS
// ============================================================================

export class ManagedCache<K extends string, V> {
  private cache = new Map<K, CacheEntry<V>>();
  private config: CacheConfig;
  private stats = { hits: 0, misses: 0, evictions: 0 };
  private name: string;

  constructor(name: string, config: Partial<CacheConfig> = {}) {
    this.name = name;
    this.config = {
      maxEntries: config.maxEntries ?? 1000,
      ttlMs: config.ttlMs ?? 5 * 60 * 1000, // 5 minutes default
      trackAccess: config.trackAccess ?? true,
      onEvict: config.onEvict,
    };
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Get a value from cache
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check TTL
    if (this.config.ttlMs > 0 && Date.now() - entry.createdAt > this.config.ttlMs) {
      this.delete(key);
      this.stats.misses++;
      return undefined;
    }

    // Update access tracking
    if (this.config.trackAccess) {
      entry.lastAccessedAt = Date.now();
      entry.accessCount++;
    }

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Set a value in cache
   */
  set(key: K, value: V): void {
    // Evict if at capacity
    if (this.cache.size >= this.config.maxEntries && !this.cache.has(key)) {
      this.evictOne();
    }

    const entry: CacheEntry<V> = {
      value,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      accessCount: 1,
      sizeBytes: this.estimateSize(value),
    };

    this.cache.set(key, entry);
  }

  /**
   * Check if key exists (without updating access time)
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check TTL without updating
    if (this.config.ttlMs > 0 && Date.now() - entry.createdAt > this.config.ttlMs) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a specific key
   */
  delete(key: K): boolean {
    const entry = this.cache.get(key);
    if (entry && this.config.onEvict) {
      this.config.onEvict(key, entry.value);
    }
    return this.cache.delete(key);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    if (this.config.onEvict) {
      for (const [key, entry] of this.cache) {
        this.config.onEvict(key, entry.value);
      }
    }
    this.cache.clear();
    log.debug({ cache: this.name }, 'Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    let estimatedSize = 0;
    for (const entry of this.cache.values()) {
      estimatedSize += entry.sizeBytes ?? 100;
    }

    return {
      entries: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      estimatedSizeBytes: estimatedSize,
    };
  }

  /**
   * Cleanup expired entries (call periodically)
   */
  cleanup(): number {
    if (this.config.ttlMs === 0) return 0;

    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache) {
      if (now - entry.createdAt > this.config.ttlMs) {
        this.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      log.debug({ cache: this.name, cleaned }, 'Cache TTL cleanup');
    }

    return cleaned;
  }

  /**
   * Get all keys (for iteration)
   */
  keys(): K[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get size
   */
  get size(): number {
    return this.cache.size;
  }

  // ============================================================================
  // PRIVATE
  // ============================================================================

  private evictOne(): void {
    if (this.cache.size === 0) return;

    // LRU eviction - find least recently accessed
    let oldestKey: K | null = null;
    let oldestAccess = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessedAt < oldestAccess) {
        oldestAccess = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  private estimateSize(value: V): number {
    try {
      return JSON.stringify(value).length * 2; // UTF-16 = 2 bytes per char
    } catch {
      return 100; // Default estimate
    }
  }
}

// ============================================================================
// REDIS-BACKED CACHE (L1 Memory + L2 Redis)
// ============================================================================

interface RedisBackedCacheConfig extends CacheConfig {
  /** Redis key prefix for this cache */
  redisKeyPrefix: string;
  /** TTL for Redis entries in seconds (defaults to ttlMs / 1000) */
  redisTtlSeconds?: number;
  /** Whether to use compression for large values */
  useCompression?: boolean;
}

/**
 * Redis-backed cache with L1 (memory) + L2 (Redis) tiered caching.
 *
 * PERFORMANCE CHARACTERISTICS:
 * - L1 hit: ~0.001ms (in-memory Map access)
 * - L2 hit: ~1-5ms (Redis network call)
 * - L2 miss: ~1-5ms (Redis network call, then fallback)
 *
 * USE CASES:
 * - Cross-instance data sharing
 * - Persistence across container restarts
 * - Large datasets that benefit from distributed caching
 *
 * @example
 * const cache = await createRedisBackedCache<UserProfile>('user-profiles', {
 *   maxEntries: 1000,
 *   ttlMs: 5 * 60 * 1000,
 *   redisKeyPrefix: 'profile:',
 * });
 *
 * // Sync access (L1 only)
 * const profile = cache.get('user123');
 *
 * // Async access (L1 + L2)
 * const profile = await cache.getAsync('user123');
 */
export class RedisBackedCache<K extends string, V> extends ManagedCache<K, V> {
  private redis: RedisCache | null = null;
  private redisConfig: RedisBackedCacheConfig;
  private redisStats = { l2Hits: 0, l2Misses: 0, l2Errors: 0 };

  constructor(name: string, config: Partial<RedisBackedCacheConfig>) {
    super(name, config);
    this.redisConfig = {
      maxEntries: config.maxEntries ?? 1000,
      ttlMs: config.ttlMs ?? 5 * 60 * 1000,
      trackAccess: config.trackAccess ?? true,
      redisKeyPrefix: config.redisKeyPrefix ?? `cache:${name}:`,
      redisTtlSeconds: config.redisTtlSeconds ?? Math.floor((config.ttlMs ?? 300000) / 1000),
      useCompression: config.useCompression ?? false,
    };
  }

  /**
   * Initialize Redis connection (call once after construction)
   */
  async initializeRedis(): Promise<boolean> {
    try {
      const { getRedisCache } = await import('../../memory/redis-cache.js');
      const cache = getRedisCache();
      await cache.initialize();

      if (cache.isConnected()) {
        this.redis = cache;
        log.info({ cache: this.redisConfig.redisKeyPrefix }, '🚀 Redis L2 cache enabled');
        return true;
      }
    } catch (error) {
      log.debug({ error: String(error) }, 'Redis L2 not available');
    }
    return false;
  }

  /**
   * Check if Redis L2 is available
   */
  hasRedisL2(): boolean {
    return this.redis?.isConnected() ?? false;
  }

  /**
   * Get value (sync - L1 memory only, for latency-critical paths)
   */
  override get(key: K): V | undefined {
    return super.get(key);
  }

  /**
   * Get value (async - L1 memory + L2 Redis)
   * Use this when latency is acceptable but cross-instance sharing is needed.
   */
  async getAsync(key: K): Promise<V | undefined> {
    // L1: Check memory first (fastest)
    const memoryResult = super.get(key);
    if (memoryResult !== undefined) {
      return memoryResult;
    }

    // L2: Check Redis
    if (this.redis?.isConnected()) {
      try {
        const redisKey = this.redisConfig.redisKeyPrefix + key;
        const redisData = this.redisConfig.useCompression
          ? await this.redis.getCompressed<CacheEntry<V>>(redisKey)
          : await this.redis.get<CacheEntry<V>>(redisKey);

        if (redisData && this.isValidEntry(redisData)) {
          this.redisStats.l2Hits++;

          // Promote to L1 for faster subsequent access
          super.set(key, redisData.value);

          log.debug({ key, cache: this.redisConfig.redisKeyPrefix, layer: 'L2' }, 'Cache hit');
          return redisData.value;
        }
        this.redisStats.l2Misses++;
      } catch (error) {
        this.redisStats.l2Errors++;
        log.debug({ error: String(error), key }, 'Redis L2 get failed');
      }
    }

    return undefined;
  }

  /**
   * Set value (writes to L1 memory and L2 Redis)
   */
  override set(key: K, value: V): void {
    // L1: Always set in memory (synchronous)
    super.set(key, value);

    // L2: Write to Redis (fire-and-forget)
    if (this.redis?.isConnected()) {
      const redisKey = this.redisConfig.redisKeyPrefix + key;
      const entry: CacheEntry<V> = {
        value,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 1,
      };

      const writePromise = this.redisConfig.useCompression
        ? this.redis.setCompressed(redisKey, entry, this.redisConfig.redisTtlSeconds)
        : this.redis.set(redisKey, entry, this.redisConfig.redisTtlSeconds);

      writePromise.catch((error) => {
        this.redisStats.l2Errors++;
        log.debug({ error: String(error), key }, 'Redis L2 set failed');
      });
    }
  }

  /**
   * Set value async (waits for Redis write confirmation)
   * Use when you need to ensure value is persisted before proceeding.
   */
  async setAsync(key: K, value: V): Promise<void> {
    // L1: Set in memory
    super.set(key, value);

    // L2: Write to Redis and wait
    if (this.redis?.isConnected()) {
      try {
        const redisKey = this.redisConfig.redisKeyPrefix + key;
        const entry: CacheEntry<V> = {
          value,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
          accessCount: 1,
        };

        if (this.redisConfig.useCompression) {
          await this.redis.setCompressed(redisKey, entry, this.redisConfig.redisTtlSeconds);
        } else {
          await this.redis.set(redisKey, entry, this.redisConfig.redisTtlSeconds);
        }
      } catch (error) {
        this.redisStats.l2Errors++;
        log.debug({ error: String(error), key }, 'Redis L2 setAsync failed');
      }
    }
  }

  /**
   * Delete value (from L1 and L2)
   */
  override delete(key: K): boolean {
    const deleted = super.delete(key);

    // L2: Delete from Redis (fire-and-forget)
    if (this.redis?.isConnected()) {
      const redisKey = this.redisConfig.redisKeyPrefix + key;
      this.redis.delete(redisKey).catch((error) => {
        log.debug({ error: String(error), key }, 'Redis L2 delete failed');
      });
    }

    return deleted;
  }

  /**
   * Clear all entries (L1 and L2)
   * Note: L2 clear uses pattern delete which may be slow for large datasets
   */
  override clear(): void {
    super.clear();
    // Note: Redis pattern delete would be expensive, skip for now
    // Individual entries will expire via TTL
    log.debug({ cache: this.redisConfig.redisKeyPrefix }, 'L1 cache cleared (L2 will expire via TTL)');
  }

  /**
   * Get extended stats including Redis L2 metrics
   */
  getExtendedStats(): CacheStats & {
    redisL2Enabled: boolean;
    l2Hits: number;
    l2Misses: number;
    l2Errors: number;
    l2HitRate: number;
  } {
    const baseStats = super.getStats();
    const totalL2Ops = this.redisStats.l2Hits + this.redisStats.l2Misses;

    return {
      ...baseStats,
      redisL2Enabled: this.redis?.isConnected() ?? false,
      l2Hits: this.redisStats.l2Hits,
      l2Misses: this.redisStats.l2Misses,
      l2Errors: this.redisStats.l2Errors,
      l2HitRate: totalL2Ops > 0 ? this.redisStats.l2Hits / totalL2Ops : 0,
    };
  }

  private isValidEntry(entry: CacheEntry<V>): boolean {
    if (!entry || !entry.createdAt) return false;
    const age = Date.now() - entry.createdAt;
    return age < this.redisConfig.ttlMs;
  }
}

/**
 * Create a Redis-backed cache with automatic Redis initialization.
 * Falls back to memory-only if Redis is unavailable.
 */
export async function createRedisBackedCache<V>(
  name: string,
  config: Partial<RedisBackedCacheConfig> = {}
): Promise<RedisBackedCache<string, V>> {
  const cache = new RedisBackedCache<string, V>(name, config);
  await cache.initializeRedis();

  // Register for global management
  registeredCaches.set(name, {
    cache: cache as unknown as ManagedCache<string, unknown>,
    config: { ...config } as CacheConfig,
    createdAt: Date.now(),
  });

  log.debug(
    {
      name,
      redisEnabled: cache.hasRedisL2(),
      maxEntries: config.maxEntries,
      ttlMs: config.ttlMs,
    },
    'Redis-backed cache created'
  );

  return cache;
}

/**
 * Create a Redis-backed user cache
 */
export async function createRedisBackedUserCache<V>(
  name: string,
  options: { maxUsers?: number; ttlMs?: number } = {}
): Promise<RedisBackedCache<string, V>> {
  return createRedisBackedCache<V>(name, {
    maxEntries: options.maxUsers ?? 500,
    ttlMs: options.ttlMs ?? 5 * 60 * 1000,
    redisKeyPrefix: `user:${name}:`,
    trackAccess: true,
  });
}

/**
 * Create a Redis-backed session cache
 */
export async function createRedisBackedSessionCache<V>(
  name: string,
  options: { maxSessions?: number; ttlMs?: number } = {}
): Promise<RedisBackedCache<string, V>> {
  return createRedisBackedCache<V>(name, {
    maxEntries: options.maxSessions ?? 200,
    ttlMs: options.ttlMs ?? 30 * 60 * 1000,
    redisKeyPrefix: `session:${name}:`,
    trackAccess: true,
  });
}

// ============================================================================
// GLOBAL CACHE REGISTRY
// ============================================================================

interface RegisteredCache {
  cache: ManagedCache<string, unknown>;
  config: CacheConfig;
  createdAt: number;
}

const registeredCaches = new Map<string, RegisteredCache>();
let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Register a cache for management
 */
export function registerCache<K extends string, V>(
  name: string,
  config: Partial<CacheConfig> = {}
): ManagedCache<K, V> {
  const cache = new ManagedCache<K, V>(name, config);

  registeredCaches.set(name, {
    cache: cache as ManagedCache<string, unknown>,
    config: { ...config } as CacheConfig,
    createdAt: Date.now(),
  });

  log.debug(
    {
      name,
      maxEntries: config.maxEntries,
      ttlMs: config.ttlMs,
    },
    'Cache registered'
  );

  return cache;
}

/**
 * Get a registered cache by name
 */
export function getCache<K extends string, V>(name: string): ManagedCache<K, V> | undefined {
  const registered = registeredCaches.get(name);
  return registered?.cache as ManagedCache<K, V> | undefined;
}

/**
 * Unregister and clear a cache
 */
export function unregisterCache(name: string): void {
  const registered = registeredCaches.get(name);
  if (registered) {
    registered.cache.clear();
    registeredCaches.delete(name);
    log.debug({ name }, 'Cache unregistered');
  }
}

// ============================================================================
// GLOBAL CLEANUP
// ============================================================================

/**
 * Start periodic cleanup of all registered caches
 */
export function startCacheCleanup(intervalMs = 60_000): void {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    let totalCleaned = 0;

    for (const [name, registered] of registeredCaches) {
      try {
        const cleaned = registered.cache.cleanup();
        totalCleaned += cleaned;
      } catch (error) {
        log.warn({ name, error: String(error) }, 'Cache cleanup error');
      }
    }

    if (totalCleaned > 0) {
      log.debug({ totalCleaned, cacheCount: registeredCaches.size }, 'Periodic cache cleanup');
    }
  }, intervalMs);

  log.info({ intervalMs, cacheCount: registeredCaches.size }, 'Cache cleanup started');
}

/**
 * Stop periodic cleanup
 */
export function stopCacheCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    log.info('Cache cleanup stopped');
  }
}

/**
 * Clear all registered caches (for shutdown)
 */
export function clearAllCaches(): void {
  for (const [name, registered] of registeredCaches) {
    registered.cache.clear();
  }
  log.info({ cacheCount: registeredCaches.size }, 'All caches cleared');
}

/**
 * Get stats for all registered caches
 */
export function getAllCacheStats(): Record<string, CacheStats> {
  const stats: Record<string, CacheStats> = {};

  for (const [name, registered] of registeredCaches) {
    stats[name] = registered.cache.getStats();
  }

  return stats;
}

/**
 * Get total memory estimate across all caches
 */
export function getTotalCacheMemory(): number {
  let total = 0;
  for (const registered of registeredCaches.values()) {
    total += registered.cache.getStats().estimatedSizeBytes;
  }
  return total;
}

// ============================================================================
// USER-SCOPED CACHE CLEANUP
// ============================================================================

/**
 * Clear all caches for a specific user (call at session end)
 * This handles the common pattern where cache keys are userId or userId_sessionId
 */
export function clearUserCaches(userId: string): number {
  let cleared = 0;

  for (const registered of registeredCaches.values()) {
    const keysToDelete: string[] = [];

    for (const key of registered.cache.keys()) {
      if (key === userId || key.startsWith(`${userId}_`) || key.endsWith(`_${userId}`)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      registered.cache.delete(key);
      cleared++;
    }
  }

  if (cleared > 0) {
    log.debug({ userId, cleared }, 'User caches cleared');
  }

  return cleared;
}

// ============================================================================
// PRE-CONFIGURED CACHES FOR COMMON USE CASES
// ============================================================================

/**
 * Create a user-scoped cache (keys are userIds)
 */
export function createUserCache<V>(
  name: string,
  options: { maxUsers?: number; ttlMs?: number } = {}
): ManagedCache<string, V> {
  return registerCache<string, V>(name, {
    maxEntries: options.maxUsers ?? 500,
    ttlMs: options.ttlMs ?? 5 * 60 * 1000, // 5 min default
    trackAccess: true,
  });
}

/**
 * Create a session-scoped cache (keys are sessionIds or userId_sessionId)
 */
export function createSessionCache<V>(
  name: string,
  options: { maxSessions?: number; ttlMs?: number } = {}
): ManagedCache<string, V> {
  return registerCache<string, V>(name, {
    maxEntries: options.maxSessions ?? 200,
    ttlMs: options.ttlMs ?? 30 * 60 * 1000, // 30 min default (session length)
    trackAccess: true,
  });
}

/**
 * Create a short-lived cache for temporary data
 */
export function createTempCache<V>(
  name: string,
  options: { maxEntries?: number; ttlMs?: number } = {}
): ManagedCache<string, V> {
  return registerCache<string, V>(name, {
    maxEntries: options.maxEntries ?? 100,
    ttlMs: options.ttlMs ?? 60_000, // 1 min default
    trackAccess: false, // No LRU tracking for temp caches
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { CacheConfig, CacheStats, RedisBackedCacheConfig };
// Note: RedisBackedCache is already exported at class declaration (line 293)
