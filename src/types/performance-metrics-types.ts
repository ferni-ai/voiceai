/**
 * Performance Metrics Types - Shared across services and memory layers
 *
 * This file provides type-safe function signatures for performance metrics
 * to prevent architecture violations (memory → services imports).
 *
 * @module types/performance-metrics-types
 */

// ============================================================================
// CACHE METRIC FUNCTIONS
// ============================================================================

/**
 * Function signature for recording cache hits
 */
export type RecordCacheHitFn = (cacheName: string, layer?: 'memory' | 'persistent') => void;

/**
 * Function signature for recording cache misses
 */
export type RecordCacheMissFn = (cacheName: string) => void;

/**
 * Function signature for recording cache evictions
 */
export type RecordCacheEvictionFn = (cacheName: string) => void;

/**
 * Performance metrics callback interface
 */
export interface PerformanceMetricsCallbacks {
  recordCacheHit: RecordCacheHitFn;
  recordCacheMiss: RecordCacheMissFn;
  recordCacheEviction: RecordCacheEvictionFn;
}

/**
 * No-op implementations for when metrics are not available
 */
export const noopMetrics: PerformanceMetricsCallbacks = {
  recordCacheHit: () => {},
  recordCacheMiss: () => {},
  recordCacheEviction: () => {},
};

