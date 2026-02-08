/**
 * LiveKit Type Definitions
 *
 * Extends and re-exports LiveKit client types with additional
 * application-specific typings.
 */

// Re-export LiveKit types for convenience
export type {
  AudioTrack,
  LocalParticipant,
  LocalTrackPublication,
  RemoteParticipant,
  RemoteTrackPublication,
  Room,
  RoomOptions,
  Track,
  TrackPublication,
  VideoTrack,
} from 'livekit-client';

export {
  ConnectionState as LiveKitConnectionState,
  Track as LiveKitTrack,
  ParticipantEvent,
  RoomEvent,
  TrackEvent,
} from 'livekit-client';

// ============================================================================
// TOKEN RESPONSE
// ============================================================================

/**
 * Response from the /token endpoint.
 */
export interface TokenResponse {
  readonly token: string;
  readonly url: string; // Server URL (wss://...)
  readonly room: string; // Room name
  readonly username: string; // Participant name
  /** When true, backend is using Qwen3-Omni; frontend shows Director Console in menu */
  readonly useQwen3Omni?: boolean;
}

/**
 * Type guard for token response validation.
 */
export function isValidTokenResponse(data: unknown): data is TokenResponse {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const obj = data as Record<string, unknown>;
  return (
    typeof obj['token'] === 'string' &&
    typeof obj['url'] === 'string' &&
    typeof obj['room'] === 'string' &&
    typeof obj['username'] === 'string'
  );
}

// ============================================================================
// TOKEN REQUEST
// ============================================================================

/**
 * Parameters for requesting a token.
 */
export interface TokenRequest {
  readonly room: string;
  readonly username: string;
  readonly deviceId: string;
  readonly personaId: string;
  /** Firebase UID for cross-device user identification */
  readonly firebaseUid?: string;
  /**
   * User's preferred voice accent (american, british, australian, indian)
   * Loaded from user profile or auto-detected from locale
   */
  readonly preferredAccent?: string;
  /**
   * Claimed demo conversation data (Better than human)
   * Set when user came from landing page demo and claimed their conversation
   */
  readonly claimedDemoConversation?: ClaimedDemoConversation;
}

/**
 * Data from a claimed demo session.
 * "Better than human" - We remember our first conversation.
 */
export interface ClaimedDemoConversation {
  highlights: string[];
  topics: string[];
  userMood: string | null;
  ferniNotes: string;
  messageCount: number;
}

// ============================================================================
// AUDIO TRACK INFO
// ============================================================================

/**
 * Information about an active audio track.
 */
export interface AudioTrackInfo {
  readonly trackSid: string;
  readonly participantId: string;
  readonly isLocal: boolean;
  readonly isMuted: boolean;
}

// ============================================================================
// ROOM STATE
// ============================================================================

/**
 * Current state of the LiveKit room.
 */
export interface RoomState {
  readonly isConnected: boolean;
  readonly roomName: string | null;
  readonly localParticipantId: string | null;
  readonly remoteParticipantCount: number;
  readonly hasActiveAudio: boolean;
  /** When true, session was created with Qwen3-Omni backend; show Director Console in menu */
  readonly useQwen3Omni?: boolean;
}

/**
 * Create initial room state.
 */
export function createInitialRoomState(): RoomState {
  return {
    isConnected: false,
    roomName: null,
    localParticipantId: null,
    remoteParticipantCount: 0,
    hasActiveAudio: false,
    useQwen3Omni: undefined,
  };
}
