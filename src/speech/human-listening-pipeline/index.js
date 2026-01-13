/**
 * Human Listening Pipeline Module
 *
 * Unified pipeline for human-like listening capabilities.
 *
 * @module human-listening-pipeline
 */
// ============================================================================
// MAIN PIPELINE
// ============================================================================
export { HumanListeningPipeline, default } from './pipeline.js';
// ============================================================================
// SESSION MANAGEMENT
// ============================================================================
export { getHumanListeningPipeline, resetHumanListeningPipeline, resetAllHumanListeningPipelines, } from './session-management.js';
// ============================================================================
// ANALYZERS (for advanced usage)
// ============================================================================
export { analyzeAudio, analyzeText, analyzeConversation, resetAllAnalyzers } from './analyzers.js';
// ============================================================================
// SYNTHESIS (for advanced usage)
// ============================================================================
export { synthesizeEmotionalUndercurrent, generateOverallAssessment, identifyPrioritySignals, generateAgentGuidance, determineShouldSlowDown, determineShouldGiveSpace, determinePossibleDistress, calculateSsmlSuggestions, calculateOverallConfidence, } from './synthesis.js';
//# sourceMappingURL=index.js.map