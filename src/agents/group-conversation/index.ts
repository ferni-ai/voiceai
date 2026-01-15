/**
 * Group Conversation Module
 *
 * Enables multi-participant conversations with Ferni:
 * - Team Roundtable: Multiple Ferni personas active simultaneously
 * - Conference Call: External people via phone join the conversation
 * - Hybrid: Both agents and external people together
 *
 * @example Team Roundtable
 * ```typescript
 * import { createTeamRoundtable, RoundtableConfig } from './group-conversation';
 *
 * const { roundtable, cleanup } = await createTeamRoundtable({
 *   ctx,
 *   room,
 *   userParticipant,
 *   sessionId,
 *   userId,
 *   roundtable: {
 *     personas: ['ferni', 'peter-john', 'maya-habits'],
 *     topic: 'Career planning',
 *     collaborationMode: 'discussion',
 *     moderator: 'ferni',
 *   },
 *   createAgent: async (personaId, context) => { ... },
 * });
 * ```
 *
 * @example Conference Call
 * ```typescript
 * import { createConferenceCallManager } from './group-conversation';
 *
 * const conferenceCall = createConferenceCallManager({
 *   room,
 *   sessionId,
 *   userId,
 *   webhookBaseUrl: 'https://api.ferni.ai',
 * });
 *
 * await conferenceCall.addParticipant({
 *   phoneNumber: '+15551234567',
 *   name: 'Sarah',
 *   relationship: 'partner',
 *   announceToRoom: true,
 * });
 * ```
 *
 * @module agents/group-conversation
 */

// =============================================================================
// TYPES
// =============================================================================

export type {
  // Participant types
  ParticipantType,
  ParticipantRole,
  SpeakingState,
  ParticipantConnection,
  GroupParticipant,
  // Conversation types
  ConversationMode,
  CollaborationMode,
  GroupConversation,
  // Turn-taking types
  TurnTakingStrategy,
  TurnTakingConfig,
  TurnState,
  // Transcript types
  AttributedUtterance,
  GroupConversationSummary,
  // Agent protocol types
  AgentMessage,
  GroupAgentConfig,
  // Conference call types
  AddParticipantRequest,
  AddParticipantResult,
  ConferenceCallState,
  // Roundtable types
  RoundtableConfig,
  RoundtableState,
  // Event types
  GroupConversationEvent,
} from './types.js';

// =============================================================================
// TURN-TAKING
// =============================================================================

export {
  TurnTakingEngine,
  createTurnTakingEngine,
  DEFAULT_TURN_TAKING_CONFIG,
} from './turn-taking.js';

// =============================================================================
// PARTICIPANT REGISTRY
// =============================================================================

export {
  ParticipantRegistry,
  createParticipantRegistry,
  createUserParticipant,
  createAgentParticipant,
  createExternalParticipant,
} from './participant-registry.js';

// =============================================================================
// GROUP CONVERSATION MANAGER
// =============================================================================

export {
  GroupConversationManager,
  createGroupConversation,
  type GroupConversationConfig,
  type GroupConversationManagerResult,
} from './group-conversation-manager.js';

// =============================================================================
// TEAM ROUNDTABLE
// =============================================================================

export {
  TeamRoundtable,
  createTeamRoundtable,
  type TeamRoundtableConfig,
  type TeamRoundtableResult,
  type RoundtableAgent,
  type ResponseContext,
  type AgentCreationContext,
} from './team-roundtable.js';

// =============================================================================
// CONFERENCE CALL
// =============================================================================

export {
  ConferenceCallManager,
  createConferenceCallManager,
  generateAnswerTwiml,
  type ConferenceCallConfig,
  type ConferenceCallResult,
  type ExternalParticipantInfo,
} from './conference-call-manager.js';

// =============================================================================
// TRANSCRIPT SERVICE
// =============================================================================

export {
  AttributedTranscriptService,
  createTranscriptService,
  type TranscriptServiceConfig,
  type TranscriptExport,
  type ActionItem,
  type KeyMoment,
} from './transcript-service.js';
