/**
 * Better Than Human - Validation Framework
 *
 * Comprehensive system for proving Ferni is actually better than human.
 *
 * @module services/better-than-human-validation
 */

// Types
export * from './types.js';

// Production Telemetry
export {
  initBTHTelemetry,
  shutdownBTHTelemetry,
  trackBTHCapabilityTriggered,
  trackBTHUserResponse,
  trackBTHOutcome,
  getCapabilityTelemetry,
  getAllCapabilityTelemetry,
  getBufferStats,
  cleanupSessionTracking,
  cleanupStaleSessionTracking,
} from './production-telemetry.js';

// Capability Benchmarking (canonical location: superhuman/validation/)
export {
  COMMITMENT_TEST_CASES,
  CRISIS_TEST_CASES,
  READING_BETWEEN_LINES_CASES,
  ALL_TEST_CASES,
  runCapabilityBenchmark,
  runFullBenchmark,
  formatBenchmarkReport,
} from './capability-benchmark.js';

// Re-export from superhuman validation (new canonical split)
export {
  COMMITMENT_TEST_CASES as SuperhumanCommitmentTests,
  CRISIS_TEST_CASES as SuperhumanCrisisTests,
  READING_BETWEEN_LINES_CASES as SuperhumanRBLTests,
} from '../superhuman/validation/index.js';

// Blind Evaluation (Human vs Ferni A/B Testing)
export {
  createBlindEvaluationSession,
  submitBlindEvaluation,
  getScenarioEvaluationResults,
  getCapabilityEvaluationResults,
  getAvailableScenarios,
  cleanupExpiredSessions,
} from './blind-evaluation.js';

// Service Instrumentation (Integration helpers)
export {
  instrumentCommitmentDetection,
  instrumentCommitmentFollowUp,
  instrumentCrisisDetection,
  instrumentSubtextDetection,
  instrumentPatternSurfacing,
  instrumentVoiceBiomarkers,
  instrumentEmotionalVocabulary,
  trackCapabilityOutcome,
  instrumentTurnDetections,
} from './instrumentation.js';

// Baseline Data Extractors (for human comparison)
export {
  // Local extraction (sample data)
  extractCommitments,
  extractEmotionalExamples,
  getStrongCommitmentsOnly,
  getExamplesByEmotion,
  toCommitmentTestCases,
  toEmotionalTestCases,
  runSampleExtraction,
  SAMPLE_CONVERSATIONS,
  type DailyDialogConversation,
  type CommitmentExample,
  type EmotionalExample,
  // HuggingFace dataset downloading
  downloadDailyDialog,
  downloadEmpatheticDialogues,
  processDailyDialogForCommitments,
  processEmpatheticDialoguesForEmotion,
  type DownloadedDataset,
  type DailyDialogRecord,
  type EmpatheticDialogRecord,
} from './baseline-extractors/index.js';
