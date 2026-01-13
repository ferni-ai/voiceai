/**
 * Conversation Orchestrator Module
 *
 * Unified orchestration for all conversation humanization systems.
 *
 * @module @ferni/conversation/orchestrator
 */
export { ConversationOrchestrator, default, getConversationOrchestrator, resetAllOrchestrators, resetConversationOrchestrator, } from './conversation-orchestrator.js';
export { getConfigAdapter, orchestratorConfig, resetConfigAdapter, type OrchestratorConfigAdapter, type UnifiedFeatureState, type UnifiedPreset, } from './config-adapter.js';
export { getAggregatedMetrics, getMetricsCollector, logMetricsSummary, logSlowOrchestration, resetAllMetrics, resetMetrics, type FeatureMetrics, type MetricsCollector, type MetricsSnapshot, type OrchestratorMetrics, type PhaseMetrics, } from './metrics.js';
export { CircuitBreaker, LRUCache, LazyLoader, clearDetectionCache, getCachedDetection, getCircuitBreaker, getCircuitBreakerStatus, getOrComputeDetection, getPerformanceStats, resetAllCircuitBreakers, resetPerformanceOptimizations, setCachedDetection, withTimeout, type CircuitBreakerConfig, type CircuitState, } from './performance.js';
export { createHumanizer, createOrchestratedHumanizer, getOrchestratedHumanizer, resetAllOrchestratedHumanizers, resetOrchestratedHumanizer, type ExtendedHumanizationContext, type ExtendedHumanizedResponse, type OrchestratedHumanizer, } from './humanizer-integration.js';
export { clearABTests, clearSessionRecords, createABTest, createProfiler, endABTest, exportSession, getABTestStats, getABTestVariant, getDebugSnapshot, getHealthStatus, getSessionRecords, getSystemHealth, logDebugSummary, logFeatureStats, orchestratorDebug, profileOrchestration, recordOrchestration, type ABTestConfig, type DebugSnapshot, type HealthIndicators, type OrchestrationRecord, } from './debug.js';
export { clearAllProfilers, clearProfiler, ConversationProfiler, createPhaseProfiler, DEFAULT_PROFILER_CONFIG, getProfiler, profileCall, type FeatureTiming, type PhaseTiming, type ProfilerConfig, type ProfilerReport, type ProfilerSnapshot, type ProfilerSummary, } from './profiling.js';
export type { AnalysisContext, AnalysisPhaseResult, AppliedFeature, DetectedSignals, HumanizationPhaseResult, IntelligenceGuidance, IntelligencePhaseResult, OrchestratorConfig, OrchestratorInput, OrchestratorOutput, OutputMetadata, PriorityAction, ResponseAdditions, SkippedFeature, } from './types.js';
export { DEFAULT_ORCHESTRATOR_CONFIG } from './types.js';
//# sourceMappingURL=index.d.ts.map