/**
 * Persona Insights Cache
 *
 * Session-scoped caching for persona intelligence to achieve
 * "Better than Human" handoff speeds.
 *
 * Problem: Each persona builder (Peter, Maya, Jordan, etc.) fetches extensive
 * context on every handoff, adding 500-2000ms latency.
 *
 * Solution: Cache persona insights per session with short TTL (3 min).
 * On handoff, return cached insights immediately while refreshing in background.
 *
 * PERFORMANCE OPTIMIZATION (Jan 2026):
 * - Added Redis L2 backing for cross-instance insight sharing
 * - Instances can share persona insights, reducing latency by 500-2000ms on handoffs
 * - Memory L1 provides sub-ms access, Redis L2 provides persistence across instances
 *
 * @module intelligence/context-builders/persona-insights-cache
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { RedisCache } from '../../memory/redis-cache.js';

const log = createLogger({ module: 'PersonaInsightsCache' });

// ============================================================================
// REDIS L2 CACHE
// ============================================================================

let redisCache: RedisCache | null = null;
let redisInitPromise: Promise<void> | null = null;
const REDIS_KEY_PREFIX = 'persona_insights:';
const REDIS_TTL_SECONDS = 180; // 3 minutes - match L1 TTL

/**
 * Initialize Redis connection for L2 caching
 */
async function initializeRedisL2(): Promise<void> {
  if (redisCache || redisInitPromise) return;

  redisInitPromise = (async () => {
    try {
      const { getRedisCache } = await import('../../memory/redis-cache.js');
      const cache = getRedisCache();
      await cache.initialize();

      if (cache.isConnected()) {
        redisCache = cache;
        log.info('🚀 Persona insights Redis L2 cache initialized');
      }
    } catch (error) {
      log.debug({ error: String(error) }, 'Redis L2 not available for persona insights');
    }
  })();

  await redisInitPromise;
}

/**
 * Get insights from Redis L2 cache
 */
async function getFromRedisL2(
  sessionId: string,
  personaId: string
): Promise<PersonaInsights | null> {
  if (!redisCache?.isConnected()) return null;

  try {
    const key = `${REDIS_KEY_PREFIX}${sessionId}:${personaId}`;
    const data = await redisCache.get<PersonaInsights>(key);
    if (data) {
      log.debug({ sessionId, personaId }, 'Persona insights L2 cache hit (Redis)');
      return data;
    }
  } catch (error) {
    log.debug({ error: String(error), sessionId, personaId }, 'Redis L2 get failed');
  }
  return null;
}

/**
 * Store insights in Redis L2 cache (fire-and-forget)
 */
function setInRedisL2(sessionId: string, insights: PersonaInsights): void {
  if (!redisCache?.isConnected()) return;

  const key = `${REDIS_KEY_PREFIX}${sessionId}:${insights.personaId}`;
  redisCache.set(key, insights, REDIS_TTL_SECONDS).catch((error) => {
    log.debug({ error: String(error), key }, 'Redis L2 set failed');
  });
}

/**
 * Clear insights from Redis L2 for a session
 */
async function clearRedisL2Session(sessionId: string): Promise<void> {
  if (!redisCache?.isConnected()) return;

  try {
    // Delete all persona insights for this session
    // Note: This is a pattern delete, ideally we'd track keys but this works for cleanup
    const personaIds = ['ferni', 'peter', 'maya', 'jordan', 'alex', 'nayan'];
    await Promise.all(
      personaIds.map((personaId) =>
        redisCache!.delete(`${REDIS_KEY_PREFIX}${sessionId}:${personaId}`)
      )
    );
  } catch (error) {
    log.debug({ error: String(error), sessionId }, 'Redis L2 session clear failed');
  }
}

// Initialize Redis L2 on module load (non-blocking)
void initializeRedisL2();

// ============================================================================
// TYPES
// ============================================================================

export interface PersonaInsights {
  /** Persona ID (ferni, peter, maya, etc.) */
  personaId: string;

  /** User ID */
  userId: string;

  /** Cross-team insights for this persona */
  crossTeamInsights?: string;

  /** Persona-specific briefing */
  personaBriefing?: string;

  /** Relevant user patterns for this persona's domain */
  relevantPatterns?: string[];

  /** Recent interactions with this persona */
  recentInteractions?: {
    summary: string;
    lastInteraction?: Date;
    totalInteractions: number;
  };

  /** Domain-specific data (finances for Peter, habits for Maya, etc.) */
  domainData?: Record<string, unknown>;

  /** When these insights were generated */
  generatedAt: number;

  /** Whether insights are being refreshed in background */
  isRefreshing?: boolean;
}

interface CacheEntry {
  insights: PersonaInsights;
  createdAt: number;
  lastAccessed: number;
  hitCount: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CACHE_CONFIG = {
  /** How long insights are considered fresh (3 minutes) */
  TTL_MS: 3 * 60 * 1000,

  /** How long to keep stale insights while refreshing (10 minutes) */
  STALE_TTL_MS: 10 * 60 * 1000,

  /** Maximum entries per session */
  MAX_ENTRIES_PER_SESSION: 10,

  /** Background refresh threshold (refresh if older than this) */
  REFRESH_THRESHOLD_MS: 2 * 60 * 1000,
} as const;

// ============================================================================
// SESSION CACHE
// ============================================================================

// Map: sessionId -> Map<personaId, CacheEntry>
const sessionCaches = new Map<string, Map<string, CacheEntry>>();

// Track background refreshes to avoid duplicates
const pendingRefreshes = new Set<string>();

/**
 * Get or create cache for a session
 */
function getSessionCache(sessionId: string): Map<string, CacheEntry> {
  if (!sessionCaches.has(sessionId)) {
    sessionCaches.set(sessionId, new Map());
  }
  return sessionCaches.get(sessionId)!;
}

/**
 * Generate cache key
 */
function getCacheKey(sessionId: string, personaId: string, userId: string): string {
  return `${sessionId}:${personaId}:${userId}`;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get cached persona insights (sync - L1 memory only)
 *
 * Returns cached insights immediately if available (even if stale).
 * Triggers background refresh if insights are getting old.
 *
 * @param sessionId - Current session ID
 * @param personaId - Persona to get insights for
 * @param userId - User ID
 * @param refreshFn - Optional function to refresh insights in background
 * @returns Cached insights or null if not available
 */
export function getCachedPersonaInsights(
  sessionId: string,
  personaId: string,
  userId: string,
  refreshFn?: () => Promise<PersonaInsights>
): PersonaInsights | null {
  const cache = getSessionCache(sessionId);
  const entry = cache.get(personaId);

  if (!entry) {
    return null;
  }

  const now = Date.now();
  const age = now - entry.createdAt;

  // Update access stats
  entry.lastAccessed = now;
  entry.hitCount++;

  // Check if completely expired
  if (age > CACHE_CONFIG.STALE_TTL_MS) {
    cache.delete(personaId);
    log.debug({ sessionId, personaId, ageMs: age }, 'Persona insights expired');
    return null;
  }

  // Trigger background refresh if getting stale
  if (age > CACHE_CONFIG.REFRESH_THRESHOLD_MS && refreshFn) {
    triggerBackgroundRefresh(sessionId, personaId, userId, refreshFn);
  }

  // Return insights (mark as stale if past TTL)
  const insights = { ...entry.insights };
  if (age > CACHE_CONFIG.TTL_MS) {
    insights.isRefreshing = pendingRefreshes.has(getCacheKey(sessionId, personaId, userId));
  }

  log.debug(
    {
      sessionId,
      personaId,
      hitCount: entry.hitCount,
      ageMs: age,
      isFresh: age < CACHE_CONFIG.TTL_MS,
      layer: 'L1',
    },
    'Persona insights cache hit'
  );

  return insights;
}

/**
 * Get cached persona insights (async - checks L1 memory, then L2 Redis)
 *
 * PERFORMANCE: Use this for handoffs where latency matters but async is OK.
 * Returns cached insights from memory (fastest) or Redis (cross-instance).
 *
 * @param sessionId - Current session ID
 * @param personaId - Persona to get insights for
 * @param userId - User ID
 * @param refreshFn - Optional function to refresh insights in background
 * @returns Cached insights or null if not available
 */
export async function getCachedPersonaInsightsAsync(
  sessionId: string,
  personaId: string,
  userId: string,
  refreshFn?: () => Promise<PersonaInsights>
): Promise<PersonaInsights | null> {
  // L1: Check memory first (fastest)
  const memoryResult = getCachedPersonaInsights(sessionId, personaId, userId, refreshFn);
  if (memoryResult) {
    return memoryResult;
  }

  // L2: Check Redis (cross-instance sharing)
  const redisResult = await getFromRedisL2(sessionId, personaId);
  if (redisResult) {
    // Promote to L1 for faster subsequent access
    const now = Date.now();
    const age = now - redisResult.generatedAt;

    if (age < CACHE_CONFIG.STALE_TTL_MS) {
      // Still valid - store in L1
      const cache = getSessionCache(sessionId);
      cache.set(personaId, {
        insights: redisResult,
        createdAt: redisResult.generatedAt,
        lastAccessed: now,
        hitCount: 1,
      });

      log.debug({ sessionId, personaId, ageMs: age, layer: 'L2' }, 'Persona insights cache hit');
      return redisResult;
    }
  }

  return null;
}

/**
 * Cache persona insights (writes to L1 memory and L2 Redis)
 *
 * @param sessionId - Current session ID
 * @param insights - Insights to cache
 */
export function cachePersonaInsights(sessionId: string, insights: PersonaInsights): void {
  const cache = getSessionCache(sessionId);

  // Enforce max entries
  if (cache.size >= CACHE_CONFIG.MAX_ENTRIES_PER_SESSION) {
    // Remove oldest entry
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }

  const now = Date.now();
  const insightsWithTimestamp = { ...insights, generatedAt: now };

  // L1: Store in memory (synchronous)
  cache.set(insights.personaId, {
    insights: insightsWithTimestamp,
    createdAt: now,
    lastAccessed: now,
    hitCount: 0,
  });

  // L2: Store in Redis (fire-and-forget for performance)
  setInRedisL2(sessionId, insightsWithTimestamp);

  // Clear pending refresh flag
  pendingRefreshes.delete(getCacheKey(sessionId, insights.personaId, insights.userId));

  log.debug(
    {
      sessionId,
      personaId: insights.personaId,
      cacheSize: cache.size,
      redisEnabled: !!redisCache?.isConnected(),
    },
    'Persona insights cached'
  );
}

/**
 * Invalidate cached insights for a persona
 */
export function invalidatePersonaInsights(sessionId: string, personaId: string): void {
  const cache = getSessionCache(sessionId);
  cache.delete(personaId);
  log.debug({ sessionId, personaId }, 'Persona insights invalidated');
}

/**
 * Clear all cached insights for a session (clears L1 and L2)
 */
export function clearSessionInsightsCache(sessionId: string): void {
  const cache = sessionCaches.get(sessionId);
  if (cache) {
    const size = cache.size;
    cache.clear();
    sessionCaches.delete(sessionId);
    log.debug({ sessionId, entriesCleared: size }, 'Session insights L1 cache cleared');
  }

  // Clear pending refreshes for this session
  for (const key of pendingRefreshes) {
    if (key.startsWith(`${sessionId}:`)) {
      pendingRefreshes.delete(key);
    }
  }

  // L2: Clear from Redis (fire-and-forget)
  void clearRedisL2Session(sessionId);
}

/**
 * Preload insights for anticipated handoff
 *
 * Call this when we detect the user might switch personas soon.
 * Example: User mentions "let me talk to Peter" → preload Peter's insights
 *
 * @param sessionId - Current session ID
 * @param personaId - Persona to preload
 * @param userId - User ID
 * @param loadFn - Function to load insights
 */
export async function preloadPersonaInsights(
  sessionId: string,
  personaId: string,
  userId: string,
  loadFn: () => Promise<PersonaInsights>
): Promise<void> {
  const cache = getSessionCache(sessionId);

  // Skip if already cached and fresh
  const existing = cache.get(personaId);
  if (existing && Date.now() - existing.createdAt < CACHE_CONFIG.TTL_MS) {
    return;
  }

  const key = getCacheKey(sessionId, personaId, userId);
  if (pendingRefreshes.has(key)) {
    return; // Already loading
  }

  pendingRefreshes.add(key);

  try {
    log.debug({ sessionId, personaId }, 'Preloading persona insights');
    const insights = await loadFn();
    cachePersonaInsights(sessionId, insights);
  } catch (error) {
    log.warn({ error: String(error), sessionId, personaId }, 'Failed to preload persona insights');
  } finally {
    pendingRefreshes.delete(key);
  }
}

/**
 * Get cache statistics for monitoring
 */
export function getInsightsCacheStats(): {
  totalSessions: number;
  totalEntries: number;
  pendingRefreshes: number;
  redisL2Enabled: boolean;
} {
  let totalEntries = 0;
  for (const cache of sessionCaches.values()) {
    totalEntries += cache.size;
  }

  return {
    totalSessions: sessionCaches.size,
    totalEntries,
    pendingRefreshes: pendingRefreshes.size,
    redisL2Enabled: !!redisCache?.isConnected(),
  };
}

// ============================================================================
// INTERNAL
// ============================================================================

/**
 * Trigger background refresh of insights
 */
function triggerBackgroundRefresh(
  sessionId: string,
  personaId: string,
  userId: string,
  refreshFn: () => Promise<PersonaInsights>
): void {
  const key = getCacheKey(sessionId, personaId, userId);

  if (pendingRefreshes.has(key)) {
    return; // Already refreshing
  }

  pendingRefreshes.add(key);

  // Fire and forget - don't block on refresh
  refreshFn()
    .then((insights) => {
      cachePersonaInsights(sessionId, insights);
      log.debug({ sessionId, personaId }, 'Background refresh complete');
    })
    .catch((error) => {
      log.warn({ error: String(error), sessionId, personaId }, 'Background refresh failed');
    })
    .finally(() => {
      pendingRefreshes.delete(key);
    });
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getCachedPersonaInsights,
  getCachedPersonaInsightsAsync,
  cachePersonaInsights,
  invalidatePersonaInsights,
  clearSessionInsightsCache,
  preloadPersonaInsights,
  getInsightsCacheStats,
};
