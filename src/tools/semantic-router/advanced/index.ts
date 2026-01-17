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

// ============================================================================
// INTELLIGENT ROUTING SYSTEM (State-of-the-Art)
// ============================================================================

/**
 * Advanced intelligent routing strategies that go beyond semantic matching:
 *
 * 1. Intent Classifier - Fast NLU-style classification (<5ms)
 * 2. LLM Fallback - For uncertain cases (~500ms)
 * 3. ReAct Reasoning - Explainable decisions (~800ms)
 * 4. Goal Planner - Multi-step execution (~1-2s)
 * 5. Bandit Optimizer - RL-based learning
 * 6. Orchestrator - Combines all strategies
 *
 * @example
 * ```typescript
 * import { getIntelligentOrchestrator, intelligentRoute } from './advanced';
 *
 * // Quick route using all strategies
 * const decision = await intelligentRoute('play some jazz music');
 *
 * // Or use the orchestrator directly
 * const orchestrator = getIntelligentOrchestrator();
 * await orchestrator.initialize({ tools, llmProvider });
 * const decision = await orchestrator.route(input, context);
 * ```
 */
export {
  // Intent Classifier
  IntentClassifier,
  getIntentClassifier,
  initializeIntentClassifier,
  type IntentClassifierConfig,
  type Intent,
  type Slot,
  type SlotType,
  type ClassificationResult,
  // LLM Fallback
  LLMFallbackRouter,
  getLLMFallbackRouter,
  initializeLLMFallback,
  createGeminiProvider,
  createOpenAIProvider,
  type LLMFallbackConfig,
  type LLMSelectionResult,
  type ToolCandidate,
  type LLMProvider,
  // ReAct Reasoning
  ReActReasoningEngine,
  getReActEngine,
  initializeReActEngine,
  explainReasoning,
  suggestsMultiStep,
  type ReActConfig,
  type ReasoningStep,
  type ReActResult,
  type ReActLLMProvider,
  type ReActToolDescription,
  // Goal Planner
  GoalPlanner,
  getGoalPlanner,
  initializeGoalPlanner,
  describePlan,
  shouldAutoExecute,
  type GoalPlannerConfig,
  type PlanStep,
  type ExecutionPlan,
  type PlanExecutionState,
  type GoalPlannerLLMProvider,
  type ToolExecutor,
  type GoalPlannerToolDefinition,
  // Bandit Optimizer
  BanditOptimizer,
  getBanditOptimizer,
  initializeBanditOptimizer,
  calculateImplicitReward,
  calculateExplicitReward,
  type BanditConfig,
  type ToolArm,
  type BanditSelectionResult,
  type RewardSignal,
  type BanditRoutingContext,
  // Intelligent Orchestrator
  IntelligentRouterOrchestrator,
  getIntelligentOrchestrator,
  initializeIntelligentOrchestrator,
  intelligentRoute,
  type OrchestratorConfig,
  type RoutingDecision,
  type RoutingStrategy,
  type OrchestratorToolDefinition,
  type OrchestratorRoutingContext,
} from './intelligent/index.js';

// ============================================================================
// AUDIO PROSODY EXTRACTION (SOTA: Real Audio Analysis)
// ============================================================================

/**
 * Real audio prosody analysis for voice-aware routing.
 * Extracts acoustic features from audio streams:
 * - Pitch/F0 tracking
 * - Energy/volume analysis
 * - Speech rate detection
 * - Jitter/shimmer (voice quality)
 * - Harmonic-to-noise ratio
 *
 * @example
 * ```typescript
 * import { getAudioProsodyExtractor } from './advanced';
 *
 * const extractor = getAudioProsodyExtractor();
 * const features = extractor.processAudioChunk(audioSamples);
 * const signals = extractor.featuresToProsodySignals(features);
 * ```
 */
export {
  AudioProsodyExtractor,
  getAudioProsodyExtractor,
  type AcousticFeatures,
  type ProsodyExtractorConfig,
  type ProsodyWindow,
} from './audio-prosody-extractor.js';

// ============================================================================
// PROSODY ROUTING INTEGRATION (SOTA: Voice → Routing)
// ============================================================================

/**
 * Integrates real audio prosody analysis with semantic routing decisions.
 * This is the bridge between raw audio and tool selection:
 *
 * - Real-time tool boosting based on voice signals
 * - Crisis/distress detection for safety routing
 * - Personalized baseline learning
 * - Prosody-aware confidence adjustment
 *
 * @example
 * ```typescript
 * import { getProsodyRoutingEngine } from './advanced';
 *
 * const engine = getProsodyRoutingEngine();
 *
 * // Process audio and get prosody signals
 * const signals = engine.processAudio(userId, sessionId, audioSamples);
 *
 * // Adjust routing based on prosody
 * const adjusted = engine.adjustRouting(userId, sessionId, matches);
 * // adjusted.boostedTools - tools boosted due to voice signals
 * // adjusted.emergencyDetected - crisis detection
 * ```
 */
export {
  ProsodyRoutingEngine,
  getProsodyRoutingEngine,
  initializeProsodyRouting,
  shutdownProsodyRouting,
  type ProsodyRoutingConfig,
  type ProsodyRoutingAdjustment,
} from './prosody-routing-integration.js';
