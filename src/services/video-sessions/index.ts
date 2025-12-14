/**
 * Video Sessions Service
 *
 * Foundation for multi-modal coaching sessions that include video.
 * Extends the existing LiveKit voice infrastructure to support:
 * - Video conferencing for face-to-face coaching
 * - Screen sharing for collaborative work
 * - Video recording for session playback
 * - Avatar + video hybrid modes
 *
 * @module VideoSessions
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { VideoCapabilities, VideoSessionConfig, VideoSessionState } from './types.js';

const log = createLogger({ module: 'VideoSessions' });

// ============================================================================
// VIDEO SESSION MANAGER
// ============================================================================

export class VideoSessionManager {
  private userId: string;
  private state: VideoSessionState;
  private config: VideoSessionConfig;

  constructor(userId: string, config?: Partial<VideoSessionConfig>) {
    this.userId = userId;
    this.config = {
      enableVideo: false,
      enableScreenShare: false,
      enableRecording: false,
      videoQuality: 'auto',
      preferAvatarMode: true,
      ...config,
    };
    this.state = {
      isVideoEnabled: false,
      isScreenSharing: false,
      isRecording: false,
      mode: 'avatar',
      videoTrackId: null,
      screenTrackId: null,
      participants: [],
    };
  }

  // ==========================================================================
  // CAPABILITIES
  // ==========================================================================

  /**
   * Get video capabilities for this session
   */
  getCapabilities(): VideoCapabilities {
    return {
      supportsVideo: true,
      supportsScreenShare: true,
      supportsRecording: this.config.enableRecording,
      maxParticipants: 6, // For group coaching
      supportedQualities: ['low', 'medium', 'high', 'auto'],
      supportedModes: ['avatar', 'video', 'hybrid', 'screen-share'],
    };
  }

  // ==========================================================================
  // VIDEO CONTROL
  // ==========================================================================

  /**
   * Enable video for the session
   */
  enableVideo(): { success: boolean; trackId?: string; error?: string } {
    if (!this.config.enableVideo) {
      return { success: false, error: 'Video is not enabled in config' };
    }

    try {
      // In production, this would integrate with LiveKit video tracks
      // For now, we just update state
      this.state.isVideoEnabled = true;
      this.state.mode = 'video';

      log.info({ userId: this.userId }, 'Video enabled for session');

      return {
        success: true,
        trackId: `video_${this.userId}_${Date.now()}`,
      };
    } catch (error) {
      log.error({ error, userId: this.userId }, 'Failed to enable video');
      return { success: false, error: 'Failed to enable video' };
    }
  }

  /**
   * Disable video and return to avatar mode
   */
  disableVideo(): void {
    this.state.isVideoEnabled = false;
    this.state.videoTrackId = null;

    if (this.config.preferAvatarMode) {
      this.state.mode = 'avatar';
    }

    log.info({ userId: this.userId }, 'Video disabled');
  }

  /**
   * Toggle hybrid mode (avatar + small video pip)
   */
  setHybridMode(enabled: boolean): void {
    if (enabled && this.state.isVideoEnabled) {
      this.state.mode = 'hybrid';
    } else if (!enabled && this.state.isVideoEnabled) {
      this.state.mode = 'video';
    } else {
      this.state.mode = 'avatar';
    }

    log.debug({ userId: this.userId, mode: this.state.mode }, 'Video mode changed');
  }

  // ==========================================================================
  // SCREEN SHARING
  // ==========================================================================

  /**
   * Start screen sharing
   */
  startScreenShare(): { success: boolean; trackId?: string; error?: string } {
    if (!this.config.enableScreenShare) {
      return { success: false, error: 'Screen sharing is not enabled' };
    }

    try {
      this.state.isScreenSharing = true;
      this.state.mode = 'screen-share';
      this.state.screenTrackId = `screen_${this.userId}_${Date.now()}`;

      log.info({ userId: this.userId }, 'Screen sharing started');

      return {
        success: true,
        trackId: this.state.screenTrackId,
      };
    } catch (error) {
      log.error({ error, userId: this.userId }, 'Failed to start screen sharing');
      return { success: false, error: 'Failed to start screen sharing' };
    }
  }

  /**
   * Stop screen sharing
   */
  stopScreenShare(): void {
    this.state.isScreenSharing = false;
    this.state.screenTrackId = null;

    // Return to previous mode
    if (this.state.isVideoEnabled) {
      this.state.mode = 'video';
    } else {
      this.state.mode = 'avatar';
    }

    log.info({ userId: this.userId }, 'Screen sharing stopped');
  }

  // ==========================================================================
  // RECORDING
  // ==========================================================================

  /**
   * Start recording the session
   */
  startRecording(): { success: boolean; recordingId?: string; error?: string } {
    if (!this.config.enableRecording) {
      return { success: false, error: 'Recording is not enabled' };
    }

    try {
      this.state.isRecording = true;

      log.info({ userId: this.userId }, 'Recording started');

      return {
        success: true,
        recordingId: `rec_${this.userId}_${Date.now()}`,
      };
    } catch (error) {
      log.error({ error, userId: this.userId }, 'Failed to start recording');
      return { success: false, error: 'Failed to start recording' };
    }
  }

  /**
   * Stop recording
   */
  stopRecording(): { success: boolean; url?: string } {
    this.state.isRecording = false;

    log.info({ userId: this.userId }, 'Recording stopped');

    // In production, this would return the recording URL
    return { success: true };
  }

  // ==========================================================================
  // GROUP SESSIONS
  // ==========================================================================

  /**
   * Add a participant to the session (for group coaching)
   */
  addParticipant(participantId: string, displayName: string): void {
    const existingIndex = this.state.participants.findIndex((p) => p.id === participantId);

    if (existingIndex === -1) {
      this.state.participants.push({
        id: participantId,
        displayName,
        isVideoEnabled: false,
        isMuted: false,
        joinedAt: new Date(),
      });

      log.info(
        { userId: this.userId, participantId, displayName },
        'Participant added to video session'
      );
    }
  }

  /**
   * Remove a participant from the session
   */
  removeParticipant(participantId: string): void {
    this.state.participants = this.state.participants.filter((p) => p.id !== participantId);

    log.info({ userId: this.userId, participantId }, 'Participant removed from video session');
  }

  /**
   * Get all participants
   */
  getParticipants(): VideoSessionState['participants'] {
    return [...this.state.participants];
  }

  // ==========================================================================
  // STATE
  // ==========================================================================

  /**
   * Get current session state
   */
  getState(): VideoSessionState {
    return { ...this.state };
  }

  /**
   * Get current configuration
   */
  getConfig(): VideoSessionConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<VideoSessionConfig>): void {
    this.config = { ...this.config, ...config };
    log.debug({ userId: this.userId, config }, 'Video session config updated');
  }

  /**
   * Reset session state
   */
  reset(): void {
    this.state = {
      isVideoEnabled: false,
      isScreenSharing: false,
      isRecording: false,
      mode: 'avatar',
      videoTrackId: null,
      screenTrackId: null,
      participants: [],
    };

    log.debug({ userId: this.userId }, 'Video session reset');
  }
}

// ============================================================================
// SINGLETON FACTORY
// ============================================================================

const sessions = new Map<string, VideoSessionManager>();

/**
 * Get or create a video session manager for a user
 */
export function getVideoSession(
  userId: string,
  config?: Partial<VideoSessionConfig>
): VideoSessionManager {
  if (!sessions.has(userId)) {
    sessions.set(userId, new VideoSessionManager(userId, config));
  }
  return sessions.get(userId)!;
}

/**
 * Remove a video session
 */
export function removeVideoSession(userId: string): void {
  const session = sessions.get(userId);
  if (session) {
    session.reset();
    sessions.delete(userId);
  }
}

/**
 * Get all active video sessions
 */
export function getActiveVideoSessions(): Map<string, VideoSessionManager> {
  return new Map(sessions);
}

// ============================================================================
// EXPORTS
// ============================================================================

export type * from './types.js';

export default {
  getVideoSession,
  removeVideoSession,
  getActiveVideoSessions,
  VideoSessionManager,
};
