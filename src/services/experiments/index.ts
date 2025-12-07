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
  initializeSessionExperiments,
  cleanupSessionExperiments,
  recordEngagementScore,
  recordAgentQuestion,
  getBreakthroughQuestions,
  getExperimentPromptModifications,
  startExperiment,
  getRunningExperiments,
  getExperimentResults,
  type BreakthroughQuestion,
  type SessionExperimentState,
} from './integration.js';

// Export API (dashboard)
export {
  getExperimentDashboard,
  getExperiment,
  createExperiment,
  stopExperiment,
  startExperimentFromTemplate,
  EXPERIMENT_TEMPLATES,
  configureAlerts,
  configureMAB,
  scheduleExperimentTime,
  cancelSchedule,
  getSchedules,
  getSegments,
  getBayesianAnalysis,
  getAvailableSegments,
  type ExperimentSummary,
  type ExperimentDashboardData,
  type CreateExperimentRequest,
} from './api.js';

// Export advanced features (explicit selection to avoid conflicts)
export {
  performBayesianAnalysis,
  getSegmentAnalysis,
  configureExperimentAlerts,
  configureBandit,
  getBanditVariant,
  scheduleExperiment,
  cancelScheduledExperiment,
  getScheduledExperiments,
  getAllSegments,
  registerSegment,
  recordSegmentMetric,
  sendExperimentConclusionAlert,
  type UserSegment,
  type UserProfileForSegment,
  type BayesianResult,
  type SegmentResult,
  type ExperimentAlertConfig,
  type BanditConfig,
  type ExperimentSchedule,
} from './advanced.js';
