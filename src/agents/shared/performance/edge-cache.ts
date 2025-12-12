/**
 * Edge Cache Service
 *
 * Caches common data at the edge for reduced latency.
 * Particularly useful for persona bundles and configuration.
 *
 * Key Features:
 * - LRU cache with TTL support
 * - Stale-while-revalidate pattern
 * - Memory pressure handling
 * - Cache warming strategies
 *
 * @module EdgeCache
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'EdgeCache' });

// ============================================================================
// TYPES
// ============================================================================

export interface CacheConfig {
  /** Maximum number of entries (default: 1000) */
  maxSize?: number;
  /** Default TTL in ms (default: 300000 = 5 minutes) */
  defaultTtlMs?: number;
  /** Enable stale-while-revalidate (default: true) */
  staleWhileRevalidate?: boolean;
  /** Stale grace period in ms (default: 60000 = 1 minute) */
  staleTtlMs?: number;
  /** Enable compression for large values (default: false) */
  enableCompression?: boolean;
}

export interface CacheEntry<T> {
  value: T;
  createdAt: number;
  expiresAt: number;
  accessCount: number;
  lastAccessedAt: number;
  size: number;
  isStale: boolean;
}

export interface CacheStats {
  hits: number;
  misses: number;
  staleHits: number;
  evictions: number;
  currentSize: number;
  maxSize: number;
  hitRate: number;
  avgAccessCount: number;
}

type FetchFunction<T> = () => Promise<T>;

// ============================================================================
// LRU CACHE WITH TTL
// ============================================================================

/**
 * LRU Cache with TTL and stale-while-revalidate support
 */
export class EdgeCache<T = unknown> {
  private cache = new Map<string, CacheEntry<T>>();
  private config: Required<CacheConfig>;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    staleHits: 0,
    evictions: 0,
    currentSize: 0,
    maxSize: 0,
    hitRate: 0,
    avgAccessCount: 0,
  };
  private revalidating = new Set<string>();

  constructor(config: CacheConfig = {}) {
    this.config = {
      maxSize: config.maxSize ?? 1000,
      defaultTtlMs: config.defaultTtlMs ?? 300000, // 5 minutes
      staleWhileRevalidate: config.staleWhileRevalidate ?? true,
      staleTtlMs: config.staleTtlMs ?? 60000, // 1 minute
      enableCompression: config.enableCompression ?? false,
    };
    this.stats.maxSize = this.config.maxSize;
  }

  /**
   * Get a value from cache
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    const now = Date.now();

    // Check if expired
    if (now > entry.expiresAt) {
      // Check if within stale grace period
      if (this.config.staleWhileRevalidate && now < entry.expiresAt + this.config.staleTtlMs) {
        entry.isStale = true;
        this.stats.staleHits++;
        this.updateAccessStats(entry);
        return entry.value;
      }

      // Truly expired
      this.cache.delete(key);
      this.stats.currentSize = this.cache.size;
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // Valid hit
    this.stats.hits++;
    this.updateAccessStats(entry);
    this.updateHitRate();

    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * Set a value in cache
   */
  set(key: string, value: T, ttlMs?: number): void {
    // Evict if at capacity
    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      this.evictOldest();
    }

    const now = Date.now();
    const size = this.estimateSize(value);

    const entry: CacheEntry<T> = {
      value,
      createdAt: now,
      expiresAt: now + (ttlMs ?? this.config.defaultTtlMs),
      accessCount: 0,
      lastAccessedAt: now,
      size,
      isStale: false,
    };

    this.cache.set(key, entry);
    this.stats.currentSize = this.cache.size;
  }

  /**
   * Get or fetch with caching
   */
  async getOrFetch(
    key: string,
    fetchFn: FetchFunction<T>,
    options?: { ttlMs?: number; forceRefresh?: boolean }
  ): Promise<T> {
    const { ttlMs, forceRefresh = false } = options ?? {};

    // Try cache first (unless forced refresh)
    if (!forceRefresh) {
      const cached = this.get(key);
      const entry = this.cache.get(key);

      if (cached !== null) {
        // If stale, trigger background revalidation
        if (entry?.isStale && !this.revalidating.has(key)) {
          this.revalidateInBackground(key, fetchFn, ttlMs);
        }
        return cached;
      }
    }

    // Fetch fresh value
    try {
      const value = await fetchFn();
      this.set(key, value, ttlMs);
      return value;
    } catch (error) {
      // On error, return stale value if available
      const entry = this.cache.get(key);
      if (entry) {
        log.warn({ key, error: String(error) }, 'Fetch failed, returning stale value');
        return entry.value;
      }
      throw error;
    }
  }

  /**
   * Revalidate a cache entry in the background
   */
  private async revalidateInBackground(
    key: string,
    fetchFn: FetchFunction<T>,
    ttlMs?: number
  ): Promise<void> {
    if (this.revalidating.has(key)) return;

    this.revalidating.add(key);

    try {
      const value = await fetchFn();
      this.set(key, value, ttlMs);
      log.debug({ key }, 'Cache entry revalidated');
    } catch (error) {
      log.warn({ key, error: String(error) }, 'Background revalidation failed');
    } finally {
      this.revalidating.delete(key);
    }
  }

  /**
   * Delete a cache entry
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.currentSize = this.cache.size;
    }
    return deleted;
  }

  /**
   * Check if key exists and is valid
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    return Date.now() <= entry.expiresAt;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.stats.currentSize = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Warm cache with multiple entries
   */
  async warmCache(
    entries: Array<{ key: string; fetchFn: FetchFunction<T>; ttlMs?: number }>
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    const results = await Promise.allSettled(
      entries.map(async ({ key, fetchFn, ttlMs }) => {
        const value = await fetchFn();
        this.set(key, value, ttlMs);
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        success++;
      } else {
        failed++;
      }
    }

    log.info({ success, failed }, '🔥 Cache warming complete');
    return { success, failed };
  }

  /**
   * Get all keys (for debugging/monitoring)
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private evictOldest(): void {
    // Find LRU entry (first in map is oldest due to LRU reordering)
    const oldestKey = this.cache.keys().next().value;
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
      this.stats.currentSize = this.cache.size;
    }
  }

  private estimateSize(value: T): number {
    // Rough estimate of object size in bytes
    try {
      return JSON.stringify(value).length * 2; // UTF-16 chars
    } catch {
      return 1000; // Default estimate for non-serializable
    }
  }

  private updateAccessStats(entry: CacheEntry<T>): void {
    entry.accessCount++;
    entry.lastAccessedAt = Date.now();
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;

    // Calculate average access count
    let totalAccess = 0;
    const entries = Array.from(this.cache.values());
    for (const entry of entries) {
      totalAccess += entry.accessCount;
    }
    this.stats.avgAccessCount = this.cache.size > 0 ? totalAccess / this.cache.size : 0;
  }
}

// ============================================================================
// PERSONA BUNDLE CACHE
// ============================================================================

// Singleton cache for persona bundles
let personaBundleCache: EdgeCache | null = null;

/**
 * Get persona bundle cache instance
 */
export function getPersonaBundleCache(): EdgeCache {
  if (!personaBundleCache) {
    personaBundleCache = new EdgeCache({
      maxSize: 50, // 50 persona bundles max
      defaultTtlMs: 600000, // 10 minutes
      staleWhileRevalidate: true,
      staleTtlMs: 120000, // 2 minute stale grace
    });
  }
  return personaBundleCache;
}

/**
 * Cache a persona bundle
 */
export function cachePersonaBundle(personaId: string, bundle: unknown): void {
  getPersonaBundleCache().set(`bundle:${personaId}`, bundle);
}

/**
 * Get cached persona bundle
 */
export function getCachedPersonaBundle(personaId: string): unknown | null {
  return getPersonaBundleCache().get(`bundle:${personaId}`);
}

/**
 * Get or load persona bundle with caching
 */
export async function getOrLoadPersonaBundle<T>(
  personaId: string,
  loadFn: () => Promise<T>
): Promise<T> {
  return getPersonaBundleCache().getOrFetch(`bundle:${personaId}`, loadFn) as Promise<T>;
}

// ============================================================================
// CONFIGURATION CACHE
// ============================================================================

let configCache: EdgeCache | null = null;

/**
 * Get configuration cache instance
 */
export function getConfigCache(): EdgeCache {
  if (!configCache) {
    configCache = new EdgeCache({
      maxSize: 100,
      defaultTtlMs: 300000, // 5 minutes
      staleWhileRevalidate: true,
    });
  }
  return configCache;
}

/**
 * Cache a configuration value
 */
export function cacheConfig(key: string, value: unknown): void {
  getConfigCache().set(`config:${key}`, value);
}

/**
 * Get cached configuration
 */
export function getCachedConfig<T>(key: string): T | null {
  return getConfigCache().get(`config:${key}`) as T | null;
}

// ============================================================================
// WARM COMMON CACHES
// ============================================================================

/**
 * Warm commonly-used caches on startup
 */
export async function warmCommonCaches(): Promise<void> {
  log.info('🔥 Warming common caches...');

  try {
    // Warm persona bundle cache for core personas
    const corePersonas = ['ferni', 'peter-john', 'maya-santos', 'alex-chen', 'jordan-taylor', 'nayan-patel'];

    for (const personaId of corePersonas) {
      try {
        const { loadBundleById } = await import('../../../personas/bundles/index.js');
        const bundle = await loadBundleById(personaId);
        if (bundle) {
          cachePersonaBundle(personaId, bundle);
        }
      } catch (error) {
        log.debug({ personaId, error: String(error) }, 'Failed to warm persona bundle');
      }
    }

    log.info({ cachedPersonas: corePersonas.length }, '🔥 Cache warming complete');
  } catch (error) {
    log.warn({ error: String(error) }, 'Cache warming failed (non-fatal)');
  }
}

