/**
 * Entity Resolution Cache - Session-scoped caching for entity lookups
 *
 * Reduces Firestore reads during entity resolution by caching:
 * 1. User entity lists (getAllEntities scans)
 * 2. Individual entity lookups by ID
 * 3. Alias → entity mappings
 *
 * The cache is invalidated on writes and has a configurable TTL.
 *
 * @module memory/entity-store/entity-cache
 */
import type { Entity, EntityType, EntitySearchOptions } from './types.js';
interface EntityCacheConfig {
    /** TTL for entity list cache (ms) */
    entityListTtlMs: number;
    /** TTL for individual entity cache (ms) */
    entityTtlMs: number;
    /** TTL for alias lookup cache (ms) */
    aliasTtlMs: number;
    /** Max entities per user to cache */
    maxEntitiesPerUser: number;
    /** Max users to cache */
    maxUsers: number;
}
/**
 * Configure the entity cache
 */
export declare function configureEntityCache(overrides: Partial<EntityCacheConfig>): void;
/**
 * Get cached entity list for user
 */
export declare function getCachedEntityList(userId: string, options?: EntitySearchOptions): Entity[] | null;
/**
 * Cache entity list for user
 */
export declare function cacheEntityList(userId: string, entities: Entity[], options?: EntitySearchOptions): void;
/**
 * Get cached entity by ID
 */
export declare function getCachedEntity(userId: string, entityId: string): Entity | null;
/**
 * Cache individual entity
 */
export declare function cacheEntity(userId: string, entity: Entity): void;
/**
 * Get entity ID from cached alias mapping
 */
export declare function getCachedEntityIdByAlias(userId: string, alias: string, type?: EntityType): string | null;
/**
 * Cache alias → entity ID mapping
 */
export declare function cacheAliasMapping(userId: string, alias: string, entityId: string, type?: EntityType): void;
/**
 * Invalidate all caches for a user (call on write operations)
 */
export declare function invalidateUserCache(userId: string): void;
/**
 * Invalidate specific entity in cache
 */
export declare function invalidateEntity(userId: string, entityId: string): void;
/**
 * Clear all entity caches (for testing or memory pressure)
 */
export declare function clearAllEntityCaches(): void;
interface EntityCacheMetrics {
    totalUsers: number;
    totalCachedEntities: number;
    totalAliasEntries: number;
    hitRate: {
        entityList: number;
        entityById: number;
        alias: number;
    };
}
export declare function recordCacheHit(type: 'entityList' | 'entityById' | 'alias'): void;
export declare function recordCacheMiss(type: 'entityList' | 'entityById' | 'alias'): void;
/**
 * Get cache metrics
 */
export declare function getEntityCacheMetrics(): EntityCacheMetrics;
/**
 * Reset cache metrics (for testing)
 */
export declare function resetEntityCacheMetrics(): void;
export {};
//# sourceMappingURL=entity-cache.d.ts.map