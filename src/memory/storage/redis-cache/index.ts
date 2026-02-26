/**
 * Redis Cache — fast ephemeral caching via Redis/Memorystore.
 * @module memory/storage/redis-cache
 */

export * from './types.js';
export { RedisCache } from './redis-cache.js';
export { getRedisCache, getRedisCacheAsync, resetRedisCache } from './factory.js';
