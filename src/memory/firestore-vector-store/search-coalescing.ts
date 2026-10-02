/**
 * Firestore Vector Store - request coalescing for vector search
 *
 * Identical concurrent searches share one execution. Used by core.ts.
 *
 * @module memory/firestore-vector-store/search-coalescing
 */

import { getRequestCoalescer, hashContent } from '../../utils/request-coalescer.js';
import type { VectorFilter, VectorSearchResult } from '../vector-store-interface.js';

/**
 * Request coalescer for vector search queries.
 * Coalesces identical search queries to prevent duplicate work when
 * multiple concurrent requests have the same query and options.
 *
 * Key: SHA256 hash of query text + options (topK, minScore, filter)
 *
 * Benefits:
 * - Reduces redundant embedding generation and search work
 * - TTL-based cleanup (60s) prevents memory leaks
 * - Built-in stats tracking for observability
 */
export const vectorSearchCoalescer = getRequestCoalescer<VectorSearchResult[]>(
  'firestore-vector-search',
  {
    pendingTtlMs: 60000,
    maxPending: 5000,
    // Clone results to prevent mutation bugs when multiple callers share the result.
    // IMPORTANT: Use structuredClone for deep copy - metadata can have nested objects.
    cloneResult: (results) => structuredClone(results),
  }
);

/**
 * Generate a coalescing key for a vector search request.
 * Key is based on query + search options.
 */
export function getVectorSearchCoalesceKey(
  query: string,
  options?: {
    topK?: number;
    filter?: VectorFilter;
    minScore?: number;
  }
): string {
  const keyData = JSON.stringify({
    query,
    topK: options?.topK ?? 5,
    minScore: options?.minScore ?? 0,
    // Include ALL filter fields that affect results
    filterSource: options?.filter?.source,
    filterUserId: options?.filter?.userId,
    filterCategory: options?.filter?.category,
    filterMinTimestamp: options?.filter?.minTimestamp?.toISOString(),
    filterMaxTimestamp: options?.filter?.maxTimestamp?.toISOString(),
    // Include metadata filter - this is important for correct coalescing
    // JSON.stringify handles nested objects correctly
    filterMetadata: options?.filter?.metadata,
  });
  return hashContent(keyData);
}

/**
 * Get stats for the vector search coalescer (for observability)
 */
export function getVectorSearchCoalescerStats(): {
  totalRequests: number;
  coalescedRequests: number;
  actualExecutions: number;
  coalesceRate: number;
  errors: number;
  currentPending: number;
} {
  return vectorSearchCoalescer.getStats();
}

/**
 * Check if vector search coalescing is enabled.
 * Always true - coalescing is always on for vector search.
 */
export function isVectorCoalescingEnabled(): boolean {
  return true;
}
