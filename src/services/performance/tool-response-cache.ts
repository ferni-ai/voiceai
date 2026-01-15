/**
 * Tool Response Cache
 *
 * PERFORMANCE OPTIMIZATION: Cache responses from read-only tools to reduce
 * latency for frequently requested information within a session.
 *
 * Features:
 * - Session-scoped caching (cleared on session end)
 * - Configurable TTL per tool type
 * - Cache key includes relevant args
 * - Automatic cache invalidation on write operations
 * - Redis backing for persistence across restarts (when available)
 * - In-memory L1 cache for sub-millisecond access
 *
 * Read-only tools eligible for caching:
 * - Weather (30s TTL - weather updates slowly)
 * - Time (1s TTL - still useful for rapid queries)
 * - News (60s TTL - news doesn't change per-second)
 * - Market data (15s TTL - markets move, but not that fast)
 * - Calendar (30s TTL - rare intra-session changes)
 * - Home status (10s TTL - sensor data)
 *
 * @module performance/tool-response-cache
 */

import { createLogger } from '../../utils/safe-logger.js';

// Note: This file was moved from agents/shared/performance/ to services/performance/
// to fix architecture layer violations (services should not import from agents)
import { LRUCache } from 'lru-cache';

// Redis backing type (lazy loaded)
type RedisCache = ReturnType<typeof import('../memory/redis-cache.js').getRedisCache> | null;

const log = createLogger({ module: 'ToolResponseCache' });

// ============================================================================
// TYPES
// ============================================================================

export interface CachedToolResponse {
  result: unknown;
  cachedAt: number;
  ttlMs: number;
  hitCount: number;
}

export interface ToolCacheConfig {
  /** Maximum cache entries per session */
  maxEntries?: number;
  /** Default TTL in ms (for tools not in TTL_BY_TOOL) */
  defaultTtlMs?: number;
  /** Enable/disable caching */
  enabled?: boolean;
}

export interface ToolCacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  totalSavedMs: number;
  cacheSize: number;
}

// ============================================================================
// TTL CONFIGURATION BY TOOL
// ============================================================================

/**
 * TTL configuration for cacheable tools.
 * Only tools listed here are cached. All others bypass cache.
 *
 * PERF OPTIMIZATION Dec 2024: Extended TTLs for read-only tools
 * - Weather/news data doesn't change second-to-second
 * - User context is stable within a session
 * - Extended TTLs save ~200-300ms per repeated call
 */
export const TTL_BY_TOOL: Record<string, number> = {
  // Time & Weather - relatively stable
  getweather: 300_000, // 5 minutes (was 30s - weather updates slowly)
  weather_current: 300_000, // 5 minutes (semantic router alias)
  getcurrenttime: 5_000, // 5 seconds (was 1s - still fresh enough)
  gettimezone: 300_000, // 5 minutes (was 1min - timezones don't change)

  // News - changes slowly
  getnews: 180_000, // 3 minutes (was 1min - news doesn't change per-second)
  searchnews: 120_000, // 2 minutes (was 30s - search results stable)

  // Market data - needs to be somewhat fresh (but not per-second)
  getmarketsummary: 60_000, // 1 minute (was 15s - good enough for overview)
  getquote: 30_000, // 30 seconds (was 10s - single quotes can wait)
  getportfolio: 120_000, // 2 minutes (was 30s - portfolios don't change fast)

  // Calendar - rarely changes intra-session
  getcalendartoday: 120_000, // 2 minutes (was 30s)
  getschedule: 120_000, // 2 minutes (was 30s)
  getupcomingmeetings: 120_000, // 2 minutes (was 30s)

  // Tasks & Lists - moderate TTL
  gettasks: 60_000, // 1 minute (was 20s)
  getnotes: 60_000, // 1 minute (was 20s)
  getbills: 180_000, // 3 minutes (was 1min)

  // Home automation - sensor data changes (keep shorter)
  gethomestatus: 30_000, // 30 seconds (was 10s)
  getdevices: 120_000, // 2 minutes (was 30s - device list very stable)

  // User context - stable within session (extended significantly)
  getrelationshipsummary: 300_000, // 5 minutes (was 2min)
  gethabits: 180_000, // 3 minutes (was 1min)
  get_persona_memories: 120_000, // 2 minutes (memories stable within session)
  get_user_profile: 300_000, // 5 minutes (profile very stable)

  // Packages & Shipping
  getpackages: 180_000, // 3 minutes (was 1min)

  // Games
  getgamestatus: 60_000, // 1 minute (was 30s)

  // Medication
  medicationschedule: 180_000, // 3 minutes (was 1min)

  // Music (new)
  getmusichistory: 120_000, // 2 minutes
  getplaybackstatus: 10_000, // 10 seconds (playback changes)

  // Contacts (new)
  getcontacts: 180_000, // 3 minutes
  getcontact: 120_000, // 2 minutes
};

/**
 * Tools that invalidate related caches when executed
 * (write operations that affect cached data)
 */
export const CACHE_INVALIDATION_MAP: Record<string, string[]> = {
  // Task mutations invalidate task cache
  addtask: ['gettasks'],
  completetask: ['gettasks'],
  deletetask: ['gettasks'],

  // Calendar mutations
  createcalendarevent: ['getcalendartoday', 'getschedule', 'getupcomingmeetings'],
  scheduleevent: ['getcalendartoday', 'getschedule', 'getupcomingmeetings'],

  // Bill mutations
  addbill: ['getbills'],
  paybill: ['getbills'],

  // Home automation
  controldevice: ['gethomestatus'],
  setdevice: ['gethomestatus', 'getdevices'],

  // Note mutations
  addnote: ['getnotes'],
  deletenote: ['getnotes'],
};

// ============================================================================
// TOOL RESPONSE CACHE
// ============================================================================

class ToolResponseCache {
  private caches = new Map<string, LRUCache<string, CachedToolResponse>>();
  private config: Required<ToolCacheConfig>;
  private metrics: ToolCacheMetrics = {
    hits: 0,
    misses: 0,
    evictions: 0,
    totalSavedMs: 0,
    cacheSize: 0,
  };
  private avgToolLatencyMs = 150; // Estimated average tool latency for savings calculation

  // Redis backing (L2 cache for persistence across restarts)
  private redisCache: RedisCache = null;
  private redisInitialized = false;
  private redisKeyPrefix = 'tool:';

  constructor(config: ToolCacheConfig = {}) {
    this.config = {
      maxEntries: config.maxEntries ?? 100,
      defaultTtlMs: config.defaultTtlMs ?? 30_000,
      enabled: config.enabled ?? true,
    };

    // Initialize Redis in background (non-blocking)
    this.initializeRedis();
  }

  /**
   * Initialize Redis connection (non-blocking)
   */
  private async initializeRedis(): Promise<void> {
    if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
      log.debug('Redis not configured, using memory-only tool cache');
      return;
    }

    try {
      const { getRedisCache } = await import('../memory/redis-cache.js');
      this.redisCache = getRedisCache();
      await this.redisCache.initialize();
      this.redisInitialized = true;
      log.info('Tool response cache initialized with Redis backing (L2)');
    } catch (error) {
      log.warn({ error: String(error) }, 'Redis unavailable for tool cache, using memory-only');
      this.redisCache = null;
    }
  }

  /**
   * Get cache for a session, creating if needed
   */
  private getSessionCache(sessionId: string): LRUCache<string, CachedToolResponse> {
    let cache = this.caches.get(sessionId);
    if (!cache) {
      cache = new LRUCache<string, CachedToolResponse>({
        max: this.config.maxEntries,
        ttl: this.config.defaultTtlMs,
        updateAgeOnGet: false,
        dispose: () => {
          this.metrics.evictions++;
        },
      });
      this.caches.set(sessionId, cache);
    }
    return cache;
  }

  /**
   * Generate cache key for a tool call
   */
  private getCacheKey(fn: string, args: Record<string, unknown>): string {
    const fnLower = fn.toLowerCase();
    // Include relevant args in key (sorted for consistency)
    const argKeys = Object.keys(args).sort();
    const argsStr = argKeys.map((k) => `${k}=${JSON.stringify(args[k])}`).join('&');
    return `${fnLower}:${argsStr}`;
  }

  /**
   * Check if a tool is cacheable
   */
  isCacheable(fn: string): boolean {
    if (!this.config.enabled) return false;
    const fnLower = fn.toLowerCase();
    return fnLower in TTL_BY_TOOL;
  }

  /**
   * Get cached response if valid (checks memory L1, then Redis L2)
   */
  get(
    sessionId: string,
    fn: string,
    args: Record<string, unknown>
  ): { hit: boolean; result?: unknown } {
    if (!this.isCacheable(fn)) {
      return { hit: false };
    }

    const cache = this.getSessionCache(sessionId);
    const key = this.getCacheKey(fn, args);
    const cached = cache.get(key);

    // L1: Check in-memory cache first (fastest)
    if (cached) {
      const age = Date.now() - cached.cachedAt;
      if (age < cached.ttlMs) {
        cached.hitCount++;
        this.metrics.hits++;
        this.metrics.totalSavedMs += this.avgToolLatencyMs;
        log.debug(
          { fn, hitCount: cached.hitCount, ageMs: age, layer: 'L1' },
          '🎯 Tool response cache HIT (memory)'
        );
        return { hit: true, result: cached.result };
      }
      // Expired - will be replaced
      cache.delete(key);
    }

    this.metrics.misses++;
    return { hit: false };
  }

  /**
   * Get cached response async (includes Redis L2 lookup)
   * Use this for non-latency-critical paths
   */
  async getAsync(
    sessionId: string,
    fn: string,
    args: Record<string, unknown>
  ): Promise<{ hit: boolean; result?: unknown }> {
    // First check L1 (memory)
    const memoryResult = this.get(sessionId, fn, args);
    if (memoryResult.hit) {
      return memoryResult;
    }

    // L2: Check Redis if available
    if (this.redisCache && this.redisInitialized) {
      try {
        const key = this.getCacheKey(fn, args);
        const redisKey = `${this.redisKeyPrefix}${sessionId}:${key}`;
        const redisData = await this.redisCache.getSession(redisKey);

        if (redisData) {
          // Found in Redis - populate L1 cache and return
          const cached = redisData as unknown as CachedToolResponse;
          const age = Date.now() - cached.cachedAt;

          if (age < cached.ttlMs) {
            // Valid - populate L1 and return
            const cache = this.getSessionCache(sessionId);
            cache.set(key, cached);
            this.metrics.hits++;
            this.metrics.totalSavedMs += this.avgToolLatencyMs;
            log.debug({ fn, ageMs: age, layer: 'L2' }, '🎯 Tool response cache HIT (Redis)');
            return { hit: true, result: cached.result };
          }
          // Expired in Redis too - delete it
          await this.redisCache.deleteSession(redisKey);
        }
      } catch (error) {
        log.debug({ error: String(error), fn }, 'Redis L2 lookup failed');
      }
    }

    return { hit: false };
  }

  /**
   * Cache a tool response (writes to L1 memory and L2 Redis)
   */
  set(sessionId: string, fn: string, args: Record<string, unknown>, result: unknown): void {
    if (!this.isCacheable(fn)) return;

    const cache = this.getSessionCache(sessionId);
    const key = this.getCacheKey(fn, args);
    const fnLower = fn.toLowerCase();
    const ttlMs = TTL_BY_TOOL[fnLower] ?? this.config.defaultTtlMs;

    const cachedResponse: CachedToolResponse = {
      result,
      cachedAt: Date.now(),
      ttlMs,
      hitCount: 0,
    };

    // L1: Always set in memory cache (synchronous)
    cache.set(key, cachedResponse);
    this.metrics.cacheSize = cache.size;

    // L2: Write to Redis in background (non-blocking)
    if (this.redisCache && this.redisInitialized) {
      const redisKey = `${this.redisKeyPrefix}${sessionId}:${key}`;
      // Fire-and-forget Redis write
      void this.redisCache
        .setSession(redisKey, cachedResponse as unknown as Record<string, unknown>, ttlMs / 1000)
        .catch((error) => {
          log.debug({ error: String(error), fn }, 'Redis L2 write failed');
        });
    }

    log.debug(
      { fn, ttlMs, cacheSize: cache.size, redisEnabled: !!this.redisCache },
      '💾 Tool response cached'
    );
  }

  /**
   * Invalidate caches affected by a write operation
   *
   * RACE CONDITION FIX: Collect keys to delete first, then delete them.
   * This prevents modifying the Map during iteration which can cause
   * skipped entries or undefined behavior.
   */
  invalidate(sessionId: string, writeFn: string): void {
    const fnLower = writeFn.toLowerCase();
    const toInvalidate = CACHE_INVALIDATION_MAP[fnLower];

    if (!toInvalidate || toInvalidate.length === 0) return;

    const cache = this.getSessionCache(sessionId);

    // Collect all keys to delete FIRST (don't modify during iteration)
    const keysToDelete: string[] = [];

    for (const targetFn of toInvalidate) {
      for (const key of cache.keys()) {
        if (key.startsWith(`${targetFn}:`)) {
          keysToDelete.push(key);
        }
      }
    }

    // Now delete the collected keys
    for (const key of keysToDelete) {
      cache.delete(key);
      log.debug({ writeFn, invalidated: key }, '🗑️ Cache invalidated by write operation');
    }
  }

  /**
   * Clear cache for a session (clears L1 and L2)
   */
  clearSession(sessionId: string): void {
    const cache = this.caches.get(sessionId);
    if (cache) {
      const size = cache.size;
      cache.clear();
      this.caches.delete(sessionId);
      log.debug({ sessionId, entriesCleared: size }, '🧹 Session cache cleared');
    }

    // Clear from Redis L2 in background
    if (this.redisCache && this.redisInitialized) {
      const keyPrefix = `${this.redisKeyPrefix}${sessionId}:`;
      void this.redisCache.deleteSession(keyPrefix).catch((error) => {
        log.debug({ error: String(error), sessionId }, 'Redis session clear failed');
      });
    }
  }

  /**
   * Get metrics (includes Redis status)
   */
  getMetrics(): ToolCacheMetrics & { redisEnabled: boolean } {
    return {
      ...this.metrics,
      redisEnabled: this.redisInitialized && this.redisCache !== null,
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalSavedMs: 0,
      cacheSize: 0,
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

/**
 * RACE CONDITION FIX: Use Promise-based singleton pattern to prevent
 * multiple instances being created by concurrent callers.
 */
let toolResponseCacheInstance: ToolResponseCache | null = null;
let toolResponseCacheInitPromise: Promise<ToolResponseCache> | null = null;

export function getToolResponseCache(config?: ToolCacheConfig): ToolResponseCache {
  // Fast path: already initialized
  if (toolResponseCacheInstance) {
    return toolResponseCacheInstance;
  }

  // Synchronous initialization (safe because constructor is synchronous)
  toolResponseCacheInstance = new ToolResponseCache(config);
  return toolResponseCacheInstance;
}

/**
 * Reset the singleton instance (for testing only)
 */
export function resetToolResponseCache(): void {
  toolResponseCacheInstance = null;
  toolResponseCacheInitPromise = null;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Check cache before executing a tool (synchronous - L1 memory only)
 */
export function checkToolCache(
  sessionId: string,
  fn: string,
  args: Record<string, unknown>
): { hit: boolean; result?: unknown } {
  return getToolResponseCache().get(sessionId, fn, args);
}

/**
 * Check cache before executing a tool (async - includes L2 Redis lookup)
 * Use this for non-latency-critical paths where Redis lookup is acceptable
 */
export async function checkToolCacheAsync(
  sessionId: string,
  fn: string,
  args: Record<string, unknown>
): Promise<{ hit: boolean; result?: unknown }> {
  return getToolResponseCache().getAsync(sessionId, fn, args);
}

/**
 * Cache a tool result after execution
 */
export function cacheToolResult(
  sessionId: string,
  fn: string,
  args: Record<string, unknown>,
  result: unknown
): void {
  getToolResponseCache().set(sessionId, fn, args, result);
}

/**
 * Invalidate cache entries affected by a write operation
 */
export function invalidateToolCache(sessionId: string, writeFn: string): void {
  getToolResponseCache().invalidate(sessionId, writeFn);
}

/**
 * Clear all cache for a session (call on session end)
 */
export function clearSessionToolCache(sessionId: string): void {
  getToolResponseCache().clearSession(sessionId);
}

/**
 * Get cache metrics for monitoring
 */
export function getToolCacheMetrics(): ToolCacheMetrics {
  return getToolResponseCache().getMetrics();
}

export default ToolResponseCache;
