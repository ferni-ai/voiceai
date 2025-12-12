/**
 * 🎚️ Music Audio Controller - Real-time ducking via Web Audio API
 *
 * This controller manages music audio with real-time volume control (ducking)
 * using the Web Audio API's GainNode. Unlike the backend which can't change
 * volume during playback, we CAN duck audio in the browser!
 *
 * Audio Chain:
 *   HTMLAudioElement → MediaElementSource → Analyser → GainNode → Destination
 *
 * Ducking triggers:
 *   - Agent speaking (highest priority)
 *   - User speaking (via VAD)
 *   - Backend music_state: 'ducking' message
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('MusicAudio');

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Gain levels for different scenarios (0-1 scale)
 */
const GAIN = {
  /** Full volume when no one is speaking */
  NORMAL: 1.0,
  /** Very quiet when agent speaks - agent voice should dominate */
  AGENT_SPEAKING: 0.12,
  /** Slightly louder when user speaks - they still want some music */
  USER_SPEAKING: 0.2,
  /** Minimum gain - never fully silent */
  MINIMUM: 0.05,
} as const;

/**
 * Ramp durations in milliseconds
 */
const RAMP = {
  /** Fast duck when someone starts speaking */
  DUCK_DOWN_MS: 150,
  /** Slower restore for smooth feel */
  DUCK_UP_MS: 400,
  /** Gradual fade for track transitions */
  FADE_MS: 800,
} as const;

/**
 * Ducking priority - higher number = higher priority
 */
enum DuckPriority {
  NONE = 0,
  BACKEND_MESSAGE = 1,
  USER_SPEAKING = 2,
  AGENT_SPEAKING = 3,
}

// ============================================================================
// TYPES
// ============================================================================

interface MusicTrackState {
  /** The HTML audio element from LiveKit */
  audioElement: HTMLAudioElement;
  /** MediaElementSource node */
  mediaSource: MediaElementAudioSourceNode;
  /** Analyser for visualization */
  analyser: AnalyserNode;
  /** GainNode for ducking */
  gainNode: GainNode;
  /** Track identifier */
  trackId: string;
  /** Current target gain */
  targetGain: number;
  /** Current duck priority */
  currentPriority: DuckPriority;
}

// ============================================================================
// MUSIC AUDIO CONTROLLER CLASS
// ============================================================================

/**
 * Controls music audio with real-time ducking capabilities.
 * Singleton pattern - one controller manages all music tracks.
 */
class MusicAudioController {
  private audioContext: AudioContext | null = null;
  private currentTrack: MusicTrackState | null = null;
  private isInitialized = false;

  // Track ducking state
  private agentSpeaking = false;
  private userSpeaking = false;
  private backendDucking = false;

  // Cleanup functions for event listeners
  private cleanupFunctions: Array<() => void> = [];

  // 🐛 FIX: Track which audio elements have been connected to Web Audio
  // createMediaElementSource() can only be called ONCE per element!
  private connectedElements: WeakMap<HTMLAudioElement, MediaElementAudioSourceNode> = new WeakMap();

  constructor() {
    log.debug('MusicAudioController created');
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Initialize the audio context.
   * Must be called after user interaction (browser autoplay policy).
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Create AudioContext with fallback for Safari
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioContextClass();

      // Resume if suspended (common on mobile)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.isInitialized = true;
      log.info('🎚️ MusicAudioController initialized', {
        sampleRate: this.audioContext.sampleRate,
        state: this.audioContext.state,
      });
    } catch (error) {
      log.error('Failed to initialize audio context', error);
      throw error;
    }
  }

  /**
   * Ensure audio context is initialized and running.
   */
  private async ensureContext(): Promise<AudioContext> {
    if (!this.audioContext) {
      await this.initialize();
    }

    if (this.audioContext!.state === 'suspended') {
      await this.audioContext!.resume();
    }

    return this.audioContext!;
  }

  // ==========================================================================
  // TRACK MANAGEMENT
  // ==========================================================================

  /**
   * Attach a music track for ducking control.
   * Routes the audio through our GainNode for real-time volume control.
   *
   * 🐛 FIX: Now handles "already connected" case gracefully and includes retry logic.
   *
   * @param audioElement - The HTMLAudioElement from LiveKit
   * @param trackId - Unique identifier for this track
   * @param retryCount - Internal retry counter (default 0)
   * @returns Cleanup function to detach the track
   */
  async attachMusicTrack(
    audioElement: HTMLAudioElement,
    trackId: string,
    retryCount = 0
  ): Promise<() => void> {
    const MAX_RETRIES = 2;
    const ctx = await this.ensureContext();

    // Clean up any existing track (but keep the WeakMap entry)
    if (this.currentTrack) {
      this.detachCurrentTrack();
    }

    try {
      // Create the audio processing chain
      // MediaElementSource → Analyser → GainNode → Destination

      let mediaSource: MediaElementAudioSourceNode;

      // 🐛 FIX: Check if this audio element is already connected
      // createMediaElementSource() can only be called ONCE per element!
      const existingSource = this.connectedElements.get(audioElement);
      if (existingSource) {
        log.info('🎚️ Reusing existing MediaElementSource for audio element', { trackId });
        mediaSource = existingSource;

        // Disconnect from any previous chain before reconnecting
        try {
          mediaSource.disconnect();
        } catch {
          // Ignore disconnect errors - might not be connected
        }
      } else {
        // Create new MediaElementSource
        mediaSource = ctx.createMediaElementSource(audioElement);
        this.connectedElements.set(audioElement, mediaSource);
      }

      // 2. Create Analyser for visualization
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.3;

      // 3. Create GainNode for ducking 🎚️
      const gainNode = ctx.createGain();
      gainNode.gain.value = GAIN.NORMAL;

      // 4. Connect the chain
      mediaSource.connect(analyser);
      analyser.connect(gainNode);
      gainNode.connect(ctx.destination);

      // Store the track state
      this.currentTrack = {
        audioElement,
        mediaSource,
        analyser,
        gainNode,
        trackId,
        targetGain: GAIN.NORMAL,
        currentPriority: DuckPriority.NONE,
      };

      log.info('🎚️ Music track attached for ducking', { trackId });

      // Apply any existing ducking state
      this.updateDucking();

      // Return cleanup function
      return () => this.detachTrack(trackId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // 🐛 FIX: Handle "already connected" error by retrying
      if (errorMessage.includes('already connected') || errorMessage.includes('HTMLMediaElement')) {
        log.warn('🎚️ Audio element already connected, clearing cache and retrying', {
          trackId,
          retryCount,
        });

        // Remove from cache and retry
        this.connectedElements.delete(audioElement);

        if (retryCount < MAX_RETRIES) {
          // Small delay before retry
          await new Promise((resolve) => setTimeout(resolve, 100));
          return this.attachMusicTrack(audioElement, trackId, retryCount + 1);
        }
      }

      // 🐛 FIX: Log actionable error instead of silent failure
      log.error('🎚️ Failed to attach music track - DUCKING WILL NOT WORK', {
        trackId,
        error: errorMessage,
        retryCount,
        hint: 'Check if audio element is being used by another service',
      });

      // Return a no-op cleanup function instead of throwing
      // This allows the app to continue working (without ducking)
      return () => {
        log.debug('🎚️ No-op cleanup for failed track attachment', { trackId });
      };
    }
  }

  /**
   * Detach a specific track.
   */
  private detachTrack(trackId: string): void {
    if (this.currentTrack?.trackId === trackId) {
      this.detachCurrentTrack();
    }
  }

  /**
   * Detach and cleanup the current track.
   */
  private detachCurrentTrack(): void {
    if (!this.currentTrack) return;

    try {
      // Disconnect all nodes
      this.currentTrack.mediaSource.disconnect();
      this.currentTrack.analyser.disconnect();
      this.currentTrack.gainNode.disconnect();

      log.debug('🎚️ Music track detached', { trackId: this.currentTrack.trackId });
    } catch (error) {
      log.warn('Error detaching music track', error);
    }

    this.currentTrack = null;
  }

  // ==========================================================================
  // DUCKING CONTROL
  // ==========================================================================

  /**
   * Duck the music because agent started speaking.
   * Highest priority - always ducks to lowest level.
   */
  duckForAgent(): void {
    this.agentSpeaking = true;
    this.updateDucking();
    log.debug('🎚️ Ducking for agent speech');
  }

  /**
   * Unduck after agent stops speaking.
   */
  unduckForAgent(): void {
    this.agentSpeaking = false;
    this.updateDucking();
    log.debug('🎚️ Agent stopped, restoring gain');
  }

  /**
   * Duck the music because user started speaking.
   * Medium priority.
   */
  duckForUser(): void {
    this.userSpeaking = true;
    this.updateDucking();
    log.debug('🎚️ Ducking for user speech');
  }

  /**
   * Unduck after user stops speaking.
   */
  unduckForUser(): void {
    this.userSpeaking = false;
    this.updateDucking();
    log.debug('🎚️ User stopped, restoring gain');
  }

  /**
   * Duck based on backend message.
   * Lowest priority - only applies if no one is speaking.
   */
  duckFromBackend(): void {
    this.backendDucking = true;
    this.updateDucking();
    log.debug('🎚️ Backend requested duck');
  }

  /**
   * Unduck based on backend message.
   */
  unduckFromBackend(): void {
    this.backendDucking = false;
    this.updateDucking();
    log.debug('🎚️ Backend requested unduck');
  }

  /**
   * Calculate and apply the correct gain based on current ducking state.
   */
  private updateDucking(): void {
    if (!this.currentTrack) return;

    let targetGain: number;
    let priority: DuckPriority;
    let rampTime: number;

    // Determine target gain based on priority
    if (this.agentSpeaking) {
      targetGain = GAIN.AGENT_SPEAKING;
      priority = DuckPriority.AGENT_SPEAKING;
      rampTime = RAMP.DUCK_DOWN_MS;
    } else if (this.userSpeaking) {
      targetGain = GAIN.USER_SPEAKING;
      priority = DuckPriority.USER_SPEAKING;
      rampTime = RAMP.DUCK_DOWN_MS;
    } else if (this.backendDucking) {
      targetGain = GAIN.USER_SPEAKING; // Use same level as user speaking
      priority = DuckPriority.BACKEND_MESSAGE;
      rampTime = RAMP.DUCK_DOWN_MS;
    } else {
      targetGain = GAIN.NORMAL;
      priority = DuckPriority.NONE;
      rampTime = RAMP.DUCK_UP_MS; // Slower restore
    }

    // Only update if target changed (prevents duplicate ramps from redundant triggers)
    if (this.currentTrack.targetGain === targetGain) {
      // Log when redundant ducking is detected (both frontend and backend triggering)
      if (targetGain !== GAIN.NORMAL) {
        log.debug('🎚️ Ducking already at target level (redundant trigger ignored)', {
          targetGain: targetGain.toFixed(2),
          priority,
        });
      }
      return;
    }

    this.currentTrack.targetGain = targetGain;
    this.currentTrack.currentPriority = priority;

    // Apply the gain change with smooth ramp
    this.rampGain(targetGain, rampTime);
  }

  /**
   * Smoothly ramp gain to target value.
   *
   * Uses exponentialRampToValueAtTime for natural-sounding fades.
   * Falls back to linearRamp for values near zero.
   */
  private rampGain(targetGain: number, durationMs: number): void {
    if (!this.currentTrack || !this.audioContext) return;

    const gainNode = this.currentTrack.gainNode;
    const currentTime = this.audioContext.currentTime;
    const endTime = currentTime + durationMs / 1000;

    // Cancel any ongoing ramps
    gainNode.gain.cancelScheduledValues(currentTime);

    // Set current value to avoid jumps
    gainNode.gain.setValueAtTime(gainNode.gain.value, currentTime);

    // Use linear ramp (exponential can't go to exactly 0)
    // Clamp to minimum to avoid complete silence
    const clampedGain = Math.max(targetGain, GAIN.MINIMUM);
    gainNode.gain.linearRampToValueAtTime(clampedGain, endTime);

    log.debug('🎚️ Ramping gain', {
      from: gainNode.gain.value.toFixed(2),
      to: clampedGain.toFixed(2),
      durationMs,
    });
  }

  // ==========================================================================
  // VISUALIZATION SUPPORT
  // ==========================================================================

  /**
   * Get the analyser node for visualization.
   * Returns null if no track is attached.
   */
  getAnalyser(): AnalyserNode | null {
    return this.currentTrack?.analyser ?? null;
  }

  /**
   * Get frequency data for visualization.
   */
  getFrequencyData(): Uint8Array | null {
    const analyser = this.getAnalyser();
    if (!analyser) return null;

    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    return data;
  }

  /**
   * Get time domain data for waveform visualization.
   */
  getTimeDomainData(): Uint8Array | null {
    const analyser = this.getAnalyser();
    if (!analyser) return null;

    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(data);
    return data;
  }

  // ==========================================================================
  // STATE & CLEANUP
  // ==========================================================================

  /**
   * Check if music is currently ducked.
   */
  isDucked(): boolean {
    return this.currentTrack?.targetGain !== GAIN.NORMAL;
  }

  /**
   * Check if a music track is attached.
   */
  hasTrack(): boolean {
    return this.currentTrack !== null;
  }

  /**
   * Get current gain level (0-1).
   */
  getCurrentGain(): number {
    return this.currentTrack?.gainNode.gain.value ?? 1.0;
  }

  /**
   * Clean up all resources.
   */
  cleanup(): void {
    // Detach current track
    this.detachCurrentTrack();

    // Run cleanup functions
    for (const cleanup of this.cleanupFunctions) {
      try {
        cleanup();
      } catch (e) {
        log.warn('Cleanup error', e);
      }
    }
    this.cleanupFunctions = [];

    // Close audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      void this.audioContext.close();
    }
    this.audioContext = null;
    this.isInitialized = false;

    // Reset state
    this.agentSpeaking = false;
    this.userSpeaking = false;
    this.backendDucking = false;

    log.info('🎚️ MusicAudioController cleaned up');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

/** Singleton instance */
let instance: MusicAudioController | null = null;

/**
 * Get the MusicAudioController singleton.
 */
export function getMusicAudioController(): MusicAudioController {
  if (!instance) {
    instance = new MusicAudioController();
  }
  return instance;
}

/**
 * Reset the controller (for testing or reconnection).
 */
export function resetMusicAudioController(): void {
  if (instance) {
    instance.cleanup();
    instance = null;
  }
}

// Export the class for typing
export { MusicAudioController };
export type { MusicTrackState };
