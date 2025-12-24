/**
 * Advanced Semantic Router Systems
 *
 * State-of-the-art features for tool routing:
 *
 * 1. **Feedback & Learning** - Active learning from user corrections
 * 2. **Tool Chains** - Multi-step tool sequence prediction
 * 3. **Deep Context** - Entity tracking and pronoun resolution
 * 4. **Calibration** - Confidence score calibration
 * 5. **Personalization** - Per-user vocabulary and preferences
 *
 * @module semantic-router/advanced
 */

// Feedback Collection & Learning Loop
export {
  // Core learning
  enhanceWithLearning,
  recordOutcome,
  handleExplicitCorrection,
  runBatchLearning,
  // Tool chain prediction from learning
  predictToolChain,
  recordToolCoOccurrence,
  // Re-exports from feedback-store
  recordFeedback,
  recordCorrection,
  learnUserPhrase,
  getUserVocabulary,
  matchUserPhrases,
  updateCalibration,
  calibrateConfidence,
  getFeedbackStats,
  type LearningContext,
  type LearningOutcome,
  type EnhancedRouting,
} from './learning-loop.js';

// Feedback Store
export {
  type RoutingFeedback,
  type UserCorrection,
  type UserVocabulary,
  type CalibrationData,
  getUserStats,
  getCalibrationData,
} from './feedback-store.js';

// Tool Chains
export {
  // Chain detection
  detectToolChain,
  predictNextStep,
  // Chain execution
  startChainExecution,
  recordStepCompletion,
  getActiveChain,
  cancelChain,
  // Chain learning
  learnToolSequence,
  predictFromLearned,
  // Stats
  getChainStats,
  // Types
  PREDEFINED_CHAINS,
  type ToolChainDefinition,
  type ChainPrediction,
  type ChainExecutionContext,
} from './tool-chains.js';

// Deep Context
export {
  // Context management
  getDeepContext,
  clearDeepContext,
  updateContextWithInput,
  updateContextWithToolResult,
  // Entity extraction (regex fallback)
  extractEntities,
  // Entity extraction (real NER)
  extractEntitiesWithNER,
  // Pronoun resolution
  resolvePronouns,
  resolveForTool,
  // Summary & cleanup
  getContextSummary,
  cleanupOldContexts,
  // Types
  type EntityType,
  type TrackedEntity,
  type ConversationTopic,
  type ToolResultContext,
  type DeepContext,
  type ResolutionResult,
} from './deep-context.js';

// Evaluation
export {
  loadBenchmarkDataset,
  runBenchmark,
  type BenchmarkTestCase,
  type BenchmarkDataset,
  type BenchmarkResults,
  type BenchmarkOptions,
} from '../evaluation/benchmark-runner.js';

// ============================================================================
// EXISTING ADVANCED SYSTEMS (re-exported for compatibility)
// ============================================================================

// Learned Retriever
export {
  LearnedRetriever,
  getLearnedRetriever,
  initializeLearnedRetriever,
} from './learned-retriever.js';

// Tool Chain Predictor (existing)
export { ToolChainPredictor, getChainPredictor } from './tool-chain-predictor.js';

// Uncertainty & Calibration
export { UncertaintyCalibrator, getCalibrator } from './uncertainty.js';

// Personalization
export { PersonalizationEngine, getPersonalizationEngine } from './personalization.js';

// Active Learning
export { ActiveLearningEngine, getActiveLearningEngine } from './active-learning.js';

// Datasets
export * from './datasets.js';

// Workers
export * from './workers/index.js';

// ============================================================================
// ADVANCED ROUTER CLASS (combines all systems)
// ============================================================================

import { createLogger } from '../../../utils/safe-logger.js';
import type { SemanticRouterResult } from '../types.js';

const log = createLogger({ module: 'AdvancedSemanticRouter' });

let advancedRouterInstance: AdvancedSemanticRouter | null = null;

/**
 * Advanced Semantic Router
 *
 * Combines all advanced systems into a unified interface:
 * - Feedback collection & learning
 * - Tool chain prediction
 * - Deep context with entity resolution
 * - Confidence calibration
 * - Per-user personalization
 */
export class AdvancedSemanticRouter {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    log.info('Initializing Advanced Semantic Router...');

    // Initialize sub-systems as needed
    this.initialized = true;

    log.info('Advanced Semantic Router initialized');
  }

  async route(
    input: string,
    context: {
      userId: string;
      sessionId: string;
      personaId: string;
    }
  ): Promise<SemanticRouterResult & { enhancements?: unknown }> {
    // This would integrate with the base router
    // For now, just return a placeholder
    throw new Error('Use getVoiceRouter() from voice-integration.ts instead');
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

/**
 * Get the singleton advanced router instance
 */
export function getAdvancedRouter(): AdvancedSemanticRouter {
  if (!advancedRouterInstance) {
    advancedRouterInstance = new AdvancedSemanticRouter();
  }
  return advancedRouterInstance;
}

// ============================================================================
// NER ENGINE (Real Named Entity Recognition)
// ============================================================================

export {
  // Initialization
  initializeNER,
  // Core extraction
  extractEntities as extractNEREntities,
  getEntitiesByType,
  getEntityForArg,
  // Basic checks
  hasPerson,
  hasPlace,
  hasDateTime,
  // Ferni-specific checks
  hasEmotion,
  hasHabit,
  hasGoal,
  hasRelationship,
  hasActivity,
  hasFrequency,
  hasMusicMention,
  // Emotion analysis
  getEmotions,
  getPrimaryEmotion,
  analyzeSentiment,
  // Rich summary
  getEntitySummary,
  // Types
  type NEREntity,
  type NEREntityType,
  type NERResult,
} from './ner-engine.js';

// ============================================================================
// STREAMING ROUTER (Route as user speaks)
// ============================================================================

export {
  StreamingRouter,
  getStreamingRouter,
  initializeStreamingRouter,
  hasStreamingDetection,
  getCurrentPrediction,
  type StreamingState,
  type StreamingSignal,
  type StreamingConfig,
  type SignalCallback,
} from './streaming-router.js';

// ============================================================================
// PROACTIVE SUGGESTIONS
// ============================================================================

export {
  ProactiveSuggestionsEngine,
  getProactiveSuggestionsEngine,
  getProactiveSuggestions,
  recordProactiveFeedback,
  getProactiveStats,
  type ProactiveSuggestion,
  type UserContext,
} from './proactive-suggestions.js';

// ============================================================================
// BETTER THAN HUMAN INTELLIGENCE
// ============================================================================

export {
  // Voice prosody → tool boost
  analyzeVoiceProsodyForToolBoost,
  // Explanation transparency
  generateRoutingExplanation,
  generateSpokenExplanation,
  // Emotional arc tracking
  recordEmotionalDataPoint,
  analyzeEmotionalArc,
  getEmotionalArcSummary,
  persistEmotionalHistory,
  loadEmotionalHistory,
  // Speaking pace detection
  analyzeSpeakingPace,
  getToolBoostFromPace,
  // Combined analysis
  performBetterThanHumanAnalysis,
  // Types
  type VoiceProsodySignals,
  type SpeakingPaceAnalysis,
  type EmotionalDataPoint,
  type EmotionalArc,
  type ToolBoostDecision,
  type RoutingExplanation,
  type BetterThanHumanAnalysis,
} from './better-than-human.js';
