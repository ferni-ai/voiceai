/**
 * Speech Orchestrator Module
 *
 * Central coordination for all speech humanization.
 *
 * @example
 * ```typescript
 * import { getOrchestrator } from './orchestrator/index.js';
 *
 * const orchestrator = getOrchestrator(sessionId, 'ferni');
 * await orchestrator.initialize();
 *
 * // Humanize a response
 * const result = await orchestrator.humanize(text, { topicWeight: 'medium' });
 * console.log(result.ssml);
 *
 * // Analyze user speech
 * const analysis = await orchestrator.analyze({ text: userText });
 * if (analysis.agentGuidance.shouldSlowDown) {
 *   // Adjust response
 * }
 *
 * // Get backchanneling decision
 * const backchannel = orchestrator.getBackchannel({
 *   sessionId,
 *   personaId: 'ferni',
 *   userSpeechDuration: 5000,
 *   currentPauseDuration: 800,
 *   userEmotion,
 *   topicWeight: 'medium',
 *   turnNumber: 3,
 * });
 * ```
 *
 * @module speech/orchestrator
 */

// Types
export type {
  AnticipatedResult,
  AnticipationContext,
  BackchannelRequest,
  BackchannelResponse,
  HumanizationOptions,
  HumanizedResponse,
  ListeningAnalysisOptions,
  ListeningAnalysisResult,
  SpeechOrchestratorContext,
} from './types.js';

// Orchestrator
export {
  SpeechOrchestrator,
  getActiveOrchestratorCount,
  getOrchestrator,
  resetAllOrchestrators,
  resetOrchestrator,
} from './orchestrator.js';
