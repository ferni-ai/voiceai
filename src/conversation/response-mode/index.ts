/**
 * Response Mode Intelligence Module
 *
 * > "Better than human = superhuman perception + human-like restraint"
 *
 * Knows when NOT to respond fully—sometimes presence beats performance.
 *
 * ## Usage
 *
 * ```typescript
 * import { getResponseModeDecider } from './conversation/response-mode/index.js';
 *
 * const decider = getResponseModeDecider();
 *
 * // Build context from turn
 * const context = {
 *   userTurnLength: countWords(userMessage),
 *   userTurnIntensity: emotionalIntensity,
 *   wasVenting: decider.detectVenting(userMessage, intensity).isVenting,
 *   wasVulnerable: decider.detectVulnerability(userMessage).isVulnerable,
 *   askedQuestion: decider.detectQuestion(userMessage).hasQuestion,
 *   emotionalState: emotion,
 *   trajectory: 'stable',
 *   turnCount: 5,
 *   sessionMinute: 10,
 *   recentResponseModes: ['full', 'full'],
 *   sentiment: 'negative',
 * };
 *
 * // Get decision
 * const decision = decider.decide(context);
 *
 * if (decision.mode !== 'full') {
 *   // Use brief/presence response instead of full LLM generation
 *   const content = decider.getContentForMode(decision.mode);
 *   if (content) {
 *     await sendToTTS(content.ssml);
 *   }
 * } else {
 *   // Generate full response with LLM
 *   await generateFullResponse();
 * }
 * ```
 *
 * @module @ferni/conversation/response-mode
 */

// Types
export type {
  ResponseMode,
  ResponseModeContext,
  ResponseModeDecision,
  IResponseModeDecider,
  VentingDetectionResult,
  VulnerabilityDetectionResult,
  QuestionDetectionResult,
  ResponseModeRule,
} from './types.js';

export { ResponseModeToken } from './types.js';

// Constants
export {
  MODE_CONTENT,
  MODE_CONTENT_PLAIN,
  RESPONSE_MODE_RULES,
  VENTING_PATTERNS,
  VULNERABILITY_PATTERNS,
  QUESTION_PATTERNS,
  THRESHOLDS,
} from './constants.js';

// Engine
export {
  ResponseModeDecider,
  getResponseModeDecider,
  createResponseModeDecider,
  resetResponseModeDecider,
} from './engine.js';
