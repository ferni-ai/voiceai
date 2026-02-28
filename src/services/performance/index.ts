/**
 * Performance Services Index
 *
 * Central export point for all performance optimization modules:
 * - Speculative TTS: Pre-generates audio for predicted responses
 * - Turn Profiler: Tracks latencies and identifies bottlenecks
 * - Tool Execution Reliability: Retry, circuit breaker, and metrics
 * - Tool Response Cache: Caches tool results to avoid redundant calls
 *
 * @module services/performance
 */

// =============================================================================
// SPECULATIVE TTS
// Pre-generates TTS audio for predicted responses to reduce latency
// =============================================================================

export {
  // Singleton and lifecycle
  getSpeculativeTTS,
  warmupTTSVoice,
  // Core functions
  speculateTTS,
  getTTSWithSpeculation,
  streamTTSWithSpeculation,
  branchPredictTTS,
  // Metrics
  getSpeculativeTTSMetrics,
  // Types
  type TTSRequest,
  type TTSResult,
  type SpeculativeCandidate,
  type SpeculativeTTSConfig,
} from './speculative-tts.js';

// =============================================================================
// TURN PROFILER
// Tracks turn latencies and identifies performance bottlenecks
// =============================================================================

export {
  // Singleton
  getTurnProfiler,
  // Lifecycle functions
  startTurnProfiling,
  markTurnCheckpoint,
  completeTurnProfiling,
  // Summary functions
  getSessionPerformanceSummary,
  getGlobalPerformanceSummary,
  clearSessionProfiling,
  // Constants
  PERFORMANCE_THRESHOLDS,
  // Types
  type TurnTimings,
  type TurnMetrics,
  type SessionMetricsSummary,
} from './turn-profiler.js';

// =============================================================================
// TOOL EXECUTION RELIABILITY
// Retry logic, circuit breakers, and execution metrics
// =============================================================================

export {
  // Main execution function
  executeWithReliability,
  // Timeout configuration
  getTimeoutForTool,
  // Metrics
  getToolMetrics,
  getAllToolMetrics,
  getCircuitBreakerStates,
  getReliabilityDashboard,
  resetReliabilityMetrics,
  // Types
  type RetryConfig,
  type CircuitBreakerConfig,
  type ToolExecutionMetrics,
} from './tool-execution-reliability.js';

// =============================================================================
// TOOL RESPONSE CACHE
// Caches tool responses to avoid redundant API calls
// =============================================================================

export {
  // Singleton and lifecycle
  getToolResponseCache,
  resetToolResponseCache,
  // Cache operations
  checkToolCache,
  cacheToolResult,
  invalidateToolCache,
  clearSessionToolCache,
  // Metrics
  getToolCacheMetrics,
  // Configuration
  TTL_BY_TOOL,
  CACHE_INVALIDATION_MAP,
  // Types
  type CachedToolResponse,
  type ToolCacheConfig,
  type ToolCacheMetrics,
} from './tool-response-cache.js';

// =============================================================================
// PERFORMANCE ALERTS
// Slack/email alerting for performance regressions
// =============================================================================

export * from './performance-alerts.js';

// =============================================================================
// PERFORMANCE INSTRUMENTATION
// Memory tracking, phase tracking, performance monitoring
// =============================================================================

export * from './performance-instrumentation.js';

// =============================================================================
// PERFORMANCE METRICS
// MetricsStore with percentile statistics
// =============================================================================

export * from './performance-metrics.js';

// =============================================================================
// PERFORMANCE PROFILER
// Trace/mark/report profiling utilities
// =============================================================================

export * from './performance-profiler.js';

// =============================================================================
// OPTIMIZATION ALERTING
// Optimization regression detection and alerting
// =============================================================================

export {
  type AlertSeverity,
  type AlertChannel,
  type Alert,
  // AlertConfig skipped — already exported by performance-alerts
  type AlertThresholds,
  alertingService,
} from './optimization-alerting.js';

// =============================================================================
// OPTIMIZATION PERSISTENCE
// Persist optimization data to Firestore
// =============================================================================

export * from './optimization-persistence.js';

// =============================================================================
// PREDICTIVE ALERTING
// Trend-based predictive performance alerts
// =============================================================================

export * from './predictive-alerting.js';

// =============================================================================
// OPS ORCHESTRATOR
// Unified self-healing & alerting system
// =============================================================================

export * from './ops-orchestrator.js';

// =============================================================================
// SMART RUNBOOKS
// AI-generated remediation steps
// =============================================================================

export * from './smart-runbooks.js';

// =============================================================================
// INCIDENT TIMELINE
// Automatic incident documentation
// =============================================================================

export * from './incident-timeline.js';

// =============================================================================
// DIAGNOSTIC LOGGER
// Structured diagnostic logging with categories
// =============================================================================

export * from './diagnostic-logger.js';

// =============================================================================
// ERROR TRACKING
// Sentry integration for production error monitoring
// =============================================================================

export * from './error-tracking.js';
