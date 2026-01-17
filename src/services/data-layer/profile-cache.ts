/**
 * Profile Cache - Redis-backed User Profile Caching
 *
 * Dramatically speeds up session initialization by caching user profiles
 * in Redis (L2) with memory (L1) fallback.
 *
 * PERFORMANCE IMPACT:
 * - Firestore profile load: ~100-500ms
 * - Redis cache hit: ~5-20ms
 * - Memory cache hit: <1ms
 *
 * HOW IT WORKS:
 * 1. On profile load: Check L1 (memory) → L2 (Redis) → Firestore
 * 2. On cache hit: Return immediately, skip Firestore
 * 3. On Firestore load: Write to L1 + L2 for next time
 * 4. On profile save: Invalidate cache to ensure freshness
 *
 * TTL STRATEGY:
 * - Short TTL (2 min) ensures profiles are reasonably fresh
 * - Profile changes (rare) invalidate cache immediately
 * - Session start always gets latest within TTL window
 *
 * @module services/data-layer/profile-cache
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { UserProfile } from '../../types/user-profile.js';
import { RedisBackedCache } from './memory-cache-manager.js';

const log = createLogger({ module: 'ProfileCache' });

// ============================================================================
// SINGLETON CACHE INSTANCE
// ============================================================================

let profileCache: RedisBackedCache<string, UserProfile> | null = null;
let initPromise: Promise<RedisBackedCache<string, UserProfile>> | null = null;

// Cache configuration
const CACHE_CONFIG = {
  maxEntries: 1000, // Support up to 1000 concurrent users
  ttlMs: 2 * 60 * 1000, // 2 minutes - short enough to stay fresh
  redisTtlSeconds: 120, // Match memory TTL
  redisKeyPrefix: 'profile:v1:', // Versioned prefix for easy migration
  useCompression: true, // Profiles can be large, compress for Redis
};

// Metrics for observability
const metrics = {
  hits: 0,
  misses: 0,
  firestoreLoads: 0,
  cacheWrites: 0,
  invalidations: 0,
  errors: 0,
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Get or initialize the profile cache
 * Call this lazily - cache is created on first use
 */
async function getProfileCache(): Promise<RedisBackedCache<string, UserProfile>> {
  if (profileCache) {
    return profileCache;
  }

  // Prevent multiple concurrent initializations
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const cache = new RedisBackedCache<string, UserProfile>('user-profiles', CACHE_CONFIG);
    const redisEnabled = await cache.initializeRedis();

    log.info(
      {
        redisEnabled,
        ttlMs: CACHE_CONFIG.ttlMs,
        maxEntries: CACHE_CONFIG.maxEntries,
      },
      '🚀 Profile cache initialized'
    );

    profileCache = cache;
    return cache;
  })();

  return initPromise;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get a user profile from cache
 *
 * @param userId - The user ID to look up
 * @returns The cached profile or undefined if not cached
 */
export async function getCachedProfile(userId: string): Promise<UserProfile | undefined> {
  try {
    const cache = await getProfileCache();
    const cached = await cache.getAsync(userId);

    if (cached) {
      metrics.hits++;
      log.debug({ userId: userId.slice(0, 12) + '...' }, '✅ Profile cache hit');
      return cached;
    }

    metrics.misses++;
    return undefined;
  } catch (error) {
    metrics.errors++;
    log.debug({ error: String(error), userId }, 'Profile cache get failed');
    return undefined;
  }
}

/**
 * Cache a user profile
 *
 * @param userId - The user ID
 * @param profile - The profile to cache
 */
export async function cacheProfile(userId: string, profile: UserProfile): Promise<void> {
  try {
    const cache = await getProfileCache();
    await cache.setAsync(userId, profile);
    metrics.cacheWrites++;
    log.debug({ userId: userId.slice(0, 12) + '...' }, '📝 Profile cached');
  } catch (error) {
    metrics.errors++;
    log.debug({ error: String(error), userId }, 'Profile cache set failed');
  }
}

/**
 * Invalidate a cached profile (call after profile updates)
 *
 * @param userId - The user ID to invalidate
 */
export async function invalidateProfile(userId: string): Promise<void> {
  try {
    const cache = await getProfileCache();
    cache.delete(userId);
    metrics.invalidations++;
    log.debug({ userId: userId.slice(0, 12) + '...' }, '🗑️ Profile cache invalidated');
  } catch (error) {
    metrics.errors++;
    log.debug({ error: String(error), userId }, 'Profile cache invalidate failed');
  }
}

/**
 * Load profile with cache-through pattern
 *
 * 1. Check cache first
 * 2. If miss, load from Firestore
 * 3. Write to cache for next time
 *
 * @param userId - The user ID
 * @param firestoreLoader - Function to load from Firestore
 * @returns The user profile or null if not found
 */
export async function getProfileWithCache(
  userId: string,
  firestoreLoader: (userId: string) => Promise<UserProfile | null>
): Promise<UserProfile | null> {
  // 1. Check cache first
  const cached = await getCachedProfile(userId);
  if (cached) {
    return cached;
  }

  // 2. Load from Firestore
  const loadStart = Date.now();
  const profile = await firestoreLoader(userId);
  const loadDuration = Date.now() - loadStart;

  metrics.firestoreLoads++;
  log.debug(
    {
      userId: userId.slice(0, 12) + '...',
      durationMs: loadDuration,
      found: !!profile,
    },
    '📥 Profile loaded from Firestore'
  );

  // 3. Cache the result (even null could be cached to prevent repeated misses)
  if (profile) {
    // Fire-and-forget: don't block on cache write
    void cacheProfile(userId, profile);
  }

  return profile;
}

/**
 * Get cache metrics for observability
 */
export function getProfileCacheMetrics(): {
  hits: number;
  misses: number;
  hitRate: number;
  firestoreLoads: number;
  cacheWrites: number;
  invalidations: number;
  errors: number;
  isRedisEnabled: boolean;
} {
  const totalOps = metrics.hits + metrics.misses;
  return {
    ...metrics,
    hitRate: totalOps > 0 ? metrics.hits / totalOps : 0,
    isRedisEnabled: profileCache?.hasRedisL2() ?? false,
  };
}

/**
 * Reset the profile cache (for testing)
 */
export function resetProfileCache(): void {
  if (profileCache) {
    profileCache.clear();
  }
  profileCache = null;
  initPromise = null;
  Object.assign(metrics, {
    hits: 0,
    misses: 0,
    firestoreLoads: 0,
    cacheWrites: 0,
    invalidations: 0,
    errors: 0,
  });
}
