/**
 * Tool Result Cache
 *
 * Smart caching layer for tool results with:
 * - Tiered TTLs based on data type (news vs stocks vs weather)
 * - Stale-while-revalidate pattern
 * - LRU eviction to prevent memory bloat
 * - Freshness indicators for UI
 *
 * Philosophy: Stale data is better than no data (for most use cases).
 * The user would rather hear "here's what I found recently" than "failed".
 */
import { type CachedToolResult, type CacheConfig } from './types.js';
declare class ToolResultCache {
    private cache;
    private accessOrder;
    private configs;
    private cleanupTimer;
    constructor();
    /**
     * Generate cache key from tool name and query params
     */
    private makeKey;
    /**
     * Get TTL for a cache category
     */
    private getTTL;
    /**
     * Get max stale age for a category
     */
    private getMaxStaleAge;
    /**
     * Determine freshness of cached data
     */
    private determineFreshness;
    /**
     * Update LRU access order
     */
    private updateAccessOrder;
    /**
     * Evict oldest entries if over limit
     */
    private evictIfNeeded;
    /**
     * Start periodic cleanup of expired entries
     */
    private startCleanup;
    /**
     * Remove expired entries
     */
    private cleanup;
    /**
     * Extract category from cache key (tool name maps to category)
     */
    private getCategoryFromKey;
    /**
     * Set a value in the cache
     */
    set<T>(toolName: string, query: string, data: T, category?: string): void;
    /**
     * Get a fresh value from cache (returns null if stale/expired)
     */
    get<T>(toolName: string, query: string): CachedToolResult<T> | null;
    /**
     * Get a value with staleness info (returns stale data if within maxStaleAge)
     * This is the "stale-while-revalidate" getter
     */
    getWithStaleness<T>(toolName: string, query: string, maxStaleAge?: number): CachedToolResult<T> | null;
    /**
     * Check if we have any data (fresh, stale, or expired)
     */
    has(toolName: string, query: string): boolean;
    /**
     * Invalidate cache for a tool
     */
    invalidate(toolName: string, query?: string): void;
    /**
     * Clear all cache entries
     */
    clear(): void;
    /**
     * Get cache statistics
     */
    getStats(): {
        size: number;
        maxSize: number;
        categories: Record<string, number>;
    };
    /**
     * Update cache configuration
     */
    setConfig(category: string, config: Partial<CacheConfig>): void;
    /**
     * Stop cleanup timer (for testing/shutdown)
     */
    stop(): void;
}
/**
 * Singleton cache instance
 */
export declare const toolCache: ToolResultCache;
export { ToolResultCache };
//# sourceMappingURL=tool-cache.d.ts.map