/**
 * Voice Agent Humanization Integration
 *
 * ⚠️ This file has been refactored for clean architecture.
 * The implementation is now in the voice-agent-integration/ directory.
 *
 * This file re-exports everything for backward compatibility.
 *
 * @see voice-agent-integration/index.ts for the new module structure
 * @module @ferni/humanization/voice-agent-integration
 */
// Re-export everything from the new module
export { 
// Session lifecycle
onSessionStart, onSessionEnd, 
// Message processing
processUserMessage, humanizeResponse, 
// Vulnerability detection
detectVulnerabilitySharing, 
// Engine access
getEmotionalLeadingGuidance, getAmbientContext, getAmbientAcknowledgment, detectVoiceState, getCrossSessionAcknowledgment, markCrossSessionAcknowledged, getBreathingSyncAdjustments, applyBreathingSync, 
// Comfort tracking
recordComfortEvent, getConversationPhase, getPhaseBehavior, isBehaviorUnlocked, 
// Advanced humanization
getAdvancedGuidance, getAdvancedModifications, recordAdvice, recordResponse, shouldStopAdvice, getAdvancedSystemPromptAdditions, 
// Utilities
createVoiceSnapshot, simulateBreathFromEmotion, getSessionState, getEngineStates, } from './voice-agent-integration/index.js';
//# sourceMappingURL=voice-agent-integration.js.map