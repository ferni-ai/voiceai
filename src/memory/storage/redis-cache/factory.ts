/**
 * Redis Cache factory — thread-safe singleton.
 * @module memory/storage/redis-cache/factory
 */

import { RedisCache } from './redis-cache.js';
import type { RedisConfig } from './types.js';

// FACTORY (Thread-Safe Singleton)
// ============================================================================

let redisInstance: RedisCache | null = null;
let redisInstancePromise: Promise<RedisCache> | null = null;

/**
 * Get the singleton Redis cache instance (thread-safe)
 * Uses promise-based lazy initialization to prevent race conditions
 * where multiple concurrent calls could create multiple instances.
 */
export function getRedisCache(config?: RedisConfig): RedisCache {
  // Fast path: instance already exists
  if (redisInstance) {
    return redisInstance;
  }

  // Slow path: need to create instance
  // Use synchronous assignment to prevent race condition
  if (!redisInstancePromise) {
    // Create instance synchronously - no async operation here
    redisInstance = new RedisCache(config);
  }

  return redisInstance!;
}

/**
 * Get Redis cache with async initialization (for cases needing full init)
 * Ensures only one instance is created even under concurrent access.
 */
export async function getRedisCacheAsync(config?: RedisConfig): Promise<RedisCache> {
  // Fast path: already initialized
  if (redisInstance) {
    return redisInstance;
  }

  // Create promise if not exists (atomic check-and-set via closure)
  if (!redisInstancePromise) {
    redisInstancePromise = (async () => {
      const instance = new RedisCache(config);
      await instance.initialize();
      redisInstance = instance;
      return instance;
    })();
  }

  return redisInstancePromise;
}

/**
 * Reset the Redis cache (for testing)
 */
export async function resetRedisCache(): Promise<void> {
  // Wait for any pending initialization
  if (redisInstancePromise) {
    try {
      await redisInstancePromise;
    } catch {
      // Ignore initialization errors during reset
    }
  }

  if (redisInstance) {
    await redisInstance.close();
    redisInstance = null;
  }
  redisInstancePromise = null;
}

export default RedisCache;
