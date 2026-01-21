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
