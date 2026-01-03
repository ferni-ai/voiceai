/**
 * Memory Cache Manager
 *
 * Manages in-memory Maps with LRU eviction, TTL expiration, and memory pressure handling.
 * Prevents unbounded memory growth from caches that never get cleaned up.
 *
 * Philosophy: Memory is precious. Like a well-organized mind, we keep what's
 * frequently accessed and let rarely-used information fade gracefully.
 *
 * @module services/data-layer/memory-cache-manager
 */

import { createLogger } from '../../utils/safe-logger.js';

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

export type { CacheConfig, CacheStats };
