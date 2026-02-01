/**
 * Semantic Router Integration
 *
 * Entry point for integrating semantic routing into the voice agent pipeline.
 *
 * @module tools/semantic-router/integration
 */

// Turn processor integration
export {
  startSemanticRouting,
  applyRoutingResult,
  isRoutingEnabled,
  enableRouting,
  disableRouting,
  type TurnRouterResult,
  type RoutingContext,
} from './turn-processor-integration.js';

// Re-export HolisticContextSummary for downstream consumers
export type { HolisticContextSummary } from '../types.js';

// Initialization
export {
  initializeSemanticRouter,
  isSemanticRouterInitialized,
  resetSemanticRouter,
  getInitializationMetrics,
} from './init.js';

// Metrics
export {
  recordRoutingMetric,
  recordLLMBypass,
  recordHintAdded,
  recordConversation,
  recordRoutingError,
  getRecentMetrics,
  getAggregateMetrics,
  getUserMetrics,
  getToolMetrics,
  clearMetrics,
  getDashboardData,
  // Learning loop closure (Better Than Human)
  recordLearningEvent,
  recordToolSuccess,
  recordToolCorrection,
  type RoutingMetric,
  type AggregateMetrics,
} from './metrics.js';

// Transcript-level integration (for voice agent Live API flow)
export {
  routeTranscript,
  isSemanticRoutingEnabled,
  type TranscriptRoutingContext,
  type TranscriptRoutingResult,
} from './transcript-integration.js';

// 🧠 Intelligent Router Integration (6-strategy cascade)
export {
  initializeIntelligentRouter,
  startIntelligentRouting,
  recordIntelligentOutcome,
  isIntelligentRouterInitialized,
  getOrchestrator,
  getIntelligentRoutingStats,
  resetIntelligentRouter,
  type IntelligentRouterConfig,
} from './intelligent-router-integration.js';

// 📚 Active Learning Integration (Better Than Human)
export {
  initializeActiveLearning,
  getPreRoutingEnhancements,
  startTurnTracking,
  recordSemanticRoutingResult,
  recordLLMToolExecution,
  recordAssistantResponse,
  completeTurnTracking,
  handleUserCorrection,
  predictNextTools,
  endLearningSession,
  cleanupOldSessions,
  getLearningStats,
  // Re-exports from learning-loop
  enhanceWithLearning,
  recordOutcome,
  type LearningContext,
  type LearningOutcome,
  type EnhancedRouting,
} from './active-learning-integration.js';

// 🚀 SOTA Integration (State of the Art features)
export {
  // Pre-routing enhancements
  applySOTAPreRouting,
  applySOTAConfidenceAdjustments,
  // Post-routing outcome tracking
  recordSOTAOutcome,
  recordImplicitCorrection,
  // Prosody tracking
  startProsodyTracking,
  endProsodyTracking,
  feedAudioToProsody,
  // Stats
  getSOTAStats,
  // Types
  type SOTARoutingContext,
  type SOTARoutingResult,
  type SOTAOutcome,
} from './sota-integration.js';

// NOTE: ML routers (ONNX, Candle, Unified) were removed in January 2026.
// The current semantic router achieves <50ms latency without ML models.
// If GPU-accelerated routing is needed in the future, see git history for
// the original implementation (onnx-router.ts, candle-router.ts, unified-router.ts).
