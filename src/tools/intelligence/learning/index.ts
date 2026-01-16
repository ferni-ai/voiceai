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
  type ToolOutcome,
  type AggregatedMetrics,
  type TrackerConfig,
} from './outcome-tracker.js';

// A/B testing
export {
  ABTestingManager,
  getABTestingManager,
  resetABTestingManager,
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
  type PromotionDecision,
} from './learning-pipeline.js';
