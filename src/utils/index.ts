/**
 * Utilities Index
 *
 * Common utilities for the Ferni codebase.
 *
 * @module utils
 */

// ============================================================================
// LOGGING
// ============================================================================

export {
  createLogger,
  getLogger,
  safeLog,
  serializeError,
  type FallbackLogger,
} from './safe-logger.js';

// ============================================================================
// ASYNC UTILITIES
// ============================================================================

export {
  TimeoutError,
  debounceAsync,
  defer,
  parallelLimit,
  retry,
  sequence,
  sleep,
  throttleAsync,
  waitFor,
  withTimeout,
  type RetryOptions,
  type ThrottleOptions,
} from './async.js';

// ============================================================================
// RATE LIMITING
// ============================================================================

export {
  RateLimitError,
  RateLimiter,
  SlidingWindowLimiter,
  getRateLimiter,
  getSlidingWindowLimiter,
  rateLimited,
  resetAllRateLimiters,
  type RateLimiterOptions,
  type RateLimiterState,
} from './rate-limiter.js';

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

export {
  CircuitBreaker,
  getCircuitBreaker,
  resetAllCircuitBreakers,
  withCircuitBreaker,
  type CircuitBreakerOptions,
} from './circuit-breaker.js';

// ============================================================================
// METRICS
// ============================================================================

export {
  Metrics,
  startMetricsReporter,
  type CounterMetric,
  type GaugeMetric,
  type HistogramMetric,
  type MetricLabels,
  type MetricsSnapshot,
} from './metrics.js';

// ============================================================================
// CLEANUP
// ============================================================================

export { CleanupManager, addAutoCleanupListener, addOnceListener } from './cleanup-patterns.js';

// ============================================================================
// FIRESTORE UTILITIES
// ============================================================================

export { cleanForFirestore, deepRemoveUndefined, removeUndefined } from './firestore-utils.js';

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export { default as asyncUtils } from './async.js';
export { default as metricsUtils } from './metrics.js';
export { default as rateLimiterUtils } from './rate-limiter.js';
