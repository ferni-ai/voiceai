/**
 * Unified Intelligence System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This is THE single entry point for all conversation intelligence.
 * No more scattered analysis pipelines - one call, complete understanding.
 *
 * The pipeline:
 * 1. Unified Analysis → Single source of truth for emotion/intent/context
 * 2. Mismatch Detection → "Better than human" voice/text incongruence
 * 3. Humanization → Natural, warm, present responses
 *
 * @module intelligence/unified
 */

// Re-export the unified analysis
export {
  UnifiedAnalyzer,
  analyzeUnified,
  type UnifiedAnalysisInput,
  type UnifiedAnalysisResult,
  type EmotionSignal,
  type IntentSignal,
  type ContextSignal,
  type MismatchSignal,
  type ResponseGuidance,
} from './unified-analyzer.js';

// Re-export the mismatch detector
export {
  VoiceTextMismatchDetector,
  detectMismatch,
  type MismatchResult,
  type MismatchType,
  type MismatchGuidance,
} from './mismatch-detector.js';

// Re-export the humanization orchestrator
export {
  HumanizationOrchestrator,
  humanize,
  type HumanizationInput,
  type HumanizationResult,
  type ActiveListeningCue,
  type EmotionalMirror,
  type SpontaneousElement,
} from './humanization-orchestrator.js';

// Re-export naturalness debug tools
export {
  generateNaturalnessReport,
  type NaturalnessReport,
  type NaturalnessIssue,
} from './naturalness-debug.js';

// Re-export feedback loop (for learning what makes responses natural)
export {
  NaturalnessFeedbackLoop,
  recordResponse,
  recordReaction,
  getEffectivenessReport,
  getRecommendations,
  type ResponseContext,
  type UserReaction,
  type NaturalnessSignal,
  type BuilderEffectiveness,
} from './feedback-loop.js';
