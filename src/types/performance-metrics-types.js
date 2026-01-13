/**
 * Performance Metrics Types - Shared across services and memory layers
 *
 * This file provides type-safe function signatures for performance metrics
 * to prevent architecture violations (memory → services imports).
 *
 * @module types/performance-metrics-types
 */
/**
 * No-op implementations for when metrics are not available
 */
export const noopMetrics = {
    recordCacheHit: () => { },
    recordCacheMiss: () => { },
    recordCacheEviction: () => { },
};
//# sourceMappingURL=performance-metrics-types.js.map