/**
 * Voice Agent Humanization Integration
 *
 * Clean architecture refactoring of the voice-agent-integration module.
 *
 * @module @ferni/humanization/voice-agent-integration
 */
// Session lifecycle
export { onSessionStart, onSessionEnd } from './session-lifecycle.js';
// Message processing
export { processUserMessage, humanizeResponse } from './message-processing.js';
// Vulnerability detection
export { detectVulnerabilitySharing } from './vulnerability-detection.js';
// Engine access
export { getEmotionalLeadingGuidance, getAmbientContext, getAmbientAcknowledgment, detectVoiceState, getCrossSessionAcknowledgment, markCrossSessionAcknowledged, getBreathingSyncAdjustments, applyBreathingSync, } from './engines.js';
// Comfort tracking
export { recordComfortEvent, getConversationPhase, getPhaseBehavior, isBehaviorUnlocked, } from './comfort-tracking.js';
// Advanced humanization
export { getAdvancedGuidance, getAdvancedModifications, recordAdvice, recordResponse, shouldStopAdvice, getAdvancedSystemPromptAdditions, } from './advanced-humanization.js';
// Utilities
export { createVoiceSnapshot, simulateBreathFromEmotion, getSessionState, getEngineStates, } from './utils.js';
//# sourceMappingURL=index.js.map