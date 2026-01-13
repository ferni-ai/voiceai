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
import { getLogger } from '../../utils/safe-logger.js';
import { DEFAULT_CACHE_CONFIGS } from './types.js';
const log = getLogger();
// ============================================================================
// CACHE CONFIGURATION
// ============================================================================
const MAX_CACHE_ENTRIES = 500;
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
// ============================================================================
// TOOL RESULT CACHE
// ============================================================================
class ToolResultCache {
    cache = new Map();
    accessOrder = []; // For LRU eviction
    configs;
    cleanupTimer = null;
    constructor() {
        this.configs = { ...DEFAULT_CACHE_CONFIGS };
        this.startCleanup();
    }
    /**
     * Generate cache key from tool name and query params
     */
    makeKey(toolName, query) {
        return `${toolName}:${query}`;
    }
    /**
     * Get TTL for a cache category
     */
    getTTL(category) {
        return this.configs[category]?.ttl || 60 * 1000; // Default 1 minute
    }
    /**
     * Get max stale age for a category
     */
    getMaxStaleAge(category) {
        return this.configs[category]?.maxStaleAge || 10 * 60 * 1000; // Default 10 minutes
    }
    /**
     * Determine freshness of cached data
     */
    determineFreshness(timestamp, ttl, maxStaleAge) {
        const age = Date.now() - timestamp;
        if (age < ttl) {
            return 'fresh';
        }
        else if (age < maxStaleAge) {
            return 'stale';
        }
        return 'expired';
    }
    /**
     * Update LRU access order
     */
    updateAccessOrder(key) {
        const index = this.accessOrder.indexOf(key);
        if (index > -1) {
            this.accessOrder.splice(index, 1);
        }
        this.accessOrder.push(key);
    }
    /**
     * Evict oldest entries if over limit
     */
    evictIfNeeded() {
        while (this.cache.size > MAX_CACHE_ENTRIES && this.accessOrder.length > 0) {
            const oldest = this.accessOrder.shift();
            if (oldest) {
                this.cache.delete(oldest);
                log.debug({ key: oldest }, 'Evicted cache entry (LRU)');
            }
        }
    }
    /**
     * Start periodic cleanup of expired entries
     */
    startCleanup() {
        if (this.cleanupTimer)
            return;
        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, CLEANUP_INTERVAL);
        // Don't prevent process exit
        if (this.cleanupTimer.unref) {
            this.cleanupTimer.unref();
        }
    }
    /**
     * Remove expired entries
     */
    cleanup() {
        const now = Date.now();
        let removed = 0;
        for (const [key, entry] of this.cache.entries()) {
            const category = this.getCategoryFromKey(key);
            const maxStaleAge = this.getMaxStaleAge(category);
            if (now - entry.timestamp > maxStaleAge) {
                this.cache.delete(key);
                const accessIndex = this.accessOrder.indexOf(key);
                if (accessIndex > -1) {
                    this.accessOrder.splice(accessIndex, 1);
                }
                removed++;
            }
        }
        if (removed > 0) {
            log.debug({ removed, remaining: this.cache.size }, 'Cache cleanup completed');
        }
    }
    /**
     * Extract category from cache key (tool name maps to category)
     */
    getCategoryFromKey(key) {
        const toolName = key.split(':')[0];
        // Map tool names to categories
        if (toolName.toLowerCase().includes('news'))
            return 'news';
        if (toolName.toLowerCase().includes('weather'))
            return 'weather';
        if (toolName.toLowerCase().includes('stock'))
            return 'stocks';
        if (toolName.toLowerCase().includes('calendar'))
            return 'calendar';
        if (toolName.toLowerCase().includes('search'))
            return 'search';
        return 'default';
    }
    // ============================================================================
    // PUBLIC API
    // ============================================================================
    /**
     * Set a value in the cache
     */
    set(toolName, query, data, category) {
        const key = this.makeKey(toolName, query);
        const cat = category || this.getCategoryFromKey(key);
        const ttl = this.getTTL(cat);
        const entry = {
            data,
            timestamp: Date.now(),
            source: toolName,
            key,
            freshness: 'fresh',
            ttl,
        };
        this.cache.set(key, entry);
        this.updateAccessOrder(key);
        this.evictIfNeeded();
        log.debug({ key, category: cat, ttl }, 'Cached tool result');
    }
    /**
     * Get a fresh value from cache (returns null if stale/expired)
     */
    get(toolName, query) {
        const key = this.makeKey(toolName, query);
        const entry = this.cache.get(key);
        if (!entry) {
            return null;
        }
        const category = this.getCategoryFromKey(key);
        const ttl = this.getTTL(category);
        const maxStaleAge = this.getMaxStaleAge(category);
        const freshness = this.determineFreshness(entry.timestamp, ttl, maxStaleAge);
        // Only return if fresh
        if (freshness === 'fresh') {
            this.updateAccessOrder(key);
            return { ...entry, freshness };
        }
        return null;
    }
    /**
     * Get a value with staleness info (returns stale data if within maxStaleAge)
     * This is the "stale-while-revalidate" getter
     */
    getWithStaleness(toolName, query, maxStaleAge) {
        const key = this.makeKey(toolName, query);
        const entry = this.cache.get(key);
        if (!entry) {
            return null;
        }
        const category = this.getCategoryFromKey(key);
        const ttl = this.getTTL(category);
        const effectiveMaxStale = maxStaleAge ?? this.getMaxStaleAge(category);
        const freshness = this.determineFreshness(entry.timestamp, ttl, effectiveMaxStale);
        // Return if fresh or stale (not expired)
        if (freshness !== 'expired') {
            this.updateAccessOrder(key);
            return { ...entry, freshness };
        }
        return null;
    }
    /**
     * Check if we have any data (fresh, stale, or expired)
     */
    has(toolName, query) {
        const key = this.makeKey(toolName, query);
        return this.cache.has(key);
    }
    /**
     * Invalidate cache for a tool
     */
    invalidate(toolName, query) {
        if (query) {
            const key = this.makeKey(toolName, query);
            this.cache.delete(key);
            const index = this.accessOrder.indexOf(key);
            if (index > -1) {
                this.accessOrder.splice(index, 1);
            }
        }
        else {
            // Invalidate all entries for this tool
            for (const key of Array.from(this.cache.keys())) {
                if (key.startsWith(`${toolName}:`)) {
                    this.cache.delete(key);
                    const index = this.accessOrder.indexOf(key);
                    if (index > -1) {
                        this.accessOrder.splice(index, 1);
                    }
                }
            }
        }
        log.debug({ toolName, query }, 'Invalidated cache');
    }
    /**
     * Clear all cache entries
     */
    clear() {
        this.cache.clear();
        this.accessOrder = [];
        log.info('Cache cleared');
    }
    /**
     * Get cache statistics
     */
    getStats() {
        const categories = {};
        for (const key of this.cache.keys()) {
            const cat = this.getCategoryFromKey(key);
            categories[cat] = (categories[cat] || 0) + 1;
        }
        return {
            size: this.cache.size,
            maxSize: MAX_CACHE_ENTRIES,
            categories,
        };
    }
    /**
     * Update cache configuration
     */
    setConfig(category, config) {
        this.configs[category] = {
            ...this.configs[category],
            ...config,
        };
    }
    /**
     * Stop cleanup timer (for testing/shutdown)
     */
    stop() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }
}
// ============================================================================
// SINGLETON EXPORT
// ============================================================================
/**
 * Singleton cache instance
 */
export const toolCache = new ToolResultCache();
// Also export class for testing
export { ToolResultCache };
//# sourceMappingURL=tool-cache.js.map