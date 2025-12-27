/**
 * Semantic Memory Cache
 *
 * "Better than Human" optimization that caches memory query results
 * with semantic similarity matching. Instead of exact string matching,
 * this cache uses embeddings to find similar queries - so "What are my
 * hobbies?" can cache-hit on "Tell me about my interests."
 *
 * Target: 60-70% cache hit rate with 85% similarity threshold.
 *
 * @module SemanticMemoryCache
 */

import { createLogger } from '../utils/safe-logger.js';
import { embed, cosineSimilarity } from './embeddings.js';
import { cleanForFirestore } from '../utils/firestore-utils.js';

const log = createLogger({ module: 'semantic-memory-cache' });

// ============================================================================
// TYPES
// ============================================================================

export interface CachedQuery<T = unknown> {
  /** Original query string */
  query: string;
  /** Query embedding for similarity matching */
  embedding: number[];
  /** Cached result */
  result: T;
  /** When this was cached */
  timestamp: number;
  /** Hit count for analytics */
  hitCount: number;
}

export interface SemanticCacheConfig {
  /** Minimum cosine similarity for cache hit (0-1) */
  similarityThreshold: number;
  /** Time-to-live in milliseconds */
  ttlMs: number;
  /** Maximum entries per user */
  maxEntriesPerUser: number;
  /** Enable detailed logging */
  debug: boolean;
}

export interface CacheStats {
  /** Total cache hits */
  hits: number;
  /** Total cache misses */
  misses: number;
  /** Hit rate as percentage */
  hitRate: number;
  /** Average similarity score for hits */
  avgSimilarity: number;
  /** Total entries across all users */
  totalEntries: number;
  /** Number of users with cached data */
  userCount: number;
}

export interface CacheLookupResult<T> {
  /** Whether a cache hit occurred */
  hit: boolean;
  /** Cached result if hit */
  result?: T;
  /** Similarity score if hit */
  similarity?: number;
  /** Matched query if hit */
  matchedQuery?: string;
  /** Time saved in ms (estimated) */
  timeSavedMs?: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: SemanticCacheConfig = {
  similarityThreshold: 0.75, // 75% similarity required for cache hit (was 85%, but semantic similar queries score 0.6-0.75)
  ttlMs: 5 * 60 * 1000, // 5 minutes
  maxEntriesPerUser: 50, // Max 50 cached queries per user
  debug: false,
};

// ============================================================================
// CACHE STORAGE
// ============================================================================

// Per-user cache: userId -> array of cached queries
const userCaches = new Map<string, CachedQuery[]>();

// Global stats
let stats = {
  hits: 0,
  misses: 0,
  totalSimilaritySum: 0,
};

// Current config
let config: SemanticCacheConfig = { ...DEFAULT_CONFIG };

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Configure the semantic cache
 */
export function configureSemanticCache(options: Partial<SemanticCacheConfig>): void {
  config = { ...DEFAULT_CONFIG, ...options };
  log.info({ config }, '🔧 Semantic memory cache configured');
}

/**
 * Find similar cached query using embedding similarity
 *
 * @param userId - User ID to scope the cache
 * @param query - Query string to look up
 * @returns Cache lookup result with hit/miss and optional result
 */
export async function findSimilarCached<T>(
  userId: string,
  query: string
): Promise<CacheLookupResult<T>> {
  const userCache = userCaches.get(userId);

  // No cache for this user
  if (!userCache || userCache.length === 0) {
    stats.misses++;
    return { hit: false };
  }

  // Prune expired entries first
  pruneExpiredEntries(userId);

  const prunedCache = userCaches.get(userId);
  if (!prunedCache || prunedCache.length === 0) {
    stats.misses++;
    return { hit: false };
  }

  // Generate embedding for the query
  let queryEmbedding: number[];
  try {
    queryEmbedding = await embed(query);
  } catch (error) {
    log.warn(
      { error: String(error), userId },
      'Failed to generate query embedding for cache lookup'
    );
    stats.misses++;
    return { hit: false };
  }

  // Find most similar cached query
  let bestMatch: { entry: CachedQuery<T>; similarity: number } | null = null;

  for (const entry of prunedCache) {
    const similarity = cosineSimilarity(queryEmbedding, entry.embedding);

    if (similarity >= config.similarityThreshold) {
      if (!bestMatch || similarity > bestMatch.similarity) {
        bestMatch = { entry: entry as CachedQuery<T>, similarity };
      }
    }
  }

  if (bestMatch) {
    // Cache hit!
    stats.hits++;
    stats.totalSimilaritySum += bestMatch.similarity;
    bestMatch.entry.hitCount++;

    if (config.debug) {
      log.debug(
        {
          userId,
          query: query.slice(0, 50),
          matchedQuery: bestMatch.entry.query.slice(0, 50),
          similarity: bestMatch.similarity.toFixed(3),
        },
        '✅ Semantic cache HIT'
      );
    }

    return {
      hit: true,
      result: bestMatch.entry.result,
      similarity: bestMatch.similarity,
      matchedQuery: bestMatch.entry.query,
      timeSavedMs: 150, // Estimated Firestore query time saved
    };
  }

  // Cache miss
  stats.misses++;

  if (config.debug) {
    log.debug({ userId, query: query.slice(0, 50) }, '❌ Semantic cache MISS');
  }

  return { hit: false };
}

/**
 * Store a query result in the semantic cache
 *
 * @param userId - User ID to scope the cache
 * @param query - Query string that was executed
 * @param result - Result to cache
 * @param embedding - Pre-computed embedding (optional, will generate if not provided)
 */
export async function storeInSemanticCache<T>(
  userId: string,
  query: string,
  result: T,
  embedding?: number[]
): Promise<void> {
  // Get or create user cache
  let userCache = userCaches.get(userId);
  if (!userCache) {
    userCache = [];
    userCaches.set(userId, userCache);
  }

  // Generate embedding if not provided
  let queryEmbedding: number[];
  if (embedding) {
    queryEmbedding = embedding;
  } else {
    try {
      queryEmbedding = await embed(query);
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Failed to generate embedding for cache storage');
      return;
    }
  }

  // Check if we already have a very similar entry (avoid duplicates)
  for (const entry of userCache) {
    const similarity = cosineSimilarity(queryEmbedding, entry.embedding);
    if (similarity > 0.95) {
      // Very similar - update existing entry instead
      entry.result = result;
      entry.timestamp = Date.now();
      return;
    }
  }

  // Evict oldest if at capacity (LRU eviction)
  if (userCache.length >= config.maxEntriesPerUser) {
    // Sort by timestamp (oldest first) and remove the oldest
    userCache.sort((a, b) => a.timestamp - b.timestamp);
    userCache.shift();
  }

  // Add new entry
  userCache.push({
    query,
    embedding: queryEmbedding,
    result,
    timestamp: Date.now(),
    hitCount: 0,
  });

  if (config.debug) {
    log.debug(
      { userId, query: query.slice(0, 50), cacheSize: userCache.length },
      '💾 Stored in semantic cache'
    );
  }
}

/**
 * Wrapper function for memory queries with semantic caching
 *
 * @param userId - User ID
 * @param query - Query string
 * @param queryFn - Function that executes the actual query
 * @returns Query result (from cache or fresh)
 */
export async function withSemanticCache<T>(
  userId: string,
  query: string,
  queryFn: () => Promise<T>
): Promise<{ result: T; cached: boolean; similarity?: number }> {
  // Try cache first
  const cached = await findSimilarCached<T>(userId, query);
  if (cached.hit && cached.result !== undefined) {
    return {
      result: cached.result,
      cached: true,
      similarity: cached.similarity,
    };
  }

  // Execute the query
  const result = await queryFn();

  // Store in cache (fire-and-forget)
  storeInSemanticCache(userId, query, result).catch((error) => {
    log.warn({ error: String(error) }, 'Failed to store in semantic cache');
  });

  return { result, cached: false };
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Prune expired entries for a user
 */
function pruneExpiredEntries(userId: string): void {
  const userCache = userCaches.get(userId);
  if (!userCache) return;

  const now = Date.now();
  const validEntries = userCache.filter((entry) => now - entry.timestamp < config.ttlMs);

  if (validEntries.length < userCache.length) {
    userCaches.set(userId, validEntries);

    if (config.debug) {
      log.debug(
        { userId, pruned: userCache.length - validEntries.length },
        '🧹 Pruned expired cache entries'
      );
    }
  }
}

/**
 * Clear cache for a specific user (call on session end)
 */
export function clearUserSemanticCache(userId: string): void {
  userCaches.delete(userId);
  log.debug({ userId }, '🧹 Cleared user semantic cache');
}

/**
 * Clear all semantic caches (use with caution)
 */
export function clearAllSemanticCaches(): void {
  userCaches.clear();
  stats = { hits: 0, misses: 0, totalSimilaritySum: 0 };
  log.info('🧹 Cleared all semantic caches');
}

/**
 * Invalidate cache entries matching a pattern
 * Use when memory is updated and cached queries may be stale
 */
export function invalidateSemanticCache(userId: string, pattern?: string | RegExp): number {
  const userCache = userCaches.get(userId);
  if (!userCache) return 0;

  if (!pattern) {
    // Clear all for user
    const count = userCache.length;
    userCaches.delete(userId);
    return count;
  }

  // Filter out matching entries
  const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
  const before = userCache.length;
  const filtered = userCache.filter((entry) => !regex.test(entry.query));
  userCaches.set(userId, filtered);

  const invalidated = before - filtered.length;
  if (invalidated > 0) {
    log.debug({ userId, invalidated, pattern: String(pattern) }, '🗑️ Invalidated cache entries');
  }

  return invalidated;
}

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * Get cache statistics
 */
export function getSemanticCacheStats(): CacheStats {
  let totalEntries = 0;
  for (const cache of userCaches.values()) {
    totalEntries += cache.length;
  }

  const totalQueries = stats.hits + stats.misses;
  const hitRate = totalQueries > 0 ? (stats.hits / totalQueries) * 100 : 0;
  const avgSimilarity = stats.hits > 0 ? stats.totalSimilaritySum / stats.hits : 0;

  return {
    hits: stats.hits,
    misses: stats.misses,
    hitRate,
    avgSimilarity,
    totalEntries,
    userCount: userCaches.size,
  };
}

/**
 * Reset cache statistics (for testing)
 */
export function resetSemanticCacheStats(): void {
  stats = { hits: 0, misses: 0, totalSimilaritySum: 0 };
}

/**
 * Get detailed cache info for a user (for debugging)
 */
export function getUserCacheInfo(userId: string): {
  entryCount: number;
  queries: string[];
  oldestEntry: number | null;
  newestEntry: number | null;
} {
  const userCache = userCaches.get(userId);
  if (!userCache || userCache.length === 0) {
    return { entryCount: 0, queries: [], oldestEntry: null, newestEntry: null };
  }

  const timestamps = userCache.map((e) => e.timestamp);
  return {
    entryCount: userCache.length,
    queries: userCache.map((e) => e.query.slice(0, 50)),
    oldestEntry: Math.min(...timestamps),
    newestEntry: Math.max(...timestamps),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  configureSemanticCache,
  findSimilarCached,
  storeInSemanticCache,
  withSemanticCache,
  clearUserSemanticCache,
  clearAllSemanticCaches,
  invalidateSemanticCache,
  getSemanticCacheStats,
  resetSemanticCacheStats,
  getUserCacheInfo,
};
