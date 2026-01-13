/**
 * Human Listening Pipeline Module
 *
 * Unified pipeline for human-like listening capabilities.
 *
 * @module human-listening-pipeline
 */
export type { ProsodyFeaturesInput, HumanListeningContext, AudioAnalysis, TextAnalysis, ConversationAnalysis, EmotionalUndercurrent, SsmlSuggestions, HumanListeningResult, QuickAnalysisResult, } from './types.js';
export { HumanListeningPipeline, default } from './pipeline.js';
export { getHumanListeningPipeline, resetHumanListeningPipeline, resetAllHumanListeningPipelines, } from './session-management.js';
export { analyzeAudio, analyzeText, analyzeConversation, resetAllAnalyzers } from './analyzers.js';
export { synthesizeEmotionalUndercurrent, generateOverallAssessment, identifyPrioritySignals, generateAgentGuidance, determineShouldSlowDown, determineShouldGiveSpace, determinePossibleDistress, calculateSsmlSuggestions, calculateOverallConfidence, } from './synthesis.js';
//# sourceMappingURL=index.d.ts.map