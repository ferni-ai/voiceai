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
import type { UserProfile } from '../../types/user-profile.js';
/**
 * Get a user profile from cache
 *
 * @param userId - The user ID to look up
 * @returns The cached profile or undefined if not cached
 */
export declare function getCachedProfile(userId: string): Promise<UserProfile | undefined>;
/**
 * Cache a user profile
 *
 * @param userId - The user ID
 * @param profile - The profile to cache
 */
export declare function cacheProfile(userId: string, profile: UserProfile): Promise<void>;
/**
 * Invalidate a cached profile (call after profile updates)
 *
 * @param userId - The user ID to invalidate
 */
export declare function invalidateProfile(userId: string): Promise<void>;
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
export declare function getProfileWithCache(userId: string, firestoreLoader: (userId: string) => Promise<UserProfile | null>): Promise<UserProfile | null>;
/**
 * Get cache metrics for observability
 */
export declare function getProfileCacheMetrics(): {
    hits: number;
    misses: number;
    hitRate: number;
    firestoreLoads: number;
    cacheWrites: number;
    invalidations: number;
    errors: number;
    isRedisEnabled: boolean;
};
/**
 * Reset the profile cache (for testing)
 */
export declare function resetProfileCache(): void;
//# sourceMappingURL=profile-cache.d.ts.map