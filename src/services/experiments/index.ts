/**
 * Experiment Services
 * A/B testing, feature flags, and experiment tracking
 * @module services/experiments
 *
 * NOTE: Due to overlapping exports between modules, import from
 * specific files for best results:
 * - ./integration.js - Main experiment hooks for the agent
 * - ./api.js - Dashboard and experiment management
 * - ./advanced.js - Low-level features (Bayesian, segments, bandits)
 */

// Export integration (main agent hooks)
export {
  cleanupSessionExperiments,
  getBreakthroughQuestions,
  getExperimentPromptModifications,
  getExperimentResults,
  getRunningExperiments,
  initializeSessionExperiments,
  recordAgentQuestion,
  recordEngagementScore,
  startExperiment,
  type BreakthroughQuestion,
  type SessionExperimentState,
} from './integration.js';

// Export API (dashboard)
export {
  EXPERIMENT_TEMPLATES,
  cancelSchedule,
  configureAlerts,
  configureMAB,
  createExperiment,
  getAvailableSegments,
  getBayesianAnalysis,
  getExperiment,
  getExperimentDashboard,
  getSchedules,
  getSegments,
  scheduleExperimentTime,
  startExperimentFromTemplate,
  stopExperiment,
  type CreateExperimentRequest,
  type ExperimentDashboardData,
  type ExperimentSummary,
} from './api.js';

// Export advanced features (explicit selection to avoid conflicts)
export {
  cancelScheduledExperiment,
  configureBandit,
  configureExperimentAlerts,
  getAllSegments,
  getBanditVariant,
  getScheduledExperiments,
  getSegmentAnalysis,
  performBayesianAnalysis,
  recordSegmentMetric,
  registerSegment,
  scheduleExperiment,
  sendExperimentConclusionAlert,
  type BanditConfig,
  type BayesianResult,
  type ExperimentAlertConfig,
  type ExperimentSchedule,
  type SegmentResult,
  type UserProfileForSegment,
  type UserSegment,
} from './advanced.js';

// Export web experiments (landing pages, UI A/B tests)
export {
  analyzeExperiment,
  assignVariant,
  completeWebExperiment,
  createWebExperiment,
  getRunningWebExperiments,
  getWebExperiment,
  getWebExperiments,
  initWebExperiments,
  pauseWebExperiment,
  startWebExperiment,
  trackConversion,
  trackExposure,
  type ExperimentAnalysis,
  type ExperimentEvent,
  type VariantAssignment,
  type WebExperiment,
  type WebExperimentMetrics,
  type WebExperimentVariant,
} from './web-experiments.js';

// Export auto-optimizer (AI-driven optimization)
export {
  getOptimizerStatus,
  getRecentAlerts,
  runOptimizationLoop,
  type AutoOptimizerConfig,
  type OptimizationResult,
  type OptimizerAlert,
  type OptimizerStatus,
  type WinnerDecision,
} from './auto-optimizer.js';

// Export Thompson Sampler (multi-armed bandit)
// Note: BanditConfig is already exported from advanced.js
export {
  calculateRegret,
  disableBandit,
  enableBandit,
  getArmStats,
  getBanditConfig,
  selectVariantWithBandit,
  updateBanditConfig,
  type BanditArm,
  type BanditMetrics,
  type BanditSelection,
} from './thompson-sampler.js';

// Export variant library
export {
  EXPERIMENTS,
  HERO_CTA_VARIANTS,
  HERO_HEADLINE_VARIANTS,
  getAllVariants,
  getControlVariant,
  getCurrentDefault,
  getExperimentDefinitions,
  getVariant,
  getVariantIds,
  getVariantsForFrontend,
  setCurrentDefault,
  type CTAVariant,
  type ExperimentDefinition,
  type HeroVariant,
} from './variant-library.js';

// Export hypothesis generator
export {
  analyzeWinningPatterns,
  generateHypotheses,
  getHypotheses,
  runAnalysis,
  updateHypothesisStatus,
  type ExperimentPattern,
  type GeneratedHypothesis,
  type PatternAnalysisResult,
} from './hypothesis-generator.js';
