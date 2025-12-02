/**
 * LiveKit Type Definitions
 * 
 * Extends and re-exports LiveKit client types with additional
 * application-specific typings.
 */

// Re-export LiveKit types for convenience
export type {
  Room,
  RoomOptions,
  LocalParticipant,
  RemoteParticipant,
  Track,
  AudioTrack,
  VideoTrack,
  TrackPublication,
  RemoteTrackPublication,
  LocalTrackPublication,
} from 'livekit-client';

export {
  RoomEvent,
  ConnectionState as LiveKitConnectionState,
  Track as LiveKitTrack,
  ParticipantEvent,
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
  readonly url: string;         // Server URL (wss://...)
  readonly room: string;        // Room name
  readonly username: string;    // Participant name
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
  };
}

