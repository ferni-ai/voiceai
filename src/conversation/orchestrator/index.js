/**
 * Conversation Orchestrator Module
 *
 * Unified orchestration for all conversation humanization systems.
 *
 * @module @ferni/conversation/orchestrator
 */
// Main orchestrator
export { ConversationOrchestrator, default, getConversationOrchestrator, resetAllOrchestrators, resetConversationOrchestrator, } from './conversation-orchestrator.js';
// Config adapter (bridges existing config systems)
export { getConfigAdapter, orchestratorConfig, resetConfigAdapter, } from './config-adapter.js';
// Metrics
export { getAggregatedMetrics, getMetricsCollector, logMetricsSummary, logSlowOrchestration, resetAllMetrics, resetMetrics, } from './metrics.js';
// Performance optimizations
export { 
// Circuit breaker
CircuitBreaker, 
// Cache
LRUCache, 
// Timeout & Lazy loading
LazyLoader, clearDetectionCache, getCachedDetection, getCircuitBreaker, getCircuitBreakerStatus, getOrComputeDetection, 
// Stats
getPerformanceStats, resetAllCircuitBreakers, resetPerformanceOptimizations, setCachedDetection, withTimeout, } from './performance.js';
// Humanizer integration (drop-in replacement)
export { createHumanizer, createOrchestratedHumanizer, getOrchestratedHumanizer, resetAllOrchestratedHumanizers, resetOrchestratedHumanizer, } from './humanizer-integration.js';
// Debug & Monitoring
export { 
// A/B Testing
clearABTests, 
// Snapshots & Health
clearSessionRecords, createABTest, 
// Profiling
createProfiler, endABTest, exportSession, getABTestStats, getABTestVariant, getDebugSnapshot, getHealthStatus, getSessionRecords, getSystemHealth, 
// Logging
logDebugSummary, logFeatureStats, 
// Main debug API
orchestratorDebug, profileOrchestration, recordOrchestration, } from './debug.js';
// Performance Profiling
export { clearAllProfilers, clearProfiler, ConversationProfiler, createPhaseProfiler, DEFAULT_PROFILER_CONFIG, getProfiler, profileCall, } from './profiling.js';
export { DEFAULT_ORCHESTRATOR_CONFIG } from './types.js';
//# sourceMappingURL=index.js.map