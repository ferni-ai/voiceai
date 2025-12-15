/**
 * Unified Anticipation Module
 *
 * Combines intent prediction and emotional prosody anticipation for
 * responsive, natural agent behavior.
 *
 * @example
 * ```typescript
 * import {
 *   getAnticipationPipeline,
 *   resetAnticipationPipeline,
 * } from './anticipation/index.js';
 *
 * // Get pipeline for session
 * const pipeline = getAnticipationPipeline(sessionId);
 *
 * // Process during user speech
 * const result = pipeline.process({
 *   sessionId,
 *   partialTranscript: 'I just got promoted at...',
 *   isSpeaking: true,
 * });
 *
 * // Check if actionable
 * if (result?.isActionable) {
 *   const prosody = result.prosody;
 *   // Use prosody.speedMultiplier, prosody.emotion, etc.
 * }
 *
 * // Get micro-reaction for response start
 * if (pipeline.shouldUseMicroReaction()) {
 *   const ssml = pipeline.getLatest()?.prosody.microReactionSsml;
 *   // Prepend to response
 * }
 *
 * // Clean up when session ends
 * resetAnticipationPipeline(sessionId);
 * ```
 *
 * @module speech/anticipation
 */

// Types
export type {
  AnticipationContext,
  AnticipationOptions,
  AnticipationResult,
  EmotionalPrediction,
  EmotionalTrajectory,
  IntentCategory,
  IntentPrediction,
} from './types.js';

export { DEFAULT_ANTICIPATION_OPTIONS } from './types.js';

// Predictors (for advanced use)
export { IntentPredictor } from './intent-predictor.js';
export { EmotionPredictor } from './emotion-predictor.js';

// Pipeline (main API)
export {
  AnticipationPipeline,
  getActiveAnticipationPipelineCount,
  getAnticipationPipeline,
  resetAllAnticipationPipelines,
  resetAnticipationPipeline,
} from './pipeline.js';

