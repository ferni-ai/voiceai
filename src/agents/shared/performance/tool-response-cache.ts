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

import { createLogger } from '../../../utils/safe-logger.js';
import { LRUCache } from 'lru-cache';

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
 */
export const TTL_BY_TOOL: Record<string, number> = {
  // Time & Weather - relatively stable
  getweather: 30_000, // 30 seconds
  getcurrenttime: 1_000, // 1 second (useful for rapid "what time is it" queries)
  gettimezone: 60_000, // 1 minute

  // News - changes slowly
  getnews: 60_000, // 1 minute
  searchnews: 30_000, // 30 seconds (search results might vary)

  // Market data - needs to be somewhat fresh
  getmarketsummary: 15_000, // 15 seconds
  getquote: 10_000, // 10 seconds (individual quotes more time-sensitive)
  getportfolio: 30_000, // 30 seconds

  // Calendar - rarely changes intra-session
  getcalendartoday: 30_000, // 30 seconds
  getschedule: 30_000, // 30 seconds
  getupcomingmeetings: 30_000, // 30 seconds

  // Tasks & Lists - moderate TTL
  gettasks: 20_000, // 20 seconds
  getnotes: 20_000, // 20 seconds
  getbills: 60_000, // 1 minute

  // Home automation - sensor data changes
  gethomestatus: 10_000, // 10 seconds (sensors update)
  getdevices: 30_000, // 30 seconds (device list stable)

  // User context - stable within session
  getrelationshipsummary: 120_000, // 2 minutes (rarely changes)
  gethabits: 60_000, // 1 minute

  // Packages & Shipping
  getpackages: 60_000, // 1 minute

  // Games
  getgamestatus: 30_000, // 30 seconds

  // Medication
  medicationschedule: 60_000, // 1 minute
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

  constructor(config: ToolCacheConfig = {}) {
    this.config = {
      maxEntries: config.maxEntries ?? 100,
      defaultTtlMs: config.defaultTtlMs ?? 30_000,
      enabled: config.enabled ?? true,
    };
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
   * Get cached response if valid
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

    if (cached) {
      const age = Date.now() - cached.cachedAt;
      if (age < cached.ttlMs) {
        cached.hitCount++;
        this.metrics.hits++;
        this.metrics.totalSavedMs += this.avgToolLatencyMs;
        log.debug({ fn, hitCount: cached.hitCount, ageMs: age }, '🎯 Tool response cache HIT');
        return { hit: true, result: cached.result };
      }
      // Expired - will be replaced
      cache.delete(key);
    }

    this.metrics.misses++;
    return { hit: false };
  }

  /**
   * Cache a tool response
   */
  set(sessionId: string, fn: string, args: Record<string, unknown>, result: unknown): void {
    if (!this.isCacheable(fn)) return;

    const cache = this.getSessionCache(sessionId);
    const key = this.getCacheKey(fn, args);
    const fnLower = fn.toLowerCase();
    const ttlMs = TTL_BY_TOOL[fnLower] ?? this.config.defaultTtlMs;

    cache.set(key, {
      result,
      cachedAt: Date.now(),
      ttlMs,
      hitCount: 0,
    });

    this.metrics.cacheSize = cache.size;
    log.debug({ fn, ttlMs, cacheSize: cache.size }, '💾 Tool response cached');
  }

  /**
   * Invalidate caches affected by a write operation
   */
  invalidate(sessionId: string, writeFn: string): void {
    const fnLower = writeFn.toLowerCase();
    const toInvalidate = CACHE_INVALIDATION_MAP[fnLower];

    if (!toInvalidate || toInvalidate.length === 0) return;

    const cache = this.getSessionCache(sessionId);

    for (const targetFn of toInvalidate) {
      // Delete all entries for this tool (any args)
      for (const key of cache.keys()) {
        if (key.startsWith(`${targetFn}:`)) {
          cache.delete(key);
          log.debug({ writeFn, invalidated: key }, '🗑️ Cache invalidated by write operation');
        }
      }
    }
  }

  /**
   * Clear cache for a session
   */
  clearSession(sessionId: string): void {
    const cache = this.caches.get(sessionId);
    if (cache) {
      const size = cache.size;
      cache.clear();
      this.caches.delete(sessionId);
      log.debug({ sessionId, entriesCleared: size }, '🧹 Session cache cleared');
    }
  }

  /**
   * Get metrics
   */
  getMetrics(): ToolCacheMetrics {
    return { ...this.metrics };
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

let toolResponseCacheInstance: ToolResponseCache | null = null;

export function getToolResponseCache(config?: ToolCacheConfig): ToolResponseCache {
  if (!toolResponseCacheInstance) {
    toolResponseCacheInstance = new ToolResponseCache(config);
  }
  return toolResponseCacheInstance;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Check cache before executing a tool
 */
export function checkToolCache(
  sessionId: string,
  fn: string,
  args: Record<string, unknown>
): { hit: boolean; result?: unknown } {
  return getToolResponseCache().get(sessionId, fn, args);
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
