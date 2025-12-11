/**
 * Human Listening Pipeline Module
 *
 * Unified pipeline for human-like listening capabilities.
 *
 * @module human-listening-pipeline
 */

// ============================================================================
// TYPES
// ============================================================================

export type {
  ProsodyFeaturesInput,
  HumanListeningContext,
  AudioAnalysis,
  TextAnalysis,
  ConversationAnalysis,
  EmotionalUndercurrent,
  SsmlSuggestions,
  HumanListeningResult,
  QuickAnalysisResult,
} from './types.js';

// ============================================================================
// MAIN PIPELINE
// ============================================================================

export { HumanListeningPipeline, default } from './pipeline.js';

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

export {
  getHumanListeningPipeline,
  resetHumanListeningPipeline,
  resetAllHumanListeningPipelines,
  getActivePipelineCount,
  getActivePipelineSessions,
} from './session-management.js';

// ============================================================================
// ANALYZERS (for advanced usage)
// ============================================================================

export { analyzeAudio, analyzeText, analyzeConversation, resetAllAnalyzers } from './analyzers.js';

// ============================================================================
// SYNTHESIS (for advanced usage)
// ============================================================================

export {
  synthesizeEmotionalUndercurrent,
  generateOverallAssessment,
  identifyPrioritySignals,
  generateAgentGuidance,
  determineShouldSlowDown,
  determineShouldGiveSpace,
  determinePossibleDistress,
  calculateSsmlSuggestions,
  calculateOverallConfidence,
} from './synthesis.js';
