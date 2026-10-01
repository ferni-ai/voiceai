/**
 * Connection Service - connection state
 *
 * All mutable connection state lives in one ConnectionContext object, owned by
 * the ConnectionService singleton and passed to the functional modules.
 */

import { setConnectionState } from '../../state/app.state.js';
import type { ConnectionState } from '../../types/events.js';
import type { LiveKitRoom } from '../connection-livekit.js';
import type { ConnectionCallbacks } from './types.js';

/** 5 seconds to match a pending track with its data message */
export const PENDING_TRACK_TTL_MS = 5000;

/**
 * Mutable state of the LiveKit connection (formerly ConnectionService fields).
 */
export interface ConnectionContext {
  room: LiveKitRoom | null;
  callbacks: ConnectionCallbacks;
  cleanupFunctions: (() => void)[];
  qualityMonitorInterval: number | null;
  // Cache audio elements by participant to prevent duplicate creation
  audioElements: Map<string, HTMLAudioElement>;

  // Track intentional disconnects vs crashes
  isDisconnecting: boolean;
  connectPromise: Promise<boolean> | null;

  // 🎚️ Music track identification
  // When we receive music_state: playing, we expect a music track soon
  expectingMusicTrack: boolean;
  expectingMusicTrackTimeout: ReturnType<typeof setTimeout> | null;
  musicTrackIds: Set<string>; // Track IDs identified as music
  voiceTrackId: string | null; // First track is usually voice

  // 🐛 FIX: Buffer for tracks that arrive BEFORE the data message
  // This fixes the race condition where audio arrives before music_state message
  pendingMusicTracks: Map<string, { audioEl: HTMLAudioElement; timestamp: number }>;
  pendingTrackCleanupInterval: ReturnType<typeof setInterval> | null;

  /** From token response: when true, backend is Qwen3-Omni; show Director Console in menu */
  useQwen3Omni: boolean;
}

export function createConnectionContext(): ConnectionContext {
  return {
    room: null,
    callbacks: {},
    cleanupFunctions: [],
    qualityMonitorInterval: null,
    audioElements: new Map(),
    isDisconnecting: false,
    connectPromise: null,
    expectingMusicTrack: false,
    expectingMusicTrackTimeout: null,
    musicTrackIds: new Set(),
    voiceTrackId: null,
    pendingMusicTracks: new Map(),
    pendingTrackCleanupInterval: null,
    useQwen3Omni: false,
  };
}

/**
 * Update connection state in app state and notify callback.
 */
export function updateState(ctx: ConnectionContext, state: ConnectionState): void {
  setConnectionState(state);
  ctx.callbacks.onStateChange?.(state);
}
