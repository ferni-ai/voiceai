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
  CircuitOpenError,
  getCircuitBreaker,
  getAllCircuitBreakerStats,
  resetAllCircuitBreakers,
  withCircuitBreaker,
  registerCircuitBreakerCallback,
  clearCircuitBreakerCallback,
  type CircuitBreakerOptions,
  type CircuitState,
  type CircuitBreakerStats,
  type CircuitBreakerStateCallback,
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

// Safe Firestore write operations (ALWAYS use these instead of direct writes!)
export {
  safeSet,
  safeUpdate,
  safeAdd,
  createSafeBatch,
  getFirestoreInstance,
  COLLECTIONS,
} from './safe-firestore.js';

// ============================================================================
// SAFE FIRE AND FORGET
// ============================================================================

export {
  safeFireAndForget,
  fireAndForget,
  createSafeFireAndForget,
  batchFireAndForget,
  getFireAndForgetMetrics,
  resetFireAndForgetMetrics,
  registerGlobalErrorHandlers,
  type SafeFireAndForgetOptions,
} from './safe-fire-and-forget.js';

// ============================================================================
// BACKGROUND TASKS
// ============================================================================

export {
  runBackground,
  runBackgroundWithTimeout,
  runBackgroundBatch,
  type BackgroundTaskContext,
} from './background-task.js';

// ============================================================================
// SESSION REGISTRY
// ============================================================================

export {
  createSessionRegistry,
  registerGlobalRegistry,
  resetSessionGlobally,
  resetAllSessionsGlobally,
  getGlobalRegistryStats,
  type SessionRegistry,
  type SessionRegistryOptions,
} from './session-registry.js';

// ============================================================================
// INTERVAL MANAGER
// ============================================================================

export {
  registerInterval,
  clearNamedInterval,
  clearAllIntervals,
  getIntervalStats,
  hasInterval,
} from './interval-manager.js';

// ============================================================================
// LAZY SERVICE
// ============================================================================

export { lazyService, type LazyServiceOptions } from './lazy-service.js';
// NOTE: lazyServices registry moved to services layer (see services/lazy-registry.ts)

// ============================================================================
// PERFORMANCE METRICS
// ============================================================================

export {
  startTimer,
  stopTimer,
  recordSample,
  timeAsync,
  timeSync,
  getMetricSummary,
  getAllMetricSummaries,
  getMetricSamples,
  clearAllMetrics,
  logMetricsSummary,
  METRICS,
  // GC pressure metrics (for Rust migration baseline)
  gcTrackStart,
  gcTrackEnd,
  gcTrackAsync,
  gcTrackSync,
  getGcPressureSummary,
  getAllGcPressureSummaries,
  logGcPressureSummary,
  clearGcMetrics,
  GC_METRICS,
  type MetricSample,
  type MetricSummary,
  type MetricName,
  type GcSample,
  type GcPressureSummary,
  type GcMetricName,
} from './performance-metrics.js';

// ============================================================================
// COGNITIVE METRICS
// ============================================================================

export {
  cognitiveMetrics,
  timeCognitiveOperation,
  timeCognitiveOperationSync,
  recordTurnMetrics,
  getCognitiveMetricsSummary,
  maybeLogMetrics,
  maybeBroadcastMetrics,
  registerCognitiveMetricsBroadcast,
  clearCognitiveMetricsBroadcast,
  type CognitiveMetrics,
  type CognitiveMetricsSummary,
  type CognitiveMetricsBroadcastCallback,
} from './cognitive-metrics.js';

// ============================================================================
// DDOS PROTECTION
// ============================================================================

export {
  DDOS_CONFIG,
  generateRequestId,
  addRequestId,
  hardenServer,
  parseBodySafe,
  parseJsonBodySafe,
  isHealthRateLimited,
  handleHealthEndpoint,
  getClientIp,
  createOAuthStateManager,
  recordRateLimitEvent,
  getRateLimitStats,
  detectDDoSPattern,
  registerDDoSAlertCallback,
  checkAndAlertDDoS,
  startDDoSMonitoring,
  handleSecurityMonitoring,
  type ParseBodyOptions,
  type ParseBodyResult,
} from './ddos-protection.js';

// ============================================================================
// DEFAULT EXPORTS
// ============================================================================

export { default as asyncUtils } from './async.js';
export { default as metricsUtils } from './metrics.js';
export { default as rateLimiterUtils } from './rate-limiter.js';
export { default as circuitBreakerUtils } from './circuit-breaker.js';
export { default as sessionRegistryUtils } from './session-registry.js';
export { default as cognitiveMetricsUtils } from './cognitive-metrics.js';
