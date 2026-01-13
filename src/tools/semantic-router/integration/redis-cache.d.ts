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
import type { EmbeddingVector } from '../types.js';
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
interface CachedToolIndex {
    toolId: string;
    descriptionEmbedding: number[];
    exampleEmbeddings: number[][];
    model: string;
    version: string;
    timestamp: number;
}
/**
 * Configure the cache layer
 */
export declare function configureCacheLayer(newConfig: Partial<CacheConfig>): void;
/**
 * Semantic Router Cache
 *
 * Provides high-level caching for:
 * - Embeddings (expensive API calls)
 * - Routing scores (computation results)
 * - User profiles (personalization data)
 * - Tool embeddings index (pre-computed)
 */
export declare class SemanticRouterCache {
    private redis;
    private memoryCache;
    private initialized;
    private initPromise;
    private hits;
    private misses;
    private sets;
    initialize(): Promise<void>;
    private doInitialize;
    getEmbedding(text: string, model: string): Promise<EmbeddingVector | null>;
    setEmbedding(text: string, model: string, vector: EmbeddingVector): Promise<void>;
    getScores(query: string, context?: string): Promise<Record<string, number> | null>;
    setScores(query: string, scores: Record<string, number>, context?: string): Promise<void>;
    getProfile(userId: string): Promise<Record<string, unknown> | null>;
    setProfile(userId: string, profile: Record<string, unknown>): Promise<void>;
    invalidateProfile(userId: string): Promise<void>;
    /**
     * Get pre-computed tool embeddings from cache
     */
    getToolIndex(toolId: string, version: string): Promise<CachedToolIndex | null>;
    /**
     * Store pre-computed tool embeddings
     */
    setToolIndex(index: CachedToolIndex): Promise<void>;
    /**
     * Get all cached tool indices for a version
     */
    getAllToolIndices(version: string): Promise<CachedToolIndex[]>;
    getStats(): CacheStats;
    /**
     * Clear all caches (for testing)
     */
    clear(): Promise<void>;
    private hashKey;
}
export declare function getSemanticRouterCache(): SemanticRouterCache;
export declare function initializeCache(): Promise<void>;
export type { CachedToolIndex };
//# sourceMappingURL=redis-cache.d.ts.map