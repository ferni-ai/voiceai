/**
 * Learning Module
 *
 * Continuous learning and improvement for tool intelligence.
 *
 * @module tools/intelligence/learning
 */

// Outcome tracker
export {
  OutcomeTracker,
  getOutcomeTracker,
  initializeOutcomeTracker,
  resetOutcomeTracker,
  isTrainingDataCollectionEnabled,
  type ToolOutcome,
  type AggregatedMetrics,
  type TrackerConfig,
} from './outcome-tracker.js';

// A/B testing
export {
  ABTestingManager,
  getABTestingManager,
  resetABTestingManager,
  initializeFTISExperiment,
  updateFTISExperimentTraffic,
  shouldUseFTIS,
  isFTISPrimary,
  type Experiment,
  type Variant,
  type VariantMetrics,
  type ExperimentResults,
} from './ab-testing.js';

// Learning pipeline
export {
  LearningPipeline,
  getLearningPipeline,
  resetLearningPipeline,
  type LearningPipelineConfig,
  type PipelineState,
  type RetrainResult,
  type PromotionDecision as LearningPromotionDecision,
} from './learning-pipeline.js';

// Auto-escalating rollout
export {
  AutoRolloutManager,
  getAutoRolloutManager,
  removeAutoRolloutManager,
  getAllAutoRolloutManagers,
  resetAutoRolloutManagers,
  DEFAULT_STAGES,
  type RolloutStage,
  type AutoRolloutConfig,
  type RolloutStatus,
} from './auto-rollout.js';

// Multi-armed bandit (Thompson Sampling)
export {
  MultiArmedBandit,
  getMultiArmedBandit,
  removeMultiArmedBandit,
  getAllBandits,
  resetAllBandits,
  type BanditVariant,
  type BanditConfig,
  type BanditSelection,
  type BanditStats,
} from './bandit.js';

// Sequential testing (SPRT)
export {
  SequentialTestTracker,
  getSequentialTestTracker,
  removeSequentialTestTracker,
  getAllSequentialTestTrackers,
  resetAllSequentialTestTrackers,
  calculateBoundaries,
  checkSequentialTest,
  type SequentialTestConfig,
  type SequentialDecision,
  type SequentialTestResult,
  type SPRTState,
} from './sequential-test.js';

// Autonomous experiment manager
export {
  ExperimentManager,
  getExperimentManager,
  resetExperimentManager,
  type ExperimentType,
  type ExperimentConfig,
  type ManagedExperiment,
  type ExperimentHealth,
  type PromotionDecision,
  type RollbackDecision,
} from './experiment-manager.js';

// FTIS V3 Feedback Loop (continuous learning)
export {
  FTISFeedbackLoop,
  getFTISFeedbackLoop,
  initializeFTISFeedbackLoop,
  resetFTISFeedbackLoop,
  type FeedbackSignal,
  type MinedNegative,
  type FeedbackLoopConfig,
} from './ftis-feedback-loop.js';
