/**
 * Conversation Orchestrator Module
 *
 * Unified orchestration for all conversation humanization systems.
 *
 * @module @ferni/conversation/orchestrator
 */

// Main orchestrator
export {
  ConversationOrchestrator,
  default,
  getConversationOrchestrator,
  resetAllOrchestrators,
  resetConversationOrchestrator,
} from './conversation-orchestrator.js';

// Config adapter (bridges existing config systems)
export {
  getConfigAdapter,
  orchestratorConfig,
  resetConfigAdapter,
  type OrchestratorConfigAdapter,
  type UnifiedFeatureState,
  type UnifiedPreset,
} from './config-adapter.js';

// Metrics
export {
  getAggregatedMetrics,
  getMetricsCollector,
  logMetricsSummary,
  logSlowOrchestration,
  resetAllMetrics,
  resetMetrics,
  type FeatureMetrics,
  type MetricsCollector,
  type MetricsSnapshot,
  type OrchestratorMetrics,
  type PhaseMetrics,
} from './metrics.js';

// Performance optimizations
export {
  // Circuit breaker
  CircuitBreaker,
  // Cache
  LRUCache,
  // Timeout & Lazy loading
  LazyLoader,
  clearDetectionCache,
  getCachedDetection,
  getCircuitBreaker,
  getCircuitBreakerStatus,
  getOrComputeDetection,
  // Stats
  getPerformanceStats,
  resetAllCircuitBreakers,
  resetPerformanceOptimizations,
  setCachedDetection,
  withTimeout,
  type CircuitBreakerConfig,
  type CircuitState,
} from './performance.js';

// Humanizer integration (drop-in replacement)
export {
  createHumanizer,
  createOrchestratedHumanizer,
  getOrchestratedHumanizer,
  resetAllOrchestratedHumanizers,
  resetOrchestratedHumanizer,
  type ExtendedHumanizationContext,
  type ExtendedHumanizedResponse,
  type OrchestratedHumanizer,
} from './humanizer-integration.js';

// Debug & Monitoring
export {
  // A/B Testing
  clearABTests,
  // Snapshots & Health
  clearSessionRecords,
  createABTest,
  // Profiling
  createProfiler,
  endABTest,
  exportSession,
  getABTestStats,
  getABTestVariant,
  getDebugSnapshot,
  getHealthStatus,
  getSessionRecords,
  getSystemHealth,
  // Logging
  logDebugSummary,
  logFeatureStats,
  // Main debug API
  orchestratorDebug,
  profileOrchestration,
  recordOrchestration,
  // Types
  type ABTestConfig,
  type DebugSnapshot,
  type HealthIndicators,
  type OrchestrationRecord,
} from './debug.js';

// Performance Profiling
export {
  clearAllProfilers,
  clearProfiler,
  ConversationProfiler,
  createPhaseProfiler,
  DEFAULT_PROFILER_CONFIG,
  getProfiler,
  profileCall,
  type FeatureTiming,
  type PhaseTiming,
  type ProfilerConfig,
  type ProfilerReport,
  type ProfilerSnapshot,
  type ProfilerSummary,
} from './profiling.js';

// Types
export type {
  AnalysisContext,
  AnalysisPhaseResult,
  AppliedFeature,
  DetectedSignals,
  HumanizationPhaseResult,
  IntelligenceGuidance,
  IntelligencePhaseResult,
  OrchestratorConfig,
  OrchestratorInput,
  OrchestratorOutput,
  OutputMetadata,
  PriorityAction,
  ResponseAdditions,
  SkippedFeature,
} from './types.js';

export { DEFAULT_ORCHESTRATOR_CONFIG } from './types.js';
