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
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'entity-store:cache' });
const DEFAULT_CONFIG = {
    entityListTtlMs: 60_000, // 1 minute - entity lists don't change often within a session
    entityTtlMs: 30_000, // 30 seconds - individual entities
    aliasTtlMs: 60_000, // 1 minute - alias mappings
    maxEntitiesPerUser: 500,
    maxUsers: 100,
};
let config = { ...DEFAULT_CONFIG };
/**
 * Configure the entity cache
 */
export function configureEntityCache(overrides) {
    config = { ...DEFAULT_CONFIG, ...overrides };
    log.info({ config }, 'Entity cache configured');
}
// Per-user cache
const userCaches = new Map();
// ============================================================================
// CACHE OPERATIONS
// ============================================================================
function getUserCache(userId) {
    let cache = userCaches.get(userId);
    if (!cache) {
        // Enforce max users limit
        if (userCaches.size >= config.maxUsers) {
            // Remove oldest entry (first in map)
            const firstKey = userCaches.keys().next().value;
            if (firstKey) {
                userCaches.delete(firstKey);
                log.debug({ evictedUser: firstKey }, 'Evicted user from entity cache (max users reached)');
            }
        }
        cache = {
            entityListByType: new Map(),
            entitiesById: new Map(),
            aliasToEntityId: new Map(),
        };
        userCaches.set(userId, cache);
    }
    return cache;
}
function isExpired(entry) {
    if (!entry)
        return true;
    return Date.now() > entry.expiresAt;
}
// ============================================================================
// ENTITY LIST CACHE
// ============================================================================
/**
 * Get cached entity list for user
 */
export function getCachedEntityList(userId, options) {
    // Don't create cache just for reading
    const cache = userCaches.get(userId);
    if (!cache)
        return null;
    // If filtering by type, check type-specific cache
    if (options?.types && options.types.length === 1) {
        const type = options.types[0];
        const entry = cache.entityListByType.get(type);
        if (!isExpired(entry)) {
            return entry.data;
        }
        return null;
    }
    // Otherwise check full entity list
    if (!isExpired(cache.entityList)) {
        let entities = cache.entityList.data;
        // Apply filters in memory
        if (options?.types && options.types.length > 0) {
            entities = entities.filter((e) => options.types.includes(e.type));
        }
        if (options?.topK || options?.limit) {
            entities = entities.slice(0, options.topK || options.limit);
        }
        return entities;
    }
    return null;
}
/**
 * Cache entity list for user
 */
export function cacheEntityList(userId, entities, options) {
    const cache = getUserCache(userId);
    // If this is a type-specific query, cache under that type
    if (options?.types && options.types.length === 1) {
        const type = options.types[0];
        cache.entityListByType.set(type, {
            data: entities,
            expiresAt: Date.now() + config.entityListTtlMs,
        });
        log.debug({ userId, type, count: entities.length }, 'Cached entity list by type');
    }
    else {
        // Cache full entity list
        cache.entityList = {
            data: entities.slice(0, config.maxEntitiesPerUser),
            expiresAt: Date.now() + config.entityListTtlMs,
        };
        log.debug({ userId, count: entities.length }, 'Cached full entity list');
    }
    // Also cache individual entities
    for (const entity of entities) {
        cacheEntity(userId, entity);
    }
}
// ============================================================================
// INDIVIDUAL ENTITY CACHE
// ============================================================================
/**
 * Get cached entity by ID
 */
export function getCachedEntity(userId, entityId) {
    // Don't create cache just for reading
    const cache = userCaches.get(userId);
    if (!cache)
        return null;
    const entry = cache.entitiesById.get(entityId);
    if (!isExpired(entry)) {
        return entry.data;
    }
    return null;
}
/**
 * Cache individual entity
 */
export function cacheEntity(userId, entity) {
    const cache = getUserCache(userId);
    cache.entitiesById.set(entity.id, {
        data: entity,
        expiresAt: Date.now() + config.entityTtlMs,
    });
    // Also cache alias mappings
    for (const alias of entity.aliases || []) {
        cacheAliasMapping(userId, alias, entity.id, entity.type);
    }
    // Cache canonical name
    if (entity.canonicalName) {
        cacheAliasMapping(userId, entity.canonicalName, entity.id, entity.type);
    }
    // Cache specific relation if present
    if (entity.specificRelation) {
        cacheAliasMapping(userId, entity.specificRelation, entity.id, entity.type);
    }
}
// ============================================================================
// ALIAS CACHE
// ============================================================================
function getAliasCacheKey(alias, type) {
    const normalizedAlias = alias.toLowerCase().trim();
    return type ? `${normalizedAlias}:${type}` : normalizedAlias;
}
/**
 * Get entity ID from cached alias mapping
 */
export function getCachedEntityIdByAlias(userId, alias, type) {
    // Don't create cache just for reading
    const cache = userCaches.get(userId);
    if (!cache)
        return null;
    const key = getAliasCacheKey(alias, type);
    const entry = cache.aliasToEntityId.get(key);
    if (!isExpired(entry)) {
        return entry.data;
    }
    // Also try without type constraint
    if (type) {
        const keyNoType = getAliasCacheKey(alias);
        const entryNoType = cache.aliasToEntityId.get(keyNoType);
        if (!isExpired(entryNoType)) {
            return entryNoType.data;
        }
    }
    return null;
}
/**
 * Cache alias → entity ID mapping
 */
export function cacheAliasMapping(userId, alias, entityId, type) {
    const cache = getUserCache(userId);
    // Cache with type key
    if (type) {
        const keyWithType = getAliasCacheKey(alias, type);
        cache.aliasToEntityId.set(keyWithType, {
            data: entityId,
            expiresAt: Date.now() + config.aliasTtlMs,
        });
    }
    // Always cache without type key too
    const keyNoType = getAliasCacheKey(alias);
    cache.aliasToEntityId.set(keyNoType, {
        data: entityId,
        expiresAt: Date.now() + config.aliasTtlMs,
    });
}
// ============================================================================
// CACHE INVALIDATION
// ============================================================================
/**
 * Invalidate all caches for a user (call on write operations)
 */
export function invalidateUserCache(userId) {
    userCaches.delete(userId);
    log.debug({ userId }, 'Invalidated user entity cache');
}
/**
 * Invalidate specific entity in cache
 */
export function invalidateEntity(userId, entityId) {
    const cache = userCaches.get(userId);
    if (!cache)
        return;
    // Get entity to find its aliases
    const entry = cache.entitiesById.get(entityId);
    if (entry) {
        const entity = entry.data;
        // Remove alias mappings
        for (const alias of entity.aliases || []) {
            cache.aliasToEntityId.delete(getAliasCacheKey(alias));
            cache.aliasToEntityId.delete(getAliasCacheKey(alias, entity.type));
        }
        if (entity.canonicalName) {
            cache.aliasToEntityId.delete(getAliasCacheKey(entity.canonicalName));
            cache.aliasToEntityId.delete(getAliasCacheKey(entity.canonicalName, entity.type));
        }
        if (entity.specificRelation) {
            cache.aliasToEntityId.delete(getAliasCacheKey(entity.specificRelation));
        }
    }
    // Remove entity
    cache.entitiesById.delete(entityId);
    // Invalidate entity list (since it may contain stale data)
    cache.entityList = undefined;
    cache.entityListByType.clear();
    log.debug({ userId, entityId }, 'Invalidated entity from cache');
}
/**
 * Clear all entity caches (for testing or memory pressure)
 */
export function clearAllEntityCaches() {
    userCaches.clear();
    log.info({}, 'Cleared all entity caches');
}
// Track hits/misses
let entityListHits = 0;
let entityListMisses = 0;
let entityByIdHits = 0;
let entityByIdMisses = 0;
let aliasHits = 0;
let aliasMisses = 0;
export function recordCacheHit(type) {
    switch (type) {
        case 'entityList':
            entityListHits++;
            break;
        case 'entityById':
            entityByIdHits++;
            break;
        case 'alias':
            aliasHits++;
            break;
    }
}
export function recordCacheMiss(type) {
    switch (type) {
        case 'entityList':
            entityListMisses++;
            break;
        case 'entityById':
            entityByIdMisses++;
            break;
        case 'alias':
            aliasMisses++;
            break;
    }
}
function calculateHitRate(hits, misses) {
    const total = hits + misses;
    return total > 0 ? hits / total : 0;
}
/**
 * Get cache metrics
 */
export function getEntityCacheMetrics() {
    let totalCachedEntities = 0;
    let totalAliasEntries = 0;
    for (const cache of userCaches.values()) {
        totalCachedEntities += cache.entitiesById.size;
        totalAliasEntries += cache.aliasToEntityId.size;
    }
    return {
        totalUsers: userCaches.size,
        totalCachedEntities,
        totalAliasEntries,
        hitRate: {
            entityList: calculateHitRate(entityListHits, entityListMisses),
            entityById: calculateHitRate(entityByIdHits, entityByIdMisses),
            alias: calculateHitRate(aliasHits, aliasMisses),
        },
    };
}
/**
 * Reset cache metrics (for testing)
 */
export function resetEntityCacheMetrics() {
    entityListHits = 0;
    entityListMisses = 0;
    entityByIdHits = 0;
    entityByIdMisses = 0;
    aliasHits = 0;
    aliasMisses = 0;
}
//# sourceMappingURL=entity-cache.js.map