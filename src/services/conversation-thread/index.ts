/**
 * Conversation Thread System
 *
 * Unified system for managing bidirectional agent engagement.
 * Conversations can flow in either direction (agent → user or user → agent)
 * and across multiple channels (voice, SMS, push, email, in-app).
 *
 * ## Architecture
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                    CONVERSATION THREAD SYSTEM                           │
 * │                                                                         │
 * │  User ◄──────────────────────────────────────────────────────────► Agent│
 * │                                                                         │
 * │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                 │
 * │  │   Inbound   │    │   Thread    │    │  Outbound   │                 │
 * │  │   Router    │───►│   Manager   │◄───│  Initiator  │                 │
 * │  └─────────────┘    └─────────────┘    └─────────────┘                 │
 * │        ▲                   │                   ▲                        │
 * │        │                   ▼                   │                        │
 * │  ┌─────────────────────────────────────────────────────────────┐       │
 * │  │                    CHANNELS                                  │       │
 * │  │   Voice  │   SMS   │   Push   │   Email   │   In-App        │       │
 * │  └─────────────────────────────────────────────────────────────┘       │
 * └─────────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Usage
 *
 * ### Inbound (User → Agent)
 *
 * ```typescript
 * import { inboundRouter } from './conversation-thread';
 *
 * // When SMS reply comes in
 * const result = await inboundRouter.handleInboundSMS(userId, phone, body);
 * // result.routeDecision.agentId = which agent should respond
 *
 * // When user starts voice call
 * const route = await inboundRouter.handleVoiceCallStart(userId, { fromNotification: true });
 * // route.agentId = which agent should handle the call
 * ```
 *
 * ### Outbound (Agent → User)
 *
 * ```typescript
 * import { outboundInitiator } from './conversation-thread';
 *
 * // Maya sends habit support
 * await outboundInitiator.mayaHabitOutreach(userId, {
 *   habitName: 'meditation',
 *   streakCount: 7,
 *   isEncouragement: true,
 * });
 *
 * // Peter sends research update
 * await outboundInitiator.peterResearchOutreach(userId, {
 *   topic: 'compound interest',
 *   insightSummary: 'Starting 5 years earlier doubles your retirement fund',
 * });
 *
 * // Any agent sends custom outreach
 * await outboundInitiator.initiateOutreach({
 *   userId,
 *   agentId: 'ferni',
 *   preferredChannel: 'sms',
 *   triggerType: 'thinking_of_you',
 *   reason: 'Detected user might be stressed',
 *   messageContent: 'Just wanted to check in. How are you?',
 * });
 * ```
 *
 * ### Thread Context (for LLM injection)
 *
 * ```typescript
 * import { threadManager } from './conversation-thread';
 *
 * // When agent joins/continues a conversation
 * const context = await threadManager.buildAgentContext(threadId, agentId, {
 *   userInitiated: true,
 * });
 * // context.llmContext = formatted string for system prompt injection
 * ```
 *
 * ### Group Outreach (Team Roundtables)
 *
 * ```typescript
 * import { groupOutreach } from './conversation-thread';
 *
 * // Maya and Jordan collaborate on trip planning
 * await groupOutreach.mayaJordanPlanningOutreach(userId, {
 *   eventName: 'Hawaii trip',
 *   preferredName: 'Sarah',
 * });
 *
 * // Full team support for someone going through a tough time
 * await groupOutreach.fullTeamSupportOutreach(userId, {
 *   situation: 'job transition',
 *   preferredName: 'Mike',
 * });
 *
 * // Initiate a team roundtable voice call
 * await groupOutreach.initiateTeamRoundtableCall(userId, {
 *   personas: ['ferni', 'peter-john', 'maya-santos'],
 *   topic: 'Career planning brainstorm',
 *   reason: 'User expressed interest in career change',
 * });
 * ```
 *
 * @module services/conversation-thread
 */

// ============================================================================
// EXPORTS
// ============================================================================

export { inboundRouter } from './inbound-router.js';
export { outboundInitiator } from './outbound-initiator.js';
export { threadManager } from './thread-manager.js';
export { threadPersistence } from './thread-persistence.js';
export { threadRecorder } from './thread-recorder.js';
export type * from './types.js';

// Re-export individual functions for convenience
export {
  addMessage,
  buildAgentContext,
  getActiveThread,
  getMessages,
  getOrCreateThread,
  getThread,
  transferOwnership,
  updateEmotionalContext,
  updateThreadStatus,
  updateThreadTopics,
} from './thread-manager.js';

export {
  handleInboundSMS,
  handlePushTap,
  handleVoiceCallStart,
  routeInbound,
} from './inbound-router.js';

export {
  alexCommunicationOutreach,
  ferniCheckInOutreach,
  initiateOutreach,
  jordanMilestoneOutreach,
  mayaHabitOutreach,
  nayanWisdomOutreach,
  peterResearchOutreach,
} from './outbound-initiator.js';

export {
  cleanupThreadRecording,
  getSessionThreadId,
  initializeThreadRecording,
  recordAgentMessage,
  recordEmotionalContext,
  recordUserMessage,
} from './thread-recorder.js';

// Thread Persistence (Firestore)
export {
  closeThread,
  deleteOldThreads,
  loadActiveThread,
  loadMessages,
  loadRecentThreads,
  loadThread,
  saveMessage,
  saveThread,
} from './thread-persistence.js';

// Group Outreach (Team Roundtables)
export {
  fullTeamSupportOutreach,
  generateGroupCallIntroductions,
  groupOutreach,
  initiateGroupOutreach,
  initiateTeamRoundtableCall,
  mayaJordanPlanningOutreach,
  peterFerniInsightOutreach,
  teamCelebrationOutreach,
  type GroupOutreachOptions,
  type GroupOutreachResult,
  type RoundtableSetupConfig,
} from './group-outreach.js';

// Group Outreach Triggers (Superhuman Service Integration)
export {
  GROUP_OUTREACH_TRIGGER_TYPES,
  GROUP_TOPICS,
  onCommitmentMilestone,
  onEmotionalDistress,
  onPredictivePattern,
  onReconnectionOpportunity,
  shouldTriggerGroupOutreach,
  triggerGroupOutreach,
  type GroupOutreachDecision,
} from './group-outreach-triggers.js';

// Superhuman Outreach Intelligence (The Brain)
export {
  OUTREACH_RULES,
  accumulateSignal,
  getAccumulatedSignals,
  getOptimalOutreachTime,
  integrateWithSemanticIntelligence,
  processAccumulatedSignals,
  processSuperhumanSignals,
  signalFromBlindSpot,
  signalFromBoundary,
  signalFromCalendarDensity,
  signalFromCalendarPrep,
  // Crisis & Core Signal Generators
  signalFromCapacity,
  signalFromConflict,
  signalFromContradiction,
  // Semantic Intelligence V3 Signal Generators
  signalFromCorrelation,
  signalFromCounterfactual,
  signalFromCrisis,
  signalFromCrossSessionThread,
  signalFromDreamReignition,
  signalFromEmotionalTrajectory,
  signalFromEnergyWave,
  signalFromFinancial,
  signalFromFutureTrajectory,
  signalFromGoalAchieved,
  signalFromGrowth,
  // Domain Signal Generators
  signalFromHabit,
  signalFromInsideJoke,
  // Better Than Human V1 Signal Generators
  signalFromLifeChapter,
  signalFromMilestone,
  signalFromMoodPrediction,
  signalFromOpenLoop,
  signalFromPrediction,
  signalFromReceptivity,
  signalFromReconnection,
  signalFromRecovery,
  signalFromRelationalTension,
  signalFromSeasonalDate,
  signalFromSeasonalPattern,
  signalFromSilence,
  signalFromSleep,
  signalFromSocialBattery,
  signalFromStreak,
  signalFromTask,
  signalFromTemporalAnomaly,
  signalFromVagueEmotion,
  signalFromValuesConflict,
  // Better Than Human V2 Signal Generators
  signalFromVoiceBiomarkers,
  signalFromVoiceDistress,
  // Types
  type SignalType,
  type SuperhumanSignal,
} from './superhuman-outreach-intelligence.js';
