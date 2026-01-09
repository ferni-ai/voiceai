/**
 * State Management Module
 *
 * Manages session and conversation state for the intelligence layer.
 *
 * @module intelligence/state
 */

// Session State
export {
  // Core
  SessionStateManager,
  getSessionState,
  setCustomState,
  getCustomState,
  incrementTurnCount,
  recordKeyMoment,
  // Voice emotion
  updateVoiceEmotion,
  // Emotional trajectory
  updateEmotionalTrajectory,
  // Cognitive load
  updateCognitiveLoad,
  // Cognitive reasoning
  getCognitiveState,
  addReasoningApproach,
  addUserMessageForStyleDetection,
  updateUserCognitiveStyle,
  setActiveReasoningChain,
  getActiveReasoningChain,
  // Memory tracking
  markMemoryReferenced,
  wasMemoryReferenced,
  // Quirks and habits
  markQuirkUsed,
  wasQuirkUsed,
  markHabitUsed,
  wasHabitUsed,
  // Insight tracking
  markInsightShared,
  wasInsightShared,
  isInsightOnCooldown,
  // Lovable presence
  getLovableState,
  updateLovableState,
  // Session flow
  getSessionFlowState,
  updateSessionFlowState,
  // Types
  type VoiceEmotionState,
  type EmotionalTrajectory,
  type PatternState,
  type PatternData,
  type IntentionData,
  type ActionData,
  type CognitiveLoadState,
  type ConversationFlowState,
  type SessionState,
  type CognitiveReasoningState,
  type LovablePresenceState,
  type SessionFlowTrackingState,
} from './session.js';

// Conversation State Machine
export {
  ConversationStateMachine,
  getStateMachine,
  resetStateMachine,
  type ConversationPhase,
  type ConversationState,
  type PhaseGuidance,
} from './conversation.js';
