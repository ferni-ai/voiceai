/**
 * Experiments Module
 *
 * General-purpose A/B testing, multi-armed bandits, and auto-escalating rollouts.
 * Provides data-driven decision making for feature rollouts and optimization.
 *
 * @module tools/experiments
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

// A/B testing (general-purpose exports only)
export {
  ABTestingManager,
  getABTestingManager,
  resetABTestingManager,
  type Experiment,
  type Variant,
  type VariantMetrics,
  type ExperimentResults,
} from './ab-testing.js';

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
