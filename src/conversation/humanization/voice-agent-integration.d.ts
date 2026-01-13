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
export { type HumanizationSessionState, type VulnerabilityResult, type TurnGuidance, type ResponseModification, onSessionStart, onSessionEnd, processUserMessage, humanizeResponse, detectVulnerabilitySharing, getEmotionalLeadingGuidance, getAmbientContext, getAmbientAcknowledgment, detectVoiceState, getCrossSessionAcknowledgment, markCrossSessionAcknowledged, getBreathingSyncAdjustments, applyBreathingSync, recordComfortEvent, getConversationPhase, getPhaseBehavior, isBehaviorUnlocked, getAdvancedGuidance, getAdvancedModifications, recordAdvice, recordResponse, shouldStopAdvice, getAdvancedSystemPromptAdditions, createVoiceSnapshot, simulateBreathFromEmotion, getSessionState, getEngineStates, } from './voice-agent-integration/index.js';
//# sourceMappingURL=voice-agent-integration.d.ts.map