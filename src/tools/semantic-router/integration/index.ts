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
