/**
 * Performance Optimization Module
 *
 * Centralized exports for all performance optimization utilities.
 *
 * Key Features:
 * - Response streaming for early TTS generation
 * - Batch Firestore writes for reduced latency
 * - Turn profiling for bottleneck identification
 * - Optimized audio processing with frame decimation
 * - Parallel turn execution with dependency management
 *
 * @module agents/shared/performance
 */

// Integration - Central performance setup
export {
  initializePerformanceOptimizations,
  processOptimizedTurn,
  queueBackgroundTasks,
  startSpeculativeTTS,
  getPerformanceMetrics,
  getPerformanceSummary as getIntegrationPerformanceSummary,
  resetPerformanceOptimizations,
  type PerformanceConfig,
  type PerformanceMetrics,
} from './integration.js';

// Response Streaming - Early TTS synthesis
export {
  ResponseStreamProcessor,
  LookaheadBuffer,
  createStreamingSession,
  getStreamingSession,
  endStreamingSession,
  cancelStreamingSession,
  type StreamingConfig,
  type StreamChunk,
  type StreamMetrics,
  type ChunkCallback,
} from './response-streaming.js';

// Batch Firestore Writes - Reduced round trips
export {
  getBatchWriteManager,
  queueWrite,
  queueWrites,
  flushBatchWrites,
  getBatchWriteMetrics,
  clearBatchWrites,
  queueTurnWrite,
  queueTrustUpdate,
  queueSessionUpdate,
  type WriteOperation,
  type BatchConfig,
  type BatchMetrics,
} from './batch-firestore.js';

// Turn Profiler - Latency tracking
export {
  getTurnProfiler,
  startTurnProfiling,
  markTurnCheckpoint,
  completeTurnProfiling,
  getSessionPerformanceSummary,
  getGlobalPerformanceSummary,
  clearSessionProfiling,
  PERFORMANCE_THRESHOLDS,
  type TurnTimings,
  type TurnMetrics,
  type SessionMetricsSummary,
} from './turn-profiler.js';

// Optimized Audio Processing - Frame decimation
export {
  AudioProcessingOptimizer,
  getAudioProcessingOptimizer,
  clearAudioProcessingOptimizer,
  createLowLatencyOptimizer,
  createFullProcessingOptimizer,
  getAllAudioProcessingMetrics,
  type AudioProcessingConfig,
  type AudioProcessingMetrics,
} from './optimized-audio-processing.js';

// Parallel Turn Executor - Dependency-aware parallelization
export {
  ParallelTurnExecutor,
  executeParallel,
  executeSimpleParallel,
  executeParallelSafe,
  TurnOperationTemplates,
  type TurnOperation,
  type OperationResult,
  type ParallelExecutionResult,
} from './parallel-turn-executor.js';

// Session Optimizations - Memory prewarm, tool parallelization, dedup cache, speculative prefetch
export {
  // Memory prewarm
  prewarmUserEmbeddings,
  // Tool parallelization
  executeToolsParallel,
  // Memory deduplication cache
  getCachedMemoryResult,
  cacheMemoryResult,
  clearSessionMemoryCache,
  getMemoryCacheStats,
  // Speculative prefetch
  startSpeculativePrefetch,
  getSpeculativePrefetch,
  clearSpeculativePrefetch,
  // Combined session optimization
  optimizeSessionStart,
  cleanupSessionOptimizations,
} from './session-optimizations.js';

// Tool Response Cache - Cache read-only tool results
export {
  getToolResponseCache,
  checkToolCache,
  cacheToolResult,
  invalidateToolCache,
  clearSessionToolCache,
  getToolCacheMetrics,
  TTL_BY_TOOL,
  CACHE_INVALIDATION_MAP,
  type CachedToolResponse,
  type ToolCacheConfig,
  type ToolCacheMetrics,
} from './tool-response-cache.js';

// Speculative TTS - Pre-generate likely response audio
export { getSpeculativeTTSMetrics, speculateTTS } from './speculative-tts.js';

// Streaming TTS Transform - Aggressive chunking for low latency first-audio
export {
  createStreamingTTSTransform,
  getStreamingTTSMetrics,
  resetStreamingTTSMetrics,
  isStreamingTTSEnabled,
  getOptimizedStreamingConfig,
  type StreamingTTSConfig,
  type StreamingTTSMetrics,
} from './streaming-tts-transform.js';

// Cache-Aware TTS - Check speculative cache before calling Cartesia
export {
  createCacheAwareTTSNode,
  processTTSWithCache,
  createCacheAwareTransform,
  getCacheAwareTTSMetrics,
  resetCacheAwareTTSMetrics,
  type CacheAwareTTSConfig,
  type CacheAwareTTSMetrics,
} from './cache-aware-tts.js';

// Adaptive Timing - "Better than Human" dynamic latency management
export {
  LATENCY_TARGETS,
  FILLER_STRATEGY,
  recordTurnLatency,
  getAdaptiveTimeouts,
  shouldInjectFiller,
  recordFillerInjection,
  startTurnProfile,
  completeTurnProfile,
  cleanupSessionTiming,
  getSessionPerformanceSummary as getAdaptiveTimingSummary,
  type AdaptiveTimeouts,
} from './adaptive-timing.js';

// Speculative Persona Preloading - "Better than Human" handoff prediction
export {
  predictHandoff,
  analyzeAndPreload,
  analyzeAndPreloadImmediate,
  clearSpeculativeState,
  getRecentPrediction,
  initializeSpeculativePreloading,
  type PersonaId,
  type HandoffPrediction,
  type SpeculativePreloadContext,
} from './speculative-preloading.js';

// Tool Execution Reliability - Retry, circuit breaker, metrics
export {
  executeWithReliability,
  getToolMetrics,
  getAllToolMetrics,
  getCircuitBreakerStates,
  getReliabilityDashboard,
  resetReliabilityMetrics,
} from '../tool-execution-reliability.js';

// ============================================================================
// PERFORMANCE SUMMARY UTILITIES
// ============================================================================

// Import for use in utility functions
import {
  getGlobalPerformanceSummary as _getGlobalPerformanceSummary,
  PERFORMANCE_THRESHOLDS as _PERFORMANCE_THRESHOLDS,
} from './turn-profiler.js';
import { getBatchWriteMetrics as _getBatchWriteMetrics } from './batch-firestore.js';
import {
  getAllAudioProcessingMetrics as _getAllAudioProcessingMetrics,
  type AudioProcessingMetrics as _AudioProcessingMetrics,
} from './optimized-audio-processing.js';

/**
 * Get a comprehensive performance summary across all systems
 */
export async function getPerformanceSummary(): Promise<{
  turnProfiling: ReturnType<typeof _getGlobalPerformanceSummary>;
  batchWrites: ReturnType<typeof _getBatchWriteMetrics>;
  audioProcessing: Map<string, _AudioProcessingMetrics>;
}> {
  return {
    turnProfiling: _getGlobalPerformanceSummary(),
    batchWrites: _getBatchWriteMetrics(),
    audioProcessing: _getAllAudioProcessingMetrics(),
  };
}

/**
 * Check if performance is within acceptable thresholds
 */
export function isPerformanceHealthy(): boolean {
  const turnMetrics = _getGlobalPerformanceSummary();
  return (
    turnMetrics.slowTurnPercentage < 10 &&
    turnMetrics.avgTurnMs < _PERFORMANCE_THRESHOLDS.ACCEPTABLE_TOTAL_MS
  );
}
