/**
 * Context Output Cache
 *
 * Caches context builder output for performance optimization.
 * Uses 5-minute TTL and LRU eviction.
 *
 * @module context-builders/core/cache
 */

import { createHash } from 'crypto';
import { createLogger } from '../../../utils/safe-logger.js';
import type { ContextBuilderInput, ContextInjection } from './types.js';

const log = createLogger({ module: 'context-cache' });

// ============================================================================
// CACHE TYPES
// ============================================================================

interface ContextOutputCacheEntry {
  injections: ContextInjection[];
  createdAt: number;
  accessedAt: number;
  inputHash: string;
}

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================

const CONTEXT_OUTPUT_CACHE_CONFIG = {
  /** Maximum entries in the cache */
  maxEntries: 100,
  /** TTL in milliseconds (5 minutes) */
  ttlMs: 5 * 60 * 1000,
  /** Minimum text length change to invalidate cache */
  textChangeThreshold: 50,
};

// ============================================================================
// CACHE STATE
// ============================================================================

const contextOutputCache = new Map<string, ContextOutputCacheEntry>();

const contextCacheStats = {
  hits: 0,
  misses: 0,
  evictions: 0,
};

// ============================================================================
// CACHE KEY GENERATION
// ============================================================================

/**
 * Generate a cache key for context builder output
 * Based on session, turn count, emotion, and text hash
 */
export function generateContextCacheKey(input: ContextBuilderInput): string {
  const keyParts = [
    input.services?.sessionId || 'no-session',
    input.userData?.turnCount?.toString() || '0',
    input.analysis?.emotion?.primary || 'neutral',
    Math.round((input.analysis?.emotion?.intensity ?? 0) * 10).toString(),
    input.persona?.identity?.id || 'unknown',
  ];
  return keyParts.join(':');
}

/**
 * Generate a hash of the input for cache validation
 */
export function generateInputHash(input: ContextBuilderInput): string {
  const hashData = {
    text: (input.userText || '').slice(0, 200), // First 200 chars
    emotion: input.analysis?.emotion || { primary: 'neutral', intensity: 0 },
    intent: input.analysis?.intent?.primary || 'unknown',
    topics: input.analysis?.topics?.detected?.slice(0, 3) || [],
  };
  return createHash('md5').update(JSON.stringify(hashData)).digest('hex').slice(0, 16);
}

// ============================================================================
// CACHE VALIDATION
// ============================================================================

/**
 * Check if cached context is still valid
 */
function isContextCacheValid(entry: ContextOutputCacheEntry, inputHash: string): boolean {
  // Check TTL
  if (Date.now() - entry.createdAt > CONTEXT_OUTPUT_CACHE_CONFIG.ttlMs) {
    return false;
  }

  // Check input hash matches
  return entry.inputHash === inputHash;
}

// ============================================================================
// CACHE OPERATIONS
// ============================================================================

/**
 * Get cached context output if valid
 */
export function getCachedContextOutput(input: ContextBuilderInput): ContextInjection[] | null {
  const cacheKey = generateContextCacheKey(input);
  const inputHash = generateInputHash(input);

  const entry = contextOutputCache.get(cacheKey);
  if (!entry) {
    contextCacheStats.misses++;
    return null;
  }

  if (!isContextCacheValid(entry, inputHash)) {
    contextOutputCache.delete(cacheKey);
    contextCacheStats.misses++;
    return null;
  }

  // Update access time
  entry.accessedAt = Date.now();
  contextCacheStats.hits++;

  log.debug({ cacheKey, injectionCount: entry.injections.length }, 'Context cache hit');
  return entry.injections;
}

/**
 * Cache context output
 */
export function cacheContextOutput(
  input: ContextBuilderInput,
  injections: ContextInjection[]
): void {
  const cacheKey = generateContextCacheKey(input);
  const inputHash = generateInputHash(input);

  // Evict LRU if at capacity
  if (contextOutputCache.size >= CONTEXT_OUTPUT_CACHE_CONFIG.maxEntries) {
    let oldest: { key: string; accessedAt: number } | null = null;
    for (const [key, entry] of contextOutputCache.entries()) {
      if (!oldest || entry.accessedAt < oldest.accessedAt) {
        oldest = { key, accessedAt: entry.accessedAt };
      }
    }
    if (oldest) {
      contextOutputCache.delete(oldest.key);
      contextCacheStats.evictions++;
    }
  }

  const now = Date.now();
  contextOutputCache.set(cacheKey, {
    injections,
    createdAt: now,
    accessedAt: now,
    inputHash,
  });

  log.debug({ cacheKey, injectionCount: injections.length }, 'Cached context output');
}

/**
 * Get context output cache statistics
 */
export function getContextOutputCacheStats(): {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
} {
  const total = contextCacheStats.hits + contextCacheStats.misses;
  return {
    size: contextOutputCache.size,
    hits: contextCacheStats.hits,
    misses: contextCacheStats.misses,
    evictions: contextCacheStats.evictions,
    hitRate: total > 0 ? contextCacheStats.hits / total : 0,
  };
}

/**
 * Clear context output cache (for testing)
 */
export function clearContextOutputCache(): void {
  contextOutputCache.clear();
  contextCacheStats.hits = 0;
  contextCacheStats.misses = 0;
  contextCacheStats.evictions = 0;
}

/**
 * Clear cache entries for a specific session
 */
export function clearSessionCache(sessionId: string): void {
  for (const key of contextOutputCache.keys()) {
    if (key.startsWith(sessionId)) {
      contextOutputCache.delete(key);
    }
  }
}
