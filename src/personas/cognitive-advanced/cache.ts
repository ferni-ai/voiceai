/**
 * Cognitive Style Cache
 *
 * LRU cache for user cognitive style detection results.
 * Improves performance by avoiding re-analysis of similar message sets.
 */

import { createHash } from 'crypto';
import { getLogger } from '../../utils/safe-logger.js';
import type { CognitiveStyleCacheEntry, CognitiveSignals, UserCognitiveStyle } from './types.js';

const log = getLogger();

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================

const COGNITIVE_CACHE_CONFIG = {
  /** Maximum entries */
  maxEntries: 200,
  /** TTL in milliseconds (1 hour) */
  ttlMs: 60 * 60 * 1000,
  /** Minimum message count change to invalidate */
  messageCountThreshold: 3,
};

// ============================================================================
// CACHE STATE
// ============================================================================

const cognitiveStyleCache = new Map<string, CognitiveStyleCacheEntry>();

const cognitiveCacheStats = {
  hits: 0,
  misses: 0,
  evictions: 0,
};

// ============================================================================
// CACHE FUNCTIONS
// ============================================================================

/**
 * Generate cache key from messages
 */
export function generateCognitiveStyleCacheKey(messages: string[]): string {
  // Use first and last message plus count for key
  const keyData = {
    first: messages[0]?.slice(0, 50) || '',
    last: messages[messages.length - 1]?.slice(0, 50) || '',
    count: messages.length,
  };
  return createHash('md5').update(JSON.stringify(keyData)).digest('hex').slice(0, 16);
}

/**
 * Get cached cognitive style if valid
 */
export function getCachedCognitiveStyle(
  messages: string[],
  cacheKey: string
): CognitiveStyleCacheEntry['result'] | null {
  const entry = cognitiveStyleCache.get(cacheKey);

  if (!entry) {
    cognitiveCacheStats.misses++;
    return null;
  }

  // Check TTL
  if (Date.now() - entry.createdAt > COGNITIVE_CACHE_CONFIG.ttlMs) {
    cognitiveStyleCache.delete(cacheKey);
    cognitiveCacheStats.misses++;
    return null;
  }

  // Check if message count changed significantly
  if (
    Math.abs(messages.length - entry.messageCount) >= COGNITIVE_CACHE_CONFIG.messageCountThreshold
  ) {
    cognitiveStyleCache.delete(cacheKey);
    cognitiveCacheStats.misses++;
    return null;
  }

  cognitiveCacheStats.hits++;
  log.debug({ cacheKey, confidence: entry.result.confidence }, 'Cognitive style cache hit');
  return entry.result;
}

/**
 * Cache cognitive style result
 */
export function cacheCognitiveStyle(
  cacheKey: string,
  result: {
    primary: UserCognitiveStyle;
    secondary?: UserCognitiveStyle;
    confidence: number;
    signals: CognitiveSignals;
  },
  messageCount: number
): void {
  // Evict LRU if at capacity
  if (cognitiveStyleCache.size >= COGNITIVE_CACHE_CONFIG.maxEntries) {
    const firstKey = cognitiveStyleCache.keys().next().value;
    if (firstKey) {
      cognitiveStyleCache.delete(firstKey);
      cognitiveCacheStats.evictions++;
    }
  }

  cognitiveStyleCache.set(cacheKey, {
    result,
    createdAt: Date.now(),
    messageCount,
  });
}

/**
 * Get cognitive style cache statistics
 */
export function getCognitiveStyleCacheStats(): {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
} {
  const total = cognitiveCacheStats.hits + cognitiveCacheStats.misses;
  return {
    size: cognitiveStyleCache.size,
    hits: cognitiveCacheStats.hits,
    misses: cognitiveCacheStats.misses,
    evictions: cognitiveCacheStats.evictions,
    hitRate: total > 0 ? cognitiveCacheStats.hits / total : 0,
  };
}

/**
 * Clear cognitive style cache (for testing)
 */
export function clearCognitiveStyleCache(): void {
  cognitiveStyleCache.clear();
  cognitiveCacheStats.hits = 0;
  cognitiveCacheStats.misses = 0;
  cognitiveCacheStats.evictions = 0;
}

