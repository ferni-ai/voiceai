/**
 * Semantic Tool Router
 *
 * A state-of-the-art, provider-agnostic tool routing system that uses
 * semantic understanding instead of relying on unreliable LLM function calling.
 *
 * ARCHITECTURE OVERVIEW:
 *
 *   User Input
 *       │
 *       ▼
 *   ┌───────────────────┐
 *   │  Semantic Router  │  ◄── Primary path (this module)
 *   │  - Pattern match  │      <20ms latency for common tools
 *   │  - Keyword score  │
 *   │  - Embedding sim  │
 *   └───────────────────┘
 *       │
 *       ├── High Confidence (>0.85) ──► Direct Execution ──► Response
 *       │
 *       └── Low Confidence ──► LLM (JSON Fallback)
 *                                  │
 *                                  ▼
 *                          ┌──────────────────┐
 *                          │ JSON Function    │  ◄── Fallback path
 *                          │ Calling System   │      (json-function-executor.ts)
 *                          └──────────────────┘
 *
 * @example
 * ```typescript
 * import { createSemanticRouter, routeUserInput, getToolRegistry } from './semantic-router';
 *
 * // Register tools
 * const registry = getToolRegistry();
 * registry.register(myMusicTool);
 * registry.register(myWeatherTool);
 *
 * // Route user input
 * const result = await routeUserInput("play some jazz");
 *
 * // Handle result
 * switch (result.action.type) {
 *   case 'execute':
 *     await router.execute(result.action.toolId, result.action.args, context);
 *     break;
 *   case 'confirm':
 *     // Ask user to confirm
 *     break;
 *   case 'hint':
 *     // Pass hint to LLM
 *     break;
 *   case 'conversation':
 *     // Let LLM handle naturally
 *     break;
 * }
 * ```
 *
 * @module tools/semantic-router
 */

// Types
export type {
  CachedEmbedding,
  ConversationTurn,
  DetectedIntent,
  EmbeddingProvider,
  // Embeddings
  EmbeddingVector,
  MatchLayer,
  RouterAction,
  // Analytics
  RoutingAnalyticsEvent,
  RoutingMetadata,
  // Configuration
  SemanticRouterConfig,
  // Routing results
  SemanticRouterResult,
  // Holistic NLU context
  HolisticContextSummary,
  // Tool definition
  SemanticToolDefinition,
  SemanticTrigger,
  ToolArgument,
  ToolCategory,
  // Execution
  ToolExecutionContext,
  ToolExecutionResult,
  ToolMatch,
  UserProfileContext,
} from './types.js';

export { DEFAULT_ROUTER_CONFIG } from './types.js';

// Configuration & Feature Flags
export {
  DEFAULT_CONFIG,
  isSemanticRoutingEnabled,
  isJsonFallbackEnabled,
  isVerboseLoggingEnabled,
  getConfig,
  updateConfig,
  resetConfig,
  logConfiguration,
} from './config.js';

// Registry
export {
  cacheEmbedding,
  clearEmbeddingCache,
  getCachedEmbedding,
  getToolRegistry,
  resetToolRegistry,
  SemanticToolRegistry,
} from './registry.js';

// Router
export {
  createSemanticRouter,
  mightNeedTool,
  resetSemanticRouter,
  routeUserInput,
  SemanticRouter,
} from './router.js';

// Matching
export {
  calculateContextBoosts,
  cosineSimilarity,
  detectIntent,
  matchPatterns,
  normalizeText,
  runCombinedMatching,
  scoreEmbeddings,
  scoreKeywords,
  tokenize,
} from './matcher.js';

// Argument extraction
export {
  createSlotFillingState,
  extractArguments,
  extractCalendarArgs,
  extractEntity,
  extractHandoffArgs,
  extractMusicArgs,
  extractToolArguments,
  extractWeatherArgs,
  generateSlotQuestion,
  updateSlotFillingState,
} from './argument-extractor.js';

// Embedding providers
export {
  createEmbeddingProvider,
  GoogleEmbeddingProvider,
  LocalHashEmbeddingProvider,
  OpenAIEmbeddingProvider,
} from './embedding-providers.js';

export type { EmbeddingModel } from './embedding-providers.js';

// Learning System
export {
  getCorrectionAnalytics,
  getCorrections,
  getToolBoostForUser,
  getUserPreferences,
  recordCorrection,
  recordImplicitCorrection,
  recordToolUsage,
  type CorrectionAnalytics,
  type RoutingCorrection,
  type UserPreferences,
} from './learning/index.js';

// Analytics
export {
  clearRoutingEvents,
  getDashboardData,
  getRoutingEvents,
  getRoutingStats,
  getToolPerformance,
  recordRoutingEvent,
  recordRoutingOutcome,
  type DashboardAlert,
  type DashboardData,
  type RoutingEvent,
  type RoutingOutcome,
  type RoutingStats,
  type ToolPerformance,
} from './analytics/index.js';

// Turn Processor Integration (NEW - Primary Tool Calling Path)
export {
  startSemanticRouting,
  applyRoutingResult,
  isRoutingEnabled,
  enableRouting,
  disableRouting,
  type TurnRouterResult,
  type RoutingContext,
} from './integration/index.js';

// Auto-Conversion
export {
  autoRegisterDomainTools,
  convertManyTools,
  convertToSemanticTool,
} from './auto-convert/index.js';

// Compatibility Layer (for legacy code)
export { semanticRouter, type SemanticMatch } from './compat.js';

// ============================================================================
// ADVANCED SEMANTIC ROUTER
// ============================================================================
// State-of-the-art routing with learned retrieval, tool chains, calibration,
// personalization, and active learning.

// Advanced Router (combines all systems)
export { AdvancedSemanticRouter, getAdvancedRouter } from './advanced/index.js';

// Learned Retriever (fine-tuned from datasets + corrections)
export {
  getLearnedRetriever,
  initializeLearnedRetriever,
  LearnedRetriever,
} from './advanced/learned-retriever.js';

// Tool Chain Prediction (multi-step sequences)
export { getChainPredictor, ToolChainPredictor } from './advanced/tool-chain-predictor.js';

// Uncertainty & Calibration (calibrated probabilities)
export { getCalibrator, UncertaintyCalibrator } from './advanced/uncertainty.js';
export type { CalibratedResult } from './advanced/uncertainty.js';

// Personalization (per-user preferences)
export {
  getPersonalizationEngine,
  initializePersonalization,
  flushPersonalizationProfiles,
  PersonalizationEngine,
} from './advanced/personalization.js';
export type { UserProfile } from './advanced/personalization.js';

// Active Learning (continuous improvement)
export {
  ActiveLearningEngine,
  getActiveLearningEngine,
  recordCorrection as recordAdvancedCorrection,
  recordSuccess as recordAdvancedSuccess,
} from './advanced/active-learning.js';

// Training Data & Datasets
export {
  exportForClassification,
  exportForSentenceTransformers,
  generateSyntheticExamples,
  loadCombinedTrainingData,
  loadGorillaDataset,
  loadToolBenchPatterns,
  logRoutingDecision,
} from './advanced/datasets.js';
export type { DatasetStats, TrainingExample } from './advanced/datasets.js';

// ============================================================================
// HOLISTIC NLU (Natural Language Understanding)
// ============================================================================

// Shared Vocabularies - relationship, emotion, time, domain detection
export {
  analyzeHolisticContext,
  detectRelationshipContext,
  detectEmotionalState,
  detectTimeContext,
  detectLifeDomain,
  detectIntentMarkers,
  calculateToolBoost,
  calculateToolPenalty,
  RELATIONSHIP_VOCABULARY,
  EMOTIONAL_VOCABULARY,
  TIME_VOCABULARY,
  LIFE_DOMAIN_VOCABULARY,
  INTENT_VOCABULARY,
} from './shared-vocabulary.js';
export type { HolisticContext } from './shared-vocabulary.js';

// Context Enrichment - multi-turn emotional trajectory, domain transitions
export {
  ConversationContextTracker,
  getContextTracker,
  cleanupContextTracker,
  processUserTurn,
} from './context-enrichment.js';
export type {
  ConversationTurnContext,
  EmotionalTrajectory,
  DomainTransition,
  ConversationTone,
  EnrichedContext,
} from './context-enrichment.js';

// Multi-Intent Detection - compound queries, parallel intents
export {
  detectMultipleIntents,
  getMultiIntentBoosts,
  matchesAnyIntent,
  getBestMatchingIntent,
} from './multi-intent.js';
export type { DetectedIntent as MultiDetectedIntent, MultiIntentResult } from './multi-intent.js';

// Holistic Layer Integration
export {
  runHolisticLayer,
  shouldBoostTool,
  shouldPenalizeTool,
  // Cache management
  getHolisticCacheStats,
  clearHolisticCache,
  pruneHolisticCache,
} from './holistic-layer.js';
export type { HolisticLayerResult, HolisticCacheStats } from './holistic-layer.js';
