/**
 * Connection Service
 *
 * Manages LiveKit room connections with type-safe APIs.
 * Handles token fetching, room creation, and connection lifecycle.
 *
 * Modules:
 * - context.ts       — the single ConnectionContext holding all mutable state
 * - lifecycle.ts     — connect / disconnect / room state
 * - room-handlers.ts — room + document listeners and their cleanup
 * - audio-tracks.ts  — remote audio track subscribe/unsubscribe handlers
 * - music-tracks.ts  — music vs voice track identification
 * - quality.ts       — connection quality monitoring
 */

import type { RoomState } from '../../types/livekit.js';
import type { LiveKitRoom } from '../connection-livekit.js';
import { createConnectionContext } from './context.js';
import * as lifecycle from './lifecycle.js';
import * as music from './music-tracks.js';
import type { ConnectionCallbacks } from './types.js';

export type { ConnectionCallbacks } from './types.js';

// ============================================================================
// CONNECTION SERVICE
// ============================================================================

/**
 * LiveKit connection management service.
 */
class ConnectionService {
  private readonly ctx = createConnectionContext();

  /**
   * Register callbacks for connection events.
   */
  setCallbacks(callbacks: ConnectionCallbacks): void {
    this.ctx.callbacks = callbacks;
  }

  // ==========================================================================
  // 🎚️ MUSIC TRACK IDENTIFICATION
  // ==========================================================================

  /**
   * Signal that we're expecting a music track soon.
   * Called when we receive music_state: 'playing' from backend.
   */
  expectMusicTrack(): void {
    music.expectMusicTrack(this.ctx);
  }

  /**
   * Check if a track is a music track.
   */
  isMusicTrack(trackId: string): boolean {
    return this.ctx.musicTrackIds.has(trackId);
  }

  /**
   * 🎚️ FIX: Re-attach the most recent music track for ducking.
   * Called when we receive music_state: playing to ensure ducking is on the right track.
   */
  reattachMusicTrackForDucking(): void {
    music.reattachMusicTrackForDucking(this.ctx);
  }

  /**
   * Check if we're expecting a music track (music_state: playing was received).
   */
  isExpectingMusic(): boolean {
    return this.ctx.expectingMusicTrack;
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  /**
   * Connect to a LiveKit room.
   *
   * Concurrent calls (double tap, check-in handler, auto-retry) share the
   * in-flight attempt instead of creating a second Room.
   */
  connect(): Promise<boolean> {
    return lifecycle.connect(this.ctx);
  }

  /**
   * Disconnect from the current room.
   */
  disconnect(): Promise<void> {
    return lifecycle.disconnect(this.ctx);
  }

  /**
   * Get current room state.
   */
  getRoomState(): RoomState {
    return lifecycle.getRoomState(this.ctx);
  }

  /**
   * Check if connected.
   */
  isConnected(): boolean {
    return this.ctx.room?.state === 'connected';
  }

  /**
   * Get the LiveKit room instance (for advanced use cases).
   */
  getRoom(): LiveKitRoom | null {
    return this.ctx.room;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

/**
 * Singleton connection service instance.
 */
export const connectionService = new ConnectionService();
