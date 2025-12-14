/**
 * Group Coaching Types
 *
 * Type definitions for multi-participant coaching sessions.
 *
 * @module GroupCoachingTypes
 */

// ============================================================================
// SESSION TYPES
// ============================================================================

/**
 * Types of group coaching sessions
 */
export type GroupSessionType = 'family' | 'couple' | 'team' | 'peer_support';

/**
 * Session status
 */
export type GroupSessionStatus = 'waiting' | 'active' | 'paused' | 'ended';

/**
 * Participant roles
 */
export type ParticipantRole = 'host' | 'co-host' | 'participant' | 'observer';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Group session configuration
 */
export interface GroupSessionConfig {
  /** Maximum number of participants */
  maxParticipants: number;

  /** Allow participants to join after session starts */
  allowLateJoin: boolean;

  /** Require host approval to join */
  requireApproval: boolean;

  /** Enable private notes (visible only to individual) */
  enablePrivateNotes: boolean;

  /** Enable shared notes (visible to all) */
  enableSharedNotes: boolean;

  /** Generate individual follow-ups after session */
  followUpEnabled: boolean;

  /** Allow recording */
  recordingEnabled: boolean;
}

// ============================================================================
// PARTICIPANTS
// ============================================================================

/**
 * Group session participant
 */
export interface GroupParticipant {
  userId: string;
  role: ParticipantRole;
  displayName: string;
  joinedAt: Date;
  leftAt?: Date;
  isActive: boolean;
  isMuted: boolean;
  privateNotes?: string[];
}

/**
 * Waiting room entry
 */
export interface WaitingRoomEntry {
  userId: string;
  displayName: string;
  requestedAt: Date;
}

// ============================================================================
// SHARED CONTEXT
// ============================================================================

/**
 * Shared coaching context across all participants
 */
export interface GroupCoachingContext {
  /** Topics discussed in the session */
  topics: Array<{
    topic: string;
    addedBy: string;
    addedAt: Date;
  }>;

  /** Goals agreed upon by the group */
  sharedGoals: Array<{
    goal: string;
    proposedBy: string;
    agreedBy: string[];
    createdAt: Date;
  }>;

  /** Insights surfaced during the session */
  groupInsights: GroupInsight[];

  /** Overall emotional tone of the session */
  emotionalTone: 'tense' | 'neutral' | 'warm' | 'supportive' | 'celebratory';
}

/**
 * Group insight
 */
export interface GroupInsight {
  id: string;
  type: 'pattern' | 'connection' | 'breakthrough' | 'conflict' | 'agreement';
  content: string;
  relatedParticipants?: string[];
  createdAt: Date;
}

// ============================================================================
// SESSION
// ============================================================================

/**
 * Group coaching session
 */
export interface GroupSession {
  id: string;
  type: GroupSessionType;
  hostUserId: string;
  config: GroupSessionConfig;
  participants: GroupParticipant[];
  waitingRoom?: WaitingRoomEntry[];
  status: GroupSessionStatus;
  sharedContext: GroupCoachingContext;
  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;
}

// ============================================================================
// API TYPES
// ============================================================================

/**
 * Request to create a group session
 */
export interface CreateGroupSessionRequest {
  hostUserId: string;
  type: GroupSessionType;
  config?: Partial<GroupSessionConfig>;
}

/**
 * Response for session creation
 */
export interface CreateGroupSessionResponse {
  success: boolean;
  session?: GroupSession;
  joinLink?: string;
  error?: string;
}

/**
 * Request to join a session
 */
export interface JoinGroupSessionRequest {
  sessionId: string;
  userId: string;
  displayName: string;
}

/**
 * Response for join request
 */
export interface JoinGroupSessionResponse {
  success: boolean;
  needsApproval: boolean;
  session?: GroupSession;
  error?: string;
}

// ============================================================================
// EVENTS
// ============================================================================

/**
 * Group session events
 */
export type GroupSessionEvent =
  | { type: 'session_created'; session: GroupSession }
  | { type: 'session_started'; sessionId: string }
  | { type: 'session_ended'; sessionId: string }
  | { type: 'participant_joined'; sessionId: string; participant: GroupParticipant }
  | { type: 'participant_left'; sessionId: string; userId: string }
  | { type: 'join_request'; sessionId: string; userId: string; displayName: string }
  | { type: 'join_approved'; sessionId: string; userId: string }
  | { type: 'join_denied'; sessionId: string; userId: string }
  | { type: 'topic_added'; sessionId: string; topic: string }
  | { type: 'goal_proposed'; sessionId: string; goal: string; proposedBy: string }
  | { type: 'goal_agreed'; sessionId: string; goalIndex: number; userId: string }
  | { type: 'insight_surfaced'; sessionId: string; insight: GroupInsight }
  | { type: 'tone_changed'; sessionId: string; tone: GroupCoachingContext['emotionalTone'] };

/**
 * Event callback
 */
export type GroupSessionEventCallback = (event: GroupSessionEvent) => void;

// ============================================================================
// FOLLOW-UP TYPES
// ============================================================================

/**
 * Individual follow-up after group session
 */
export interface IndividualFollowUp {
  userId: string;
  sessionId: string;
  summary: string;
  personalInsights: string[];
  actionItems: string[];
  nextSteps: string[];
  scheduledCheckIn?: Date;
  generatedAt: Date;
}

/**
 * Group follow-up (shared with all)
 */
export interface GroupFollowUp {
  sessionId: string;
  summary: string;
  sharedInsights: string[];
  agreedActions: string[];
  nextSessionSuggestion?: Date;
  generatedAt: Date;
}

// ============================================================================
// FACILITATION
// ============================================================================

/**
 * Facilitation guidance for Ferni during group sessions
 */
export interface FacilitationGuidance {
  /** Current phase of the session */
  phase: 'opening' | 'exploration' | 'deepening' | 'action_planning' | 'closing';

  /** Suggested prompts */
  suggestedPrompts: string[];

  /** Participants who haven't spoken recently */
  quietParticipants: string[];

  /** Detected dynamics */
  dynamics: Array<{
    type: 'dominance' | 'withdrawal' | 'conflict' | 'alignment';
    involvedParticipants: string[];
    suggestion: string;
  }>;

  /** Time check */
  timeRemaining?: number;
  shouldWrapUp: boolean;
}
