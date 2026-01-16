/**
 * Unified Intelligence Layer
 *
 * Bridges SemanticRouter and UnifiedToolOrchestrator for "Better Than Human"
 * tool selection and anticipation.
 *
 * Features:
 * - Cross-session learning (Firestore persistence)
 * - Emotion-aware tool selection (voice prosody → tool boosts)
 * - Cross-persona intelligence (handoff context)
 * - Proactive outreach integration (time-based patterns)
 * - Tool merging (semantic deduplication)
 * - Transition matrices (sequence prediction)
 *
 * @module tools/intelligence
 */

export {
  UnifiedIntelligenceLayer,
  getUnifiedIntelligence,
  initializeUnifiedIntelligence,
  // Core types
  type UserIntelligenceProfile,
  type IntelligenceEnhancement,
  type LearningEvent,
  type AnticipationResult,
  type UnifiedIntelligenceConfig,
  // Better Than Human types
  type VoiceEmotionState,
  type CrossPersonaContext,
  type PersonaHandoffEvent,
} from './unified-intelligence-layer.js';

// Cognitive tool interpretation
export {
  interpretToolResult,
  type ToolResultContext,
  type CognitiveInterpretation,
} from './cognitive-tool-interpretation.js';

// Tool Merger (Phase 1.1)
export {
  ToolMerger,
  getToolMerger,
  resetToolMerger,
  EquivalenceClassifier,
  getEquivalenceClassifier,
  MergeRegistry,
  getMergeRegistry,
  initializeMergeRegistry,
  type ToolDefinition,
  type ToolCluster,
  type MergeStats,
  type ToolMergerConfig,
} from './merger/index.js';

// Transition Matrix (Phase 1.2)
export {
  TransitionMatrix,
  getTransitionMatrix,
  resetTransitionMatrix,
  TransitionLearner,
  getTransitionLearner,
  TransitionFirestoreSync,
  getTransitionSync,
  initializeTransitionSync,
  type ToolTransition,
  type ToolSequence,
  type TransitionPrediction,
  type TransitionMatrixStats,
} from './transitions/index.js';

// Router Model (Phase 2)
export {
  RouterModel,
  getRouterModel,
  initializeRouterModel,
  predictTools,
  TrainingDataCollector,
  getTrainingDataCollector,
  TrainingDataAugmenter,
  DatasetExporter,
  type RouterInput,
  type RouterOutput,
  type ToolPrediction,
  type RouterModelConfig,
  type TrainingExample,
} from './router/index.js';

// Planning Layer (Phase 3)
export {
  ComplexityClassifier,
  getComplexityClassifier,
  classifyComplexity,
  SequencePredictor,
  getSequencePredictor,
  predictSequence,
  MCTSPlanner,
  getMCTSPlanner,
  planTools,
  ValueEstimator,
  type TaskComplexity,
  type ComplexityResult,
  type ToolSequence as PredictedToolSequence,
  type MCTSPlan,
  type PlanningContext,
} from './planning/index.js';

// Execution Layer (Phase 4.1)
export {
  IntelligentExecutor,
  getIntelligentExecutor,
  initializeIntelligentExecutor,
  ParallelDispatcher,
  ResultAggregator,
  type ExecutionPlan,
  type ExecutionResult,
  type ExecutionStep,
  type StepResult,
  type ToolExecutor,
} from './execution/index.js';

// Learning Layer (Phase 4.2-4.3)
export {
  OutcomeTracker,
  getOutcomeTracker,
  initializeOutcomeTracker,
  ABTestingManager,
  getABTestingManager,
  LearningPipeline,
  getLearningPipeline,
  type ToolOutcome,
  type Experiment,
  type ExperimentResults,
  type PipelineState,
} from './learning/index.js';

// FTIS Integration (Production Bridge)
export {
  FTISIntegration,
  getFTISIntegration,
  initializeFTIS,
  resetFTIS,
  type FTISRoutingRequest,
  type FTISRoutingResult,
  type FTISConfig,
} from './ftis-integration.js';
