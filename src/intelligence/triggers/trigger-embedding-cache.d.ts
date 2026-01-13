/**
 * Trigger Embedding Cache
 *
 * Persistent cache for trigger embeddings using Firestore.
 * Reduces API calls and startup time by caching embeddings
 * that rarely change.
 *
 * Philosophy: Triggers are defined in persona behavior JSONs and
 * change infrequently. Cache aggressively with long TTLs.
 *
 * @module TriggerEmbeddingCache
 */
import type { CachedTriggerEmbedding, TriggerEmbeddingCacheConfig, EmbeddedTrigger } from './types.js';
/**
 * Cache for trigger embeddings with Firestore persistence
 */
export declare class TriggerEmbeddingCache {
    private memoryCache;
    private config;
    private firestoreDb;
    private initialized;
    private initPromise;
    private stats;
    constructor(config?: Partial<TriggerEmbeddingCacheConfig>);
    /**
     * Initialize Firestore connection
     */
    private initFirestore;
    /**
     * Generate a unique ID for a trigger
     */
    private generateTriggerId;
    /**
     * Generate content hash for cache validation
     */
    private hashTriggerText;
    /**
     * Check if a cached entry is expired
     */
    private isExpired;
    /**
     * Get a cached trigger embedding
     */
    get(personaId: string, triggerName: string, triggerText: string): Promise<CachedTriggerEmbedding | null>;
    /**
     * Store a trigger embedding in cache
     */
    set(personaId: string, triggerName: string, triggerText: string, embedding: number[], model: string): Promise<void>;
    /**
     * Set in memory cache with LRU eviction
     */
    private setInMemory;
    /**
     * Set in Firestore
     */
    private setInFirestore;
    /**
     * Evict least recently used entry
     */
    private evictLRU;
    /**
     * Bulk load embeddings for a persona from Firestore
     */
    loadForPersona(personaId: string): Promise<CachedTriggerEmbedding[]>;
    /**
     * Bulk save embeddings to Firestore
     */
    bulkSave(embeddings: EmbeddedTrigger[], model: string): Promise<number>;
    /**
     * Invalidate a specific trigger's cache
     */
    invalidate(personaId: string, triggerName: string): Promise<void>;
    /**
     * Invalidate all triggers for a persona
     */
    invalidatePersona(personaId: string): Promise<number>;
    /**
     * Clear all caches
     */
    clear(): Promise<void>;
    /**
     * Get cache statistics
     */
    getStats(): {
        memorySize: number;
        maxSize: number;
        memoryHits: number;
        memoryMisses: number;
        firestoreHits: number;
        firestoreMisses: number;
        evictions: number;
        hitRate: number;
        firestoreEnabled: boolean;
    };
    /**
     * Prune expired entries from memory
     */
    pruneExpired(): number;
}
/**
 * Get the singleton trigger embedding cache
 */
export declare function getTriggerEmbeddingCache(config?: Partial<TriggerEmbeddingCacheConfig>): TriggerEmbeddingCache;
/**
 * Reset the singleton (for testing)
 */
export declare function resetTriggerEmbeddingCache(): void;
declare const _default: {
    TriggerEmbeddingCache: typeof TriggerEmbeddingCache;
    getTriggerEmbeddingCache: typeof getTriggerEmbeddingCache;
    resetTriggerEmbeddingCache: typeof resetTriggerEmbeddingCache;
};
export default _default;
//# sourceMappingURL=trigger-embedding-cache.d.ts.map