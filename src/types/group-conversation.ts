/**
 * Group Conversation Types
 *
 * Core type definitions for multi-participant conversations.
 * Supports both Team Roundtable (multiple agents) and Conference Call (external people) modes.
 *
 * ARCHITECTURE: Level 10 (types/) - can be imported by any layer
 *
 * @module types/group-conversation
 */

// ============================================================================
// PARTICIPANT TYPES
// ============================================================================

/**
 * Type of participant in a group conversation
 */
export type ParticipantType = 'human' | 'agent' | 'external';

/**
 * Role a participant plays in the conversation
 */
export type ParticipantRole =
  | 'initiator' // Started the conversation (the user)
  | 'moderator' // Guides the conversation (usually Ferni)
  | 'expert' // Contributes specialized knowledge (other agents)
  | 'participant' // Active participant (external people)
  | 'observer'; // Listening but not speaking

/**
 * Current speaking state
 */
export type SpeakingState = 'silent' | 'speaking' | 'listening';

/**
 * Connection type for a participant
 */
export type ParticipantConnection =
  | { type: 'webrtc'; identity: string } // User in browser
  | { type: 'agent'; personaId: string } // Ferni team member
  | { type: 'sip'; phoneNumber: string; callSid: string }; // External via phone

/**
 * A participant in a group conversation
 */
export interface GroupParticipant {
  /** Unique ID within this room */
  id: string;

  /** Display name */
  name: string;

  /** Type of participant */
  type: ParticipantType;

  /** How they're connected */
  connection: ParticipantConnection;

  /** Role in this conversation */
  role: ParticipantRole;

  /** Current speaking state */
  speakingState: SpeakingState;

  /** When they joined */
  joinedAt: Date;

  /** When they left (if applicable) */
  leftAt?: Date;

  /** Relationship to initiator (for external participants) */
  relationship?: string;

  /** Metadata about this participant */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// CONVERSATION TYPES
// ============================================================================

/**
 * Mode of group conversation
 */
export type ConversationMode =
  | 'team_roundtable' // Multiple agents active
  | 'conference_call' // External people via phone
  | 'hybrid'; // Both agents and external people

/**
 * How agents should collaborate
 */
export type CollaborationMode =
  | 'discussion' // Free-flowing team discussion
  | 'consultation' // User asks, agents each respond
  | 'debate' // Agents can disagree/discuss
  | 'parallel_work'; // Agents work on different aspects

/**
 * A group conversation session
 */
export interface GroupConversation {
  /** Room identifier */
  roomId: string;

  /** Session ID for logging/analytics */
  sessionId: string;

  /** Conversation mode */
  mode: ConversationMode;

  /** All participants */
  participants: Map<string, GroupParticipant>;

  /** Who initiated the group */
  initiatorId: string;

  /** Optional topic/purpose */
  topic?: string;

  /** Turn-taking configuration */
  turnTaking: TurnTakingConfig;

  /** Transcript with speaker attribution */
  transcript: AttributedUtterance[];

  /** When the conversation started */
  startedAt: Date;

  /** When it ended (if applicable) */
  endedAt?: Date;
}

// ============================================================================
// TURN-TAKING TYPES
// ============================================================================

/**
 * Strategy for deciding who speaks next
 */
export type TurnTakingStrategy =
  | 'round_robin' // Each participant gets a turn
  | 'raise_hand' // Participants request to speak
  | 'intelligent' // AI decides based on relevance
  | 'free_form'; // No coordination (risky!)

/**
 * Configuration for turn-taking behavior
 */
export interface TurnTakingConfig {
  /** Strategy for deciding who speaks */
  strategy: TurnTakingStrategy;

  /** Minimum silence before agent can speak (ms) */
  silenceThresholdMs: number;

  /** How long to wait after human stops before responding (ms) */
  humanPauseMs: number;

  /** Priority rules */
  priorities: {
    /** Humans always get priority over agents */
    humansFirst: boolean;
    /** Moderator can interrupt */
    moderatorCanInterrupt: boolean;
    /** Max consecutive agent turns without human */
    maxAgentTurnsWithoutHuman: number;
  };

  /** Speaking duration limits */
  limits: {
    /** Max agent speaking time before yielding (ms) */
    maxAgentSpeakingMs: number;
    /** Target agent response length (words) */
    targetAgentWords: number;
  };
}

/**
 * Current state of turn-taking
 */
export interface TurnState {
  /** Who currently has the floor */
  currentSpeaker: string | null;

  /** Queue of participants wanting to speak */
  speakingQueue: string[];

  /** Last time each participant spoke */
  lastSpoke: Map<string, number>;

  /** Turn count per participant */
  turnCounts: Map<string, number>;

  /** Silence duration (ms) */
  silenceDurationMs: number;
}

// ============================================================================
// TRANSCRIPT TYPES
// ============================================================================

/**
 * A single utterance with speaker attribution
 */
export interface AttributedUtterance {
  /** Unique ID for this utterance */
  id: string;

  /** Who said this */
  speakerId: string;
  speakerName: string;
  speakerType: ParticipantType;

  /** What they said */
  text: string;

  /** When */
  timestamp: Date;
  durationMs: number;

  /** Analysis (optional) */
  sentiment?: 'positive' | 'negative' | 'neutral';
  topics?: string[];
  actionItems?: string[];

  /** Was this a response to someone? */
  inResponseTo?: string;
}

/**
 * Summary of a group conversation
 */
export interface GroupConversationSummary {
  /** Key points discussed */
  keyPoints: string[];

  /** Action items identified */
  actionItems: Array<{
    item: string;
    assignedTo?: string;
    dueDate?: string;
  }>;

  /** Decisions made */
  decisions: string[];

  /** Per-participant summaries */
  participantSummaries: Map<
    string,
    {
      utteranceCount: number;
      speakingTimeMs: number;
      mainContributions: string[];
    }
  >;
}

// ============================================================================
// AGENT PROTOCOL TYPES
// ============================================================================

/**
 * Messages agents can send to coordinate with each other
 */
export type AgentMessage =
  | { type: 'yield'; reason: string } // "Go ahead, this is your area"
  | { type: 'agree'; with: string; point: string } // "I agree with Maya..."
  | { type: 'build'; on: string; addition: string } // "Building on Peter's point..."
  | { type: 'question'; to: string; q: string } // "Maya, what do you think?"
  | { type: 'defer'; to: string; reason: string } // "Peter knows more about this"
  | { type: 'summarize'; points: string[] } // "So we've discussed..."
  | { type: 'redirect'; to: string }; // "Let's hear from Alex"

/**
 * Configuration for agent behavior in group settings
 */
export interface GroupAgentConfig {
  /** Role when in group */
  role: 'facilitator' | 'note_taker' | 'coach' | 'mediator' | 'observer';

  /** Speaking frequency */
  speakingMode: 'proactive' | 'on_request' | 'minimal' | 'silent';

  /** What to track */
  tracking: {
    takeNotes: boolean;
    trackActionItems: boolean;
    monitorEmotions: boolean;
    flagMoments: boolean;
  };

  /** When to interject */
  interjectWhen: {
    emotionalEscalation: boolean;
    missedPoint: boolean;
    factualError: boolean;
    directlyAddressed: boolean;
    awkwardSilence: boolean;
  };
}

// ============================================================================
// CONFERENCE CALL TYPES
// ============================================================================

/**
 * Request to add an external participant
 */
export interface AddParticipantRequest {
  /** Phone number to dial */
  phoneNumber: string;

  /** Name for display/context */
  name: string;

  /** Relationship to user */
  relationship?: string;

  /** Optional introduction message */
  introduction?: string;

  /** Should agent announce the add? */
  announceToRoom: boolean;
}

/**
 * Result of adding a participant
 */
export interface AddParticipantResult {
  success: boolean;
  participantId?: string;
  callSid?: string;
  error?: string;
}

/**
 * Conference call session state
 */
export interface ConferenceCallState {
  /** Active SIP calls */
  activeCalls: Map<
    string,
    {
      callSid: string;
      participantId: string;
      phoneNumber: string;
      status: 'dialing' | 'ringing' | 'connected' | 'disconnected';
      connectedAt?: Date;
    }
  >;

  /** Call recording (if enabled) */
  recordingId?: string;

  /** Total phone time (for billing) */
  totalPhoneTimeMs: number;
}

// ============================================================================
// TEAM ROUNDTABLE TYPES
// ============================================================================

/**
 * Configuration for a team roundtable session
 */
export interface RoundtableConfig {
  /** Which personas to include */
  personas: string[];

  /** Topic for discussion */
  topic?: string;

  /** How agents should collaborate */
  collaborationMode: CollaborationMode;

  /** Who moderates (usually 'ferni') */
  moderator: string;
}

/**
 * State of a team roundtable session
 */
export interface RoundtableState {
  /** Active agents */
  activeAgents: Map<string, GroupParticipant>;

  /** Current collaboration mode */
  collaborationMode: CollaborationMode;

  /** Conversation topic */
  topic?: string;

  /** Agent speaking scores (for intelligent selection) */
  agentScores: Map<string, number>;
}

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * Events emitted during group conversations
 */
export type GroupConversationEvent =
  | { type: 'participant_joined'; participant: GroupParticipant }
  | { type: 'participant_left'; participantId: string; reason?: string }
  | { type: 'speaker_changed'; newSpeakerId: string | null; previousSpeakerId: string | null }
  | { type: 'utterance_added'; utterance: AttributedUtterance }
  | { type: 'turn_requested'; participantId: string }
  | { type: 'turn_granted'; participantId: string }
  | { type: 'mode_changed'; newMode: ConversationMode }
  | { type: 'call_status_changed'; callSid: string; status: string }
  | { type: 'session_ended'; summary?: GroupConversationSummary };
