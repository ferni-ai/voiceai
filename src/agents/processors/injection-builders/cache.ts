/**
 * Non-Volatile Injection Cache
 *
 * Caches slow-changing data like health, visual memory, ambient context.
 * TTL: 60 seconds - these don't change turn-to-turn.
 */

import { cleanForFirestore } from '../../../utils/firestore-utils.js';
import type { ContextInjection } from '../types.js';

interface CachedInjection {
  injection: ContextInjection | null;
  timestamp: number;
}

const NON_VOLATILE_CACHE_TTL_MS = 60_000; // 60 seconds

const nonVolatileInjectionCache = new Map<string, CachedInjection>();

export function getCachedInjection(key: string): ContextInjection | null | undefined {
  const cached = nonVolatileInjectionCache.get(key);
  if (!cached) return undefined;

  // Check if expired
  if (Date.now() - cached.timestamp > NON_VOLATILE_CACHE_TTL_MS) {
    nonVolatileInjectionCache.delete(key);
    return undefined;
  }

  return cached.injection;
}

export function setCachedInjection(key: string, injection: ContextInjection | null): void {
  nonVolatileInjectionCache.set(cleanForFirestore(key), {
    injection,
    timestamp: Date.now(),
  });

  // Prune old entries if cache gets too large (max 500 entries)
  if (nonVolatileInjectionCache.size > 500) {
    const oldestKey = nonVolatileInjectionCache.keys().next().value;
    if (oldestKey) nonVolatileInjectionCache.delete(oldestKey);
  }
}

/**
 * Clear cache for a specific user (call on session end)
 */
export function clearNonVolatileInjectionCache(userId: string): void {
  for (const key of nonVolatileInjectionCache.keys()) {
    if (key.startsWith(`${userId}:`)) {
      nonVolatileInjectionCache.delete(key);
    }
  }
}

/**
 * Get cache stats for monitoring
 */
export function getNonVolatileInjectionCacheStats(): {
  size: number;
  ttlMs: number;
} {
  return {
    size: nonVolatileInjectionCache.size,
    ttlMs: NON_VOLATILE_CACHE_TTL_MS,
  };
}
