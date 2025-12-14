/**
 * Video Sessions Types
 *
 * Type definitions for multi-modal video session functionality.
 *
 * @module VideoSessionTypes
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Video session configuration
 */
export interface VideoSessionConfig {
  /** Enable video for the session */
  enableVideo: boolean;

  /** Enable screen sharing capability */
  enableScreenShare: boolean;

  /** Enable session recording */
  enableRecording: boolean;

  /** Video quality preference */
  videoQuality: 'low' | 'medium' | 'high' | 'auto';

  /** Prefer avatar mode over video when not explicitly requested */
  preferAvatarMode: boolean;
}

// ============================================================================
// STATE
// ============================================================================

/**
 * Video session display mode
 */
export type VideoMode = 'avatar' | 'video' | 'hybrid' | 'screen-share';

/**
 * Session participant (for group sessions)
 */
export interface VideoParticipant {
  id: string;
  displayName: string;
  isVideoEnabled: boolean;
  isMuted: boolean;
  joinedAt: Date;
  videoTrackId?: string;
  audioTrackId?: string;
}

/**
 * Video session state
 */
export interface VideoSessionState {
  /** Is video currently enabled */
  isVideoEnabled: boolean;

  /** Is screen sharing active */
  isScreenSharing: boolean;

  /** Is the session being recorded */
  isRecording: boolean;

  /** Current display mode */
  mode: VideoMode;

  /** Active video track ID */
  videoTrackId: string | null;

  /** Active screen share track ID */
  screenTrackId: string | null;

  /** Participants (for group sessions) */
  participants: VideoParticipant[];
}

// ============================================================================
// CAPABILITIES
// ============================================================================

/**
 * Video capabilities for a session
 */
export interface VideoCapabilities {
  /** Whether video is supported */
  supportsVideo: boolean;

  /** Whether screen sharing is supported */
  supportsScreenShare: boolean;

  /** Whether recording is supported */
  supportsRecording: boolean;

  /** Maximum number of participants for group sessions */
  maxParticipants: number;

  /** Supported video quality levels */
  supportedQualities: Array<'low' | 'medium' | 'high' | 'auto'>;

  /** Supported display modes */
  supportedModes: VideoMode[];
}

// ============================================================================
// EVENTS
// ============================================================================

/**
 * Video session events
 */
export type VideoSessionEvent =
  | { type: 'video_enabled'; trackId: string }
  | { type: 'video_disabled' }
  | { type: 'screen_share_started'; trackId: string }
  | { type: 'screen_share_stopped' }
  | { type: 'recording_started'; recordingId: string }
  | { type: 'recording_stopped'; url?: string }
  | { type: 'mode_changed'; mode: VideoMode }
  | { type: 'participant_joined'; participant: VideoParticipant }
  | { type: 'participant_left'; participantId: string }
  | { type: 'participant_video_toggled'; participantId: string; enabled: boolean }
  | { type: 'participant_muted'; participantId: string; muted: boolean };

/**
 * Video session event callback
 */
export type VideoSessionEventCallback = (event: VideoSessionEvent) => void;

// ============================================================================
// RECORDING
// ============================================================================

/**
 * Recording metadata
 */
export interface RecordingMetadata {
  id: string;
  sessionId: string;
  userId: string;
  startedAt: Date;
  endedAt?: Date;
  durationMs?: number;
  fileSize?: number;
  url?: string;
  thumbnailUrl?: string;
  participants: string[];
  hasVideo: boolean;
  hasScreenShare: boolean;
}

// ============================================================================
// API TYPES
// ============================================================================

/**
 * API request to enable video
 */
export interface EnableVideoRequest {
  userId: string;
  sessionId: string;
  quality?: 'low' | 'medium' | 'high' | 'auto';
}

/**
 * API response for video operations
 */
export interface VideoOperationResponse {
  success: boolean;
  trackId?: string;
  error?: string;
}

/**
 * API request to start screen sharing
 */
export interface StartScreenShareRequest {
  userId: string;
  sessionId: string;
  shareAudio?: boolean;
}

/**
 * API request to start recording
 */
export interface StartRecordingRequest {
  userId: string;
  sessionId: string;
  includeVideo?: boolean;
  includeScreenShare?: boolean;
}

/**
 * API response for recording operations
 */
export interface RecordingResponse {
  success: boolean;
  recordingId?: string;
  url?: string;
  error?: string;
}

// ============================================================================
// GROUP SESSION TYPES
// ============================================================================

/**
 * Group session configuration
 */
export interface GroupSessionConfig extends VideoSessionConfig {
  /** Maximum participants */
  maxParticipants: number;

  /** Allow participants to enable video */
  allowParticipantVideo: boolean;

  /** Allow participants to screen share */
  allowParticipantScreenShare: boolean;

  /** Require host approval for participants */
  requireHostApproval: boolean;
}

/**
 * Group session state
 */
export interface GroupSessionState extends VideoSessionState {
  /** Session host user ID */
  hostUserId: string;

  /** Co-hosts (can manage participants) */
  coHostIds: string[];

  /** Waiting room participants */
  waitingRoom: VideoParticipant[];

  /** Is the waiting room enabled */
  waitingRoomEnabled: boolean;
}
