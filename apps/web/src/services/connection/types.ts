/**
 * Connection Service - public types
 */

import type { ConnectionState, DataMessage } from '../../types/events.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Connection event callbacks.
 */
export interface ConnectionCallbacks {
  onStateChange?: (state: ConnectionState) => void;
  onAgentConnected?: (participantId: string) => void;
  onAgentDisconnected?: () => void;
  onDataMessage?: (message: DataMessage) => void;
  /** Called when agent audio track is available. Includes the audio element and track for visualization. */
  onAudioTrack?: (
    audioElement: HTMLAudioElement,
    participantId: string,
    mediaStreamTrack?: MediaStreamTrack
  ) => void;
  /** Called when agent audio track ends (agent stops speaking). */
  onAudioTrackEnd?: (participantId: string) => void;
  /** 🎚️ Called when a MUSIC audio track is detected. Route to MusicAudioController for ducking. */
  onMusicTrack?: (audioElement: HTMLAudioElement, trackId: string) => void;
  /** 🎚️ Called when music track ends. */
  onMusicTrackEnd?: (trackId: string) => void;
  onLocalMicActive?: (isActive: boolean) => void;
  onConnectionQuality?: (latencyMs: number) => void;
  onError?: (error: Error) => void;
}
