/**
 * Redis Services - Central Export
 *
 * Unified exports for all Redis-powered performance optimizations.
 * Import from here for a clean, centralized API.
 *
 * AVAILABLE SERVICES:
 * - RedisBackedCache: L1 Memory + L2 Redis tiered caching
 * - RedisPubSub: Cross-instance event broadcasting
 * - RedisCircuitBreaker: Distributed circuit breaker state
 * - SessionWarmup: Pre-warming caches on session connect
 *
 * @example
 * import {
 *   createRedisBackedCache,
 *   initializeRedisPubSub,
 *   warmSessionCaches,
 * } from '../services/redis/index.js';
 *
 * // Create a Redis-backed cache
 * const userCache = await createRedisBackedCache<UserProfile>('user-profiles', {
 *   ttlMs: 5 * 60 * 1000,
 *   redisKeyPrefix: 'profile:',
 * });
 *
 * // Use sync for hot path, async for cross-instance consistency
 * const cached = userCache.get('user123');           // L1 only (fast)
 * const cached = await userCache.getAsync('user123'); // L1 + L2 (consistent)
 *
 * @module services/redis
 */

// ============================================================================
// CORE REDIS CACHE
// ============================================================================

export {
  getRedisCache,
  getRedisCacheAsync,
  resetRedisCache,
  RedisCache,
} from '../../memory/redis-cache.js';

// ============================================================================
// REDIS-BACKED MANAGED CACHE (L1 Memory + L2 Redis)
// ============================================================================

export {
  RedisBackedCache,
  createRedisBackedCache,
  createRedisBackedUserCache,
  createRedisBackedSessionCache,
  type RedisBackedCacheConfig,
} from '../data-layer/memory-cache-manager.js';

// ============================================================================
// REDIS PUB/SUB
// ============================================================================

export {
  RedisPubSubService,
  getRedisPubSub,
  initializeRedisPubSub,
  shutdownRedisPubSub,
  publishSessionEvent,
  publishCacheInvalidation,
  publishInsightsUpdate,
  subscribeToSessionEvents,
  subscribeToCacheInvalidation,
  subscribeToInsightsUpdates,
  CHANNELS,
  type PubSubMessage,
  type MessageHandler,
  type PubSubConfig,
  type Channel,
} from '../redis-pubsub.js';

// ============================================================================
// REDIS CIRCUIT BREAKER
// ============================================================================

export {
  RedisCircuitBreaker,
  createRedisCircuitBreaker,
  getAllRedisCircuitStats,
  shutdownAllRedisCircuitBreakers,
} from '../self-healing/redis-circuit-breaker.js';

// ============================================================================
// SESSION WARMUP
// ============================================================================

export {
  warmSessionCaches,
  warmHandoffCaches,
  clearSessionWarmupCaches,
  setupWarmupOnConnect,
  type WarmupResult,
  type WarmupConfig,
} from '../session-warmup.js';

// ============================================================================
// SEMANTIC ROUTER CACHE
// ============================================================================

export {
  SemanticRouterCache,
  getSemanticRouterCache,
  initializeCache as initializeSemanticRouterCache,
} from '../../tools/semantic-router/integration/redis-cache.js';

// ============================================================================
// HELPER UTILITIES
// ============================================================================

/**
 * Check if Redis is available and connected
 */
export async function isRedisAvailable(): Promise<boolean> {
  try {
    const { getRedisCache } = await import('../../memory/redis-cache.js');
    const cache = getRedisCache();
    await cache.initialize();
    return cache.isConnected();
  } catch {
    return false;
  }
}

/**
 * Initialize all Redis services at once
 * Call this at application startup for best performance
 */
export async function initializeAllRedisServices(): Promise<{
  redis: boolean;
  pubsub: boolean;
  semanticRouter: boolean;
}> {
  const results = {
    redis: false,
    pubsub: false,
    semanticRouter: false,
  };

  // Initialize in parallel
  const [redisResult, pubsubResult, routerResult] = await Promise.allSettled([
    // Core Redis
    (async () => {
      const { getRedisCache } = await import('../../memory/redis-cache.js');
      const cache = getRedisCache();
      await cache.initialize();
      return cache.isConnected();
    })(),
    // Pub/Sub
    (async () => {
      const { initializeRedisPubSub } = await import('../redis-pubsub.js');
      return initializeRedisPubSub();
    })(),
    // Semantic Router Cache
    (async () => {
      const { initializeCache } =
        await import('../../tools/semantic-router/integration/redis-cache.js');
      await initializeCache();
      return true;
    })(),
  ]);

  results.redis = redisResult.status === 'fulfilled' && redisResult.value;
  results.pubsub = pubsubResult.status === 'fulfilled' && pubsubResult.value;
  results.semanticRouter = routerResult.status === 'fulfilled' && routerResult.value;

  return results;
}

/**
 * Shutdown all Redis services gracefully
 * Call this before process exit
 */
export async function shutdownAllRedisServices(): Promise<void> {
  await Promise.allSettled([
    // Pub/Sub
    (async () => {
      const { shutdownRedisPubSub } = await import('../redis-pubsub.js');
      await shutdownRedisPubSub();
    })(),
    // Circuit breakers
    (async () => {
      const { shutdownAllRedisCircuitBreakers } =
        await import('../self-healing/redis-circuit-breaker.js');
      await shutdownAllRedisCircuitBreakers();
    })(),
    // Core Redis
    (async () => {
      const { resetRedisCache } = await import('../../memory/redis-cache.js');
      await resetRedisCache();
    })(),
  ]);
}

// ============================================================================
// MIGRATION HELPER
// ============================================================================

/**
 * Helper to wrap an existing Map-based cache with Redis L2 backing.
 *
 * This allows gradual migration of existing caches without rewriting them.
 * The wrapped cache maintains the same interface but adds Redis persistence.
 *
 * @example
 * // Before: Plain Map cache
 * const cache = new Map<string, UserData>();
 *
 * // After: Wrapped with Redis L2
 * const cache = await wrapMapWithRedis<UserData>('user-data', existingMap, {
 *   ttlMs: 5 * 60 * 1000,
 * });
 *
 * // Same interface, but now persisted to Redis!
 * cache.set('key', value);  // Writes to Map AND Redis
 * cache.get('key');         // Reads from Map (fast)
 * await cache.getFromRedis('key');  // Reads from Redis (cross-instance)
 */
export async function wrapMapWithRedis<V>(
  name: string,
  existingMap: Map<string, V>,
  options: { ttlMs?: number; redisKeyPrefix?: string } = {}
): Promise<{
  get: (key: string) => V | undefined;
  set: (key: string, value: V) => void;
  delete: (key: string) => boolean;
  has: (key: string) => boolean;
  clear: () => void;
  getFromRedis: (key: string) => Promise<V | undefined>;
  size: number;
}> {
  const { createRedisBackedCache } = await import('../data-layer/memory-cache-manager.js');

  const redisCache = await createRedisBackedCache<V>(name, {
    ttlMs: options.ttlMs ?? 5 * 60 * 1000,
    redisKeyPrefix: options.redisKeyPrefix ?? `wrap:${name}:`,
  });

  // Copy existing entries to Redis-backed cache
  for (const [key, value] of existingMap) {
    redisCache.set(key, value);
  }

  return {
    get: (key: string) => redisCache.get(key),
    set: (key: string, value: V) => redisCache.set(key, value),
    delete: (key: string) => redisCache.delete(key),
    has: (key: string) => redisCache.has(key),
    clear: () => redisCache.clear(),
    getFromRedis: (key: string) => redisCache.getAsync(key),
    get size() {
      return redisCache.size;
    },
  };
}
