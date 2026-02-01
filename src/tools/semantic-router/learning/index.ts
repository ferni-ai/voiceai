/**
 * Learning System - Active Learning for Semantic Router
 *
 * Two learning layers:
 * 1. Individual - Per-user corrections and preferences
 * 2. Community - Aggregated patterns from all users (privacy-preserving)
 *
 * @module tools/semantic-router/learning
 */

// Individual user learning
export {
  recordCorrection,
  recordImplicitCorrection,
  recordToolUsage,
  getCorrections,
  getUserPreferences,
  getToolBoostForUser,
  getCorrectionAnalytics,
  initializeCorrectionStore,
  type RoutingCorrection,
  type UserPreferences,
  type CorrectionAnalytics,
} from './correction-store.js';

// Community learning (aggregated, privacy-preserving)
export {
  initializeCommunityLearning,
  reportCorrectionToCommunity,
  getCommunityPatternsForQuery,
  getCommunityCorrection,
  getActivePatterns,
  getPatternStats,
  applyCommunityLearning,
  type CommunityPattern,
} from './community-learning.js';

// 🧠 SOTA: Online Learning Loop - Retrain embeddings from corrections
export {
  OnlineLearningEngine,
  getOnlineLearningEngine,
  initializeOnlineLearning,
  shutdownOnlineLearning,
  type LearningExample,
  type ToolEmbeddingAdjustment,
  type RetrainingStats,
} from './online-learning-loop.js';

// 🎯 SOTA: Dynamic Strategy Selection - Per-user optimal cascade
export {
  DynamicStrategyEngine,
  getDynamicStrategyEngine,
  initializeDynamicStrategy,
  shutdownDynamicStrategy,
  STRATEGY_CONFIGS,
  type RoutingStrategy,
  type StrategyConfig,
  type StrategyOutcome,
  type StrategySelection,
  type UserStrategyProfile,
  type UserType,
  type DynamicStrategyConfig,
} from './dynamic-strategy.js';

// 👥 SOTA: User Segmentation - Cohort-based learning
export {
  UserSegmentationEngine,
  getUserSegmentationEngine,
  initializeUserSegmentation,
  shutdownUserSegmentation,
  type BehaviorFingerprint,
  type UserCohort,
  type UserCohortAssignment,
  type InteractionEvent,
  type UserSegmentationConfig,
} from './user-segmentation.js';

// 🔄 Phase 3: Implicit Correction Capture - Learning loop closure
export {
  recordRoutingPrediction,
  recordActualToolExecution,
  getCorrectionMetrics,
  resetMetrics as resetCorrectionCaptureMetrics,
  type RoutingPrediction,
} from './implicit-correction-capture.js';

// 🚀 Phase 6: Automated Retraining Pipeline - Safe continuous improvement
export {
  RetrainingPipeline,
  getRetrainingPipeline,
  initializeRetrainingPipeline,
  handleScheduledRetraining,
  handleVolumeBasedRetraining,
  handleQualityBasedRetraining,
  type RetrainingConfig,
  type RetrainingResult,
  type PipelineStatus,
} from './retraining-pipeline.js';
