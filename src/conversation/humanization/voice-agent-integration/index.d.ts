/**
 * Voice Agent Humanization Integration
 *
 * Clean architecture refactoring of the voice-agent-integration module.
 *
 * @module @ferni/humanization/voice-agent-integration
 */
export type { HumanizationSessionState, VulnerabilityResult, TurnGuidance, ResponseModification, } from './types.js';
export { onSessionStart, onSessionEnd } from './session-lifecycle.js';
export { processUserMessage, humanizeResponse } from './message-processing.js';
export { detectVulnerabilitySharing } from './vulnerability-detection.js';
export { getEmotionalLeadingGuidance, getAmbientContext, getAmbientAcknowledgment, detectVoiceState, getCrossSessionAcknowledgment, markCrossSessionAcknowledged, getBreathingSyncAdjustments, applyBreathingSync, } from './engines.js';
export { recordComfortEvent, getConversationPhase, getPhaseBehavior, isBehaviorUnlocked, } from './comfort-tracking.js';
export { getAdvancedGuidance, getAdvancedModifications, recordAdvice, recordResponse, shouldStopAdvice, getAdvancedSystemPromptAdditions, } from './advanced-humanization.js';
export { createVoiceSnapshot, simulateBreathFromEmotion, getSessionState, getEngineStates, } from './utils.js';
//# sourceMappingURL=index.d.ts.map