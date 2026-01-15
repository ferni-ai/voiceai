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
 * 
 * TUNED 2026-01-12: Reduced ducking levels significantly.
 * 12% was still too loud for energetic music like bluegrass.
 * Agent voice needs to clearly dominate over any music.
 */
const GAIN = {
  /** Full volume when no one is speaking */
  NORMAL: 1.0,
  /** Nearly silent when agent speaks - agent voice must clearly dominate */
  AGENT_SPEAKING: 0.04, // Was 0.12, now 4% - much quieter
  /** Quieter when user speaks - still some ambiance */
  USER_SPEAKING: 0.08, // Was 0.2, now 8%
  /** Minimum gain - never fully silent (prevents abrupt cutoff) */
  MINIMUM: 0.02, // Was 0.05, now 2%
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
 *
 * NEW: Includes fallback ducking via HTMLAudioElement.volume when Web Audio fails.
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

  // Track which audio elements have been connected to Web Audio
  // createMediaElementSource() can only be called ONCE per element!
  private connectedElements: WeakMap<HTMLAudioElement, MediaElementAudioSourceNode> = new WeakMap();

  // Visualization callback and animation loop
  private visualizationCallback: ((volume: number) => void) | null = null;
  private visualizationAnimationFrame: number | null = null;
  private visualizationDataArray: Uint8Array<ArrayBuffer> | null = null;

  // FALLBACK: When Web Audio fails, use direct volume control
  private fallbackAudioElement: HTMLAudioElement | null = null;
  private usingFallback = false;

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

      log.info('🎚️ ✅ Music track SUCCESSFULLY attached for ducking', { 
        trackId,
        hasGainNode: !!gainNode,
        agentSpeaking: this.agentSpeaking,
        userSpeaking: this.userSpeaking,
        backendDucking: this.backendDucking,
      });

      // Apply any existing ducking state (in case someone started speaking before track attached)
      const duckingApplied = this.updateDucking();
      if (this.agentSpeaking || this.userSpeaking || this.backendDucking) {
        log.info('🎚️ Applied pending ducking state after track attachment', {
          duckingApplied,
          agentSpeaking: this.agentSpeaking,
          userSpeaking: this.userSpeaking,
          backendDucking: this.backendDucking,
        });
      }

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

      // Web Audio failed - use fallback CSS volume ducking
      log.warn('🎚️ Web Audio failed - using CSS volume fallback for ducking', {
        trackId,
        error: errorMessage,
        retryCount,
      });

      // Store audio element for fallback ducking
      this.fallbackAudioElement = audioElement;
      this.usingFallback = true;

      // Apply any pending ducking state to fallback
      if (this.agentSpeaking || this.userSpeaking || this.backendDucking) {
        this.applyFallbackDuck();
      }

      return () => {
        log.debug('🎚️ Fallback cleanup', { trackId });
        if (this.fallbackAudioElement === audioElement) {
          this.fallbackAudioElement = null;
          this.usingFallback = false;
        }
      };
    }
  }

  // ==========================================================================
  // FALLBACK DUCKING (CSS Volume)
  // ==========================================================================

  /**
   * Apply ducking via direct HTMLAudioElement.volume
   * Used when Web Audio API fails to attach.
   */
  private applyFallbackDuck(): void {
    if (!this.fallbackAudioElement) return;

    let targetVolume: number;
    if (this.agentSpeaking) {
      targetVolume = GAIN.AGENT_SPEAKING;
    } else if (this.userSpeaking) {
      targetVolume = GAIN.USER_SPEAKING;
    } else if (this.backendDucking) {
      targetVolume = GAIN.USER_SPEAKING;
    } else {
      targetVolume = GAIN.NORMAL;
    }

    // Direct volume control (instant, no ramp)
    this.fallbackAudioElement.volume = Math.max(targetVolume, GAIN.MINIMUM);

    log.info('🎚️ Fallback ducking applied', {
      volume: this.fallbackAudioElement.volume.toFixed(2),
      reason: this.agentSpeaking ? 'agent' : this.userSpeaking ? 'user' : 'backend',
    });
  }

  /**
   * Restore volume via fallback.
   */
  private restoreFallbackVolume(): void {
    if (!this.fallbackAudioElement) return;

    this.fallbackAudioElement.volume = GAIN.NORMAL;
    log.debug('🎚️ Fallback volume restored');
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
   * 
   * @returns true if ducking was applied, false if no track attached
   */
  duckForAgent(): boolean {
    this.agentSpeaking = true;

    // Try Web Audio first
    const success = this.updateDucking();
    
    // Fall back to CSS volume if Web Audio isn't available
    if (!success && this.usingFallback) {
      this.applyFallbackDuck();
      log.info('🎚️ ✅ FALLBACK DUCKING for agent speech', {
        volume: this.fallbackAudioElement?.volume.toFixed(2),
      });
      return true;
    }
    
    if (success) {
      log.info('🎚️ ✅ DUCKING APPLIED for agent speech', {
        currentGain: this.currentTrack?.gainNode.gain.value.toFixed(2),
        targetGain: this.currentTrack?.targetGain.toFixed(2),
        trackId: this.currentTrack?.trackId,
      });
    } else {
      log.warn('🎚️ ❌ DUCKING FAILED - no music track attached!', {
        hasTrack: this.currentTrack !== null,
        usingFallback: this.usingFallback,
        agentSpeaking: this.agentSpeaking,
      });
    }
    return success;
  }

  /**
   * Unduck after agent stops speaking.
   * 
   * @returns true if unduck was applied, false if no track attached
   */
  unduckForAgent(): boolean {
    this.agentSpeaking = false;
    const success = this.updateDucking();
    
    // Fallback unduck
    if (!success && this.usingFallback) {
      this.applyFallbackDuck(); // Will restore if nothing else is ducking
      return true;
    }
    
    if (success) {
      log.debug('🎚️ Agent stopped, restoring gain');
    }
    return success;
  }

  /**
   * Duck the music because user started speaking.
   * Medium priority.
   * 
   * @returns true if ducking was applied, false if no track attached
   */
  duckForUser(): boolean {
    this.userSpeaking = true;
    const success = this.updateDucking();
    
    if (!success && this.usingFallback) {
      this.applyFallbackDuck();
      log.debug('🎚️ Fallback ducking for user speech');
      return true;
    }
    
    if (success) {
      log.debug('🎚️ Ducking for user speech');
    }
    return success;
  }

  /**
   * Unduck after user stops speaking.
   * 
   * @returns true if unduck was applied, false if no track attached
   */
  unduckForUser(): boolean {
    this.userSpeaking = false;
    const success = this.updateDucking();
    
    if (!success && this.usingFallback) {
      this.applyFallbackDuck();
      return true;
    }
    
    if (success) {
      log.debug('🎚️ User stopped, restoring gain');
    }
    return success;
  }

  /**
   * Duck based on backend message.
   * Lowest priority - only applies if no one is speaking.
   *
   * @returns true if ducking was applied, false if no track attached
   */
  duckFromBackend(): boolean {
    this.backendDucking = true;
    const success = this.updateDucking();
    
    if (!success && this.usingFallback) {
      this.applyFallbackDuck();
      log.info('🎚️ Backend requested duck - FALLBACK APPLIED');
      return true;
    }
    
    if (success) {
      log.info('🎚️ Backend requested duck - DUCKING APPLIED', {
        hasTrack: !!this.currentTrack,
        trackId: this.currentTrack?.trackId,
        targetGain: this.currentTrack?.targetGain,
      });
    } else {
      log.warn('🎚️ [BUG] duckFromBackend called but no music track attached - ducking will NOT work!');
    }
    return success;
  }

  /**
   * Unduck based on backend message.
   * 
   * @returns true if unduck was applied, false if no track attached
   */
  unduckFromBackend(): boolean {
    this.backendDucking = false;
    const success = this.updateDucking();
    if (success) {
      log.debug('🎚️ Backend requested unduck');
    }
    return success;
  }

  /**
   * Calculate and apply the correct gain based on current ducking state.
   * 
   * @returns true if ducking was applied, false if no track attached
   */
  private updateDucking(): boolean {
    if (!this.currentTrack) {
      // No track attached - ducking cannot work
      // The calling code will log a warning
      return false;
    }

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
        // 🎚️ FIX: Use info level so we can see when ducking is skipped
        log.info('🎚️ Ducking ALREADY at target level (skipping ramp)', {
          targetGain: targetGain.toFixed(2),
          priority,
          currentGain: this.currentTrack.gainNode.gain.value.toFixed(2),
        });
      }
      return true; // Already at target - ducking is working
    }

    this.currentTrack.targetGain = targetGain;
    this.currentTrack.currentPriority = priority;

    // Apply the gain change with smooth ramp
    this.rampGain(targetGain, rampTime);
    
    return true;
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

    // 🎚️ FIX: Use info level so volume changes are visible in console
    log.info('🎚️ RAMPING GAIN (volume change!)', {
      from: gainNode.gain.value.toFixed(2),
      to: clampedGain.toFixed(2),
      durationMs,
      trackId: this.currentTrack.trackId,
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

  /**
   * 🎵 Start visualization loop that reads audio levels and calls the callback.
   * This is separate from ducking - it drives the waveform visualization.
   *
   * @param callback - Function called each frame with volume (0-1)
   * @returns Cleanup function to stop visualization
   */
  startVisualization(callback: (volume: number) => void): () => void {
    // Stop any existing visualization
    this.stopVisualization();

    this.visualizationCallback = callback;

    // Create data array for analyser
    const analyser = this.getAnalyser();
    if (analyser) {
      this.visualizationDataArray = new Uint8Array(analyser.frequencyBinCount);
    }

    // Start the animation loop
    this.runVisualizationLoop();

    log.debug('🎵 Music visualization started');

    return () => this.stopVisualization();
  }

  /**
   * 🎵 Stop the visualization loop.
   */
  stopVisualization(): void {
    if (this.visualizationAnimationFrame !== null) {
      cancelAnimationFrame(this.visualizationAnimationFrame);
      this.visualizationAnimationFrame = null;
    }
    this.visualizationCallback = null;
    this.visualizationDataArray = null;
    log.debug('🎵 Music visualization stopped');
  }

  /**
   * 🎵 Internal: Run the visualization animation loop.
   */
  private runVisualizationLoop(): void {
    const update = () => {
      if (!this.visualizationCallback || !this.currentTrack) {
        return;
      }

      const analyser = this.currentTrack.analyser;
      if (!analyser || !this.visualizationDataArray) {
        this.visualizationAnimationFrame = requestAnimationFrame(update);
        return;
      }

      // Get frequency data
      analyser.getByteFrequencyData(this.visualizationDataArray);

      // Calculate average volume (0-1)
      let sum = 0;
      for (let i = 0; i < this.visualizationDataArray.length; i++) {
        sum += this.visualizationDataArray[i] ?? 0;
      }
      const average = sum / this.visualizationDataArray.length / 255;

      // Apply ducking factor to visualized volume
      // When music is ducked, the visualization should also be quieter
      const duckFactor = this.getCurrentGain();
      const visualVolume = average * duckFactor;

      // Call the callback
      this.visualizationCallback(visualVolume);

      this.visualizationAnimationFrame = requestAnimationFrame(update);
    };

    this.visualizationAnimationFrame = requestAnimationFrame(update);
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
   * Check if ducking is ready (track attached and gain node connected).
   * Use this to diagnose ducking issues.
   */
  isDuckingReady(): boolean {
    return this.currentTrack !== null && this.currentTrack.gainNode !== null;
  }

  /**
   * Get diagnostic info for debugging ducking issues.
   */
  getDuckingDiagnostics(): {
    hasTrack: boolean;
    hasGainNode: boolean;
    agentSpeaking: boolean;
    userSpeaking: boolean;
    backendDucking: boolean;
    currentGain: number;
    targetGain: number;
    usingFallback: boolean;
    trackId: string | null;
  } {
    return {
      hasTrack: this.currentTrack !== null || this.fallbackAudioElement !== null,
      hasGainNode: this.currentTrack?.gainNode !== null,
      agentSpeaking: this.agentSpeaking,
      userSpeaking: this.userSpeaking,
      backendDucking: this.backendDucking,
      currentGain: this.currentTrack?.gainNode?.gain.value ?? 1.0,
      targetGain: this.currentTrack?.targetGain ?? 1.0,
      usingFallback: this.usingFallback,
      trackId: this.currentTrack?.trackId ?? null,
    };
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
    // Stop visualization first
    this.stopVisualization();

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

// ============================================================================
// DEBUG HELPER - Expose to window for console debugging
// ============================================================================

if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__ferniMusicAudioController = getMusicAudioController();
}
