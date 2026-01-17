/**
 * Music State Manager - Frontend Single Source of Truth
 *
 * This service manages all music state on the frontend, mirroring the backend
 * DJController state. It provides:
 *
 * - Single source of truth for music state
 * - Typed event dispatching to UI components
 * - State synchronization with backend
 * - Ducking coordination with MusicAudioController
 *
 * Architecture:
 *   Backend DJController -> music_state messages -> MusicStateManager -> UI Components
 *
 * @module services/music-state-manager
 */

import { createLogger } from '../utils/logger.js';
import type { MusicPlaybackState, MusicEvent } from '../types/events.js';

const log = createLogger('MusicStateManager');

// ============================================================================
// TYPES
// ============================================================================

/**
 * Track information for the currently playing track.
 */
export interface MusicTrack {
  name: string;
  artist: string;
  duration?: number;
  isAmbient?: boolean;
  isOurSong?: boolean;
  ourSongContext?: string;
}

/**
 * Complete music state mirroring backend DJController.
 */
export interface MusicState {
  /** Current playback state */
  state: MusicPlaybackState;
  /** Currently playing track (null if idle/stopped) */
  currentTrack: MusicTrack | null;
  /** Is this ambient/background music */
  isAmbient: boolean;
  /** Is the agent currently speaking */
  isAgentSpeaking: boolean;
  /** Is the user currently speaking */
  isUserSpeaking: boolean;
  /** Timestamp of last state update */
  lastUpdate: number;
  /** Is music currently ducked (lower volume) */
  isDucked: boolean;
  /** Reason for ducking */
  duckReason: 'agent_speaking' | 'user_speaking' | 'external' | null;
}

/**
 * Events emitted by MusicStateManager.
 */
export type MusicStateEvent =
  | { type: 'state_changed'; state: MusicState; previousState: MusicPlaybackState }
  | { type: 'track_started'; track: MusicTrack }
  | { type: 'track_ended'; track: MusicTrack | null }
  | { type: 'ducking_started'; reason: string }
  | { type: 'ducking_ended' }
  | { type: 'controls_enabled'; enabled: boolean };

/**
 * Callback for state change events.
 */
export type MusicStateCallback = (event: MusicStateEvent) => void;

// ============================================================================
// MUSIC STATE MANAGER
// ============================================================================

class MusicStateManager {
  private state: MusicState = {
    state: 'idle',
    currentTrack: null,
    isAmbient: false,
    isAgentSpeaking: false,
    isUserSpeaking: false,
    lastUpdate: Date.now(),
    isDucked: false,
    duckReason: null,
  };

  private listeners: Set<MusicStateCallback> = new Set();
  private isInitialized = false;

  // Heartbeat for detecting stale state
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private static readonly STALE_THRESHOLD_MS = 45000; // 45 seconds

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize the music state manager.
   */
  initialize(): void {
    if (this.isInitialized) return;

    this.startHeartbeat();
    this.isInitialized = true;

    log.info('MusicStateManager initialized');
  }

  /**
   * Start heartbeat to detect stale state.
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) return;

    this.heartbeatInterval = setInterval(() => {
      this.checkStaleState();
    }, 10000); // Check every 10 seconds
  }

  /**
   * Check if state is stale and reset if necessary.
   */
  private checkStaleState(): void {
    const now = Date.now();
    const timeSinceUpdate = now - this.state.lastUpdate;

    // If music is supposedly playing but we haven't heard from backend in a while
    if (
      this.state.state === 'playing' &&
      timeSinceUpdate > MusicStateManager.STALE_THRESHOLD_MS
    ) {
      log.warn('Music state is stale - resetting to idle', {
        lastUpdate: new Date(this.state.lastUpdate).toISOString(),
        timeSinceUpdate: Math.round(timeSinceUpdate / 1000) + 's',
      });

      this.handleStateChange({
        type: 'music',
        state: 'idle',
        timestamp: now,
      });
    }
  }

  // ============================================================================
  // STATE UPDATES
  // ============================================================================

  /**
   * Handle incoming music state from backend.
   * This is the main entry point for all music state updates.
   */
  handleStateChange(event: MusicEvent): void {
    const previousState = this.state.state;
    const previousTrack = this.state.currentTrack;

    // Update state
    this.state = {
      ...this.state,
      state: event.state,
      currentTrack: event.trackName
        ? {
            name: event.trackName,
            artist: event.artistName || 'Unknown Artist',
            duration: event.duration,
            isAmbient: event.isAmbient,
            isOurSong: event.isOurSong,
            ourSongContext: event.ourSongContext,
          }
        : event.state === 'stopped' || event.state === 'idle'
          ? null
          : this.state.currentTrack,
      isAmbient: event.isAmbient || false,
      lastUpdate: Date.now(),
    };

    // Handle ducking state
    if (event.state === 'ducking' && !this.state.isDucked) {
      this.state.isDucked = true;
      this.state.duckReason = 'agent_speaking';
      this.emit({ type: 'ducking_started', reason: 'agent_speaking' });
    } else if (event.state === 'playing' && this.state.isDucked) {
      this.state.isDucked = false;
      this.state.duckReason = null;
      this.emit({ type: 'ducking_ended' });
    }

    // Emit events
    this.emit({
      type: 'state_changed',
      state: { ...this.state },
      previousState,
    });

    // Track started
    if (
      event.state === 'playing' &&
      event.trackName &&
      previousTrack?.name !== event.trackName
    ) {
      this.emit({
        type: 'track_started',
        track: this.state.currentTrack!,
      });
    }

    // Track ended
    if (
      (event.state === 'stopped' || event.state === 'idle') &&
      previousState !== 'stopped' &&
      previousState !== 'idle'
    ) {
      this.emit({
        type: 'track_ended',
        track: previousTrack,
      });
    }

    log.debug('Music state updated', {
      from: previousState,
      to: event.state,
      track: this.state.currentTrack?.name,
    });
  }

  /**
   * Notify that agent started speaking (for ducking).
   */
  notifyAgentSpeakingStart(): void {
    if (this.state.isAgentSpeaking) return;

    this.state.isAgentSpeaking = true;

    // Only emit ducking event if music is active
    if (this.isMusicActive() && !this.state.isDucked) {
      this.state.isDucked = true;
      this.state.duckReason = 'agent_speaking';
      this.emit({ type: 'ducking_started', reason: 'agent_speaking' });
    }
  }

  /**
   * Notify that agent stopped speaking (for unducking).
   */
  notifyAgentSpeakingEnd(): void {
    if (!this.state.isAgentSpeaking) return;

    this.state.isAgentSpeaking = false;

    // Only unduck if user isn't also speaking
    if (this.state.isDucked && !this.state.isUserSpeaking) {
      this.state.isDucked = false;
      this.state.duckReason = null;
      this.emit({ type: 'ducking_ended' });
    }
  }

  /**
   * Notify that user started speaking (for ducking).
   */
  notifyUserSpeakingStart(): void {
    if (this.state.isUserSpeaking) return;

    this.state.isUserSpeaking = true;

    // Only emit ducking event if music is active and not already ducked
    if (this.isMusicActive() && !this.state.isDucked) {
      this.state.isDucked = true;
      this.state.duckReason = 'user_speaking';
      this.emit({ type: 'ducking_started', reason: 'user_speaking' });
    }
  }

  /**
   * Notify that user stopped speaking (for unducking).
   */
  notifyUserSpeakingEnd(): void {
    if (!this.state.isUserSpeaking) return;

    this.state.isUserSpeaking = false;

    // Only unduck if agent isn't also speaking
    if (this.state.isDucked && !this.state.isAgentSpeaking) {
      this.state.isDucked = false;
      this.state.duckReason = null;
      this.emit({ type: 'ducking_ended' });
    }
  }

  // ============================================================================
  // STATE QUERIES
  // ============================================================================

  /**
   * Get current music state.
   */
  getState(): Readonly<MusicState> {
    return { ...this.state };
  }

  /**
   * Check if music is currently active (playing or ducking).
   */
  isMusicActive(): boolean {
    return (
      this.state.state === 'playing' ||
      this.state.state === 'ducking' ||
      this.state.state === 'fading' ||
      this.state.state === 'changing'
    );
  }

  /**
   * Check if music is currently ducked.
   */
  isDucked(): boolean {
    return this.state.isDucked;
  }

  /**
   * Get current track info.
   */
  getCurrentTrack(): MusicTrack | null {
    return this.state.currentTrack ? { ...this.state.currentTrack } : null;
  }

  // ============================================================================
  // EVENT HANDLING
  // ============================================================================

  /**
   * Subscribe to music state events.
   */
  subscribe(callback: MusicStateCallback): () => void {
    this.listeners.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Emit event to all listeners.
   */
  private emit(event: MusicStateEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        log.error('Error in music state listener', error);
      }
    }
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  /**
   * Reset state to initial values.
   */
  reset(): void {
    this.state = {
      state: 'idle',
      currentTrack: null,
      isAmbient: false,
      isAgentSpeaking: false,
      isUserSpeaking: false,
      lastUpdate: Date.now(),
      isDucked: false,
      duckReason: null,
    };

    log.debug('MusicStateManager reset');
  }

  /**
   * Clean up resources.
   */
  cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    this.listeners.clear();
    this.reset();
    this.isInitialized = false;

    log.info('MusicStateManager cleaned up');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: MusicStateManager | null = null;

/**
 * Get the MusicStateManager singleton.
 */
export function getMusicStateManager(): MusicStateManager {
  if (!instance) {
    instance = new MusicStateManager();
  }
  return instance;
}

/**
 * Reset the MusicStateManager singleton.
 */
export function resetMusicStateManager(): void {
  if (instance) {
    instance.cleanup();
    instance = null;
  }
}

// Export class for typing
export { MusicStateManager };
