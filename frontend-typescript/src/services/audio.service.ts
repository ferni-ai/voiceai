/**
 * Audio Service
 * 
 * Manages audio playback, sound effects, and audio visualization.
 * Provides a type-safe API for audio operations.
 */

import { AUDIO } from '../config/index.js';

// Safari compatibility: get AudioContext with webkit fallback
const getAudioContext = (): AudioContext => {
  const AudioContextClass = window.AudioContext || 
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new AudioContextClass();
};

// ============================================================================
// TYPES
// ============================================================================

/**
 * Sound effect identifiers.
 */
export type SoundEffect = 
  | 'connect'
  | 'disconnect'
  | 'handoff-to-peter'
  | 'handoff-to-jack'
  | 'handoff-to-alex'
  | 'handoff-to-maya'
  | 'handoff-to-jordan'
  | 'dramatic-entrance';

/**
 * Audio visualization callback.
 */
export type AudioVisualizationCallback = (volume: number) => void;

// ============================================================================
// AUDIO SERVICE
// ============================================================================

/**
 * Audio management service.
 */
class AudioService {
  private sounds: Map<SoundEffect, HTMLAudioElement> = new Map();
  private visualizationCallback: AudioVisualizationCallback | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animationFrame: number | null = null;
  private mediaSource: MediaElementAudioSourceNode | null = null;
  private attachedElement: HTMLAudioElement | null = null;

  /**
   * Initialize the audio service and preload sounds.
   * Non-blocking - starts loading sounds in background.
   */
  async initialize(): Promise<void> {
    // Start preloading sounds in background (don't await)
    // Sounds will be available when they finish loading
    void this.preloadSounds();
    console.log('🔊 Audio service initialized');
  }

  /**
   * Play a sound effect.
   */
  async playSound(effect: SoundEffect): Promise<void> {
    const audio = this.sounds.get(effect);
    if (!audio) {
      console.warn(`Sound effect not loaded: ${effect}`);
      return;
    }

    try {
      audio.currentTime = 0;
      audio.volume = AUDIO.VOLUMES.EFFECTS;
      await audio.play();
    } catch (error) {
      // Autoplay policy may block this - that's OK
      console.debug(`Could not play sound ${effect}:`, error);
    }
  }

  /**
   * Play a sound effect and wait for it to finish.
   * Returns a promise that resolves when the sound ends.
   */
  async playSoundAndWait(effect: SoundEffect): Promise<void> {
    const audio = this.sounds.get(effect);
    if (!audio) {
      console.warn(`Sound effect not loaded: ${effect}`);
      return;
    }

    try {
      audio.currentTime = 0;
      audio.volume = AUDIO.VOLUMES.EFFECTS;
      
      return new Promise<void>((resolve) => {
        const onEnded = () => {
          audio.removeEventListener('ended', onEnded);
          audio.removeEventListener('error', onError);
          resolve();
        };
        const onError = () => {
          audio.removeEventListener('ended', onEnded);
          audio.removeEventListener('error', onError);
          resolve();
        };
        
        audio.addEventListener('ended', onEnded, { once: true });
        audio.addEventListener('error', onError, { once: true });
        
        audio.play().catch(() => {
          // Autoplay policy may block this - resolve anyway
          resolve();
        });
      });
    } catch (error) {
      // Autoplay policy may block this - that's OK
      console.debug(`Could not play sound ${effect}:`, error);
    }
  }

  /**
   * Play a handoff sound with proper timing: sound → pause → voice.
   * This ensures the transition feels natural and not rushed.
   */
  async playHandoffSound(effect: SoundEffect, pauseMs: number = 300): Promise<void> {
    await this.playSoundAndWait(effect);
    // Add a pause after the sound before the voice starts
    await new Promise(resolve => setTimeout(resolve, pauseMs));
  }

  /**
   * Attach visualization to an audio track.
   */
  async attachVisualization(
    track: MediaStreamTrack,
    callback: AudioVisualizationCallback
  ): Promise<() => void> {
    this.visualizationCallback = callback;

    try {
      // Create audio context if needed (with Safari fallback)
      if (!this.audioContext) {
        this.audioContext = getAudioContext();
      }

      // CRITICAL: Resume context if suspended (browser autoplay policy)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
        console.log('🔊 Audio context resumed');
      }

      // Create analyser
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;

      // Create media stream source for VISUALIZATION ONLY
      // Audio playback is handled by the HTML audio element from track.attach()
      const stream = new MediaStream([track]);
      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.analyser);

      // DO NOT connect to destination - audio is already playing via track.attach()
      // Connecting here would cause DOUBLE playback and robotic/phaser sound!
      // this.analyser.connect(this.audioContext.destination);
      console.log('🔊 Audio visualization attached (playback via track.attach)');

      // Start visualization loop
      this.startVisualizationLoop();

      // Return cleanup function
      return () => this.stopVisualization();

    } catch (error) {
      console.error('Failed to attach visualization:', error);
      return () => { /* noop */ };
    }
  }

  /**
   * Attach visualization to an HTML audio element.
   * This captures the actual audio data flowing through the element.
   */
  attachAudioElementVisualization(
    audioElement: HTMLAudioElement,
    callback: AudioVisualizationCallback
  ): () => void {
    // Prevent re-attaching to the same element (causes errors)
    if (this.attachedElement === audioElement) {
      console.log('🎵 Already attached to this audio element');
      this.visualizationCallback = callback;
      return () => this.stopVisualization();
    }

    // Clean up any previous attachment
    this.stopVisualization();
    
    this.visualizationCallback = callback;
    this.attachedElement = audioElement;

    try {
      // Create audio context if needed (with Safari fallback)
      if (!this.audioContext) {
        this.audioContext = getAudioContext();
      }

      // Resume if suspended
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      // Create analyser with good settings for voice
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.3; // More responsive for voice

      // Create media element source - this routes audio through Web Audio API
      // Note: Can only call this once per audio element!
      this.mediaSource = this.audioContext.createMediaElementSource(audioElement);
      
      // Connect: source -> analyser -> destination
      // We MUST connect to destination, otherwise audio won't play!
      this.mediaSource.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
      
      console.log('🎵 Audio visualization attached to element');

      // Start visualization loop
      this.startVisualizationLoop();

      // Return cleanup function
      return () => this.stopVisualization();

    } catch (error) {
      console.error('Failed to attach audio element visualization:', error);
      // Still try to play audio even if visualization fails
      return () => { /* noop */ };
    }
  }

  /**
   * Stop visualization.
   */
  stopVisualization(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.visualizationCallback = null;
    // Note: Don't disconnect mediaSource - that would stop audio playback!
    // The connection remains until the audio element is removed from DOM
  }

  /**
   * Get current audio volume (0-1).
   * Uses frequency data for volume detection.
   */
  getCurrentVolume(): number {
    if (!this.analyser) return 0;

    // Use frequency data - more intuitive for volume
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);

    // Find max value in frequency bins (good for detecting any sound)
    let max = 0;
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const val = dataArray[i] ?? 0;
      if (val > max) max = val;
      sum += val;
    }
    
    // Use combination of max and average for robust volume
    const avg = sum / dataArray.length;
    const combined = (max * 0.6 + avg * 0.4) / 255;
    
    // Amplify - voice often has low values
    const amplified = Math.min(1, combined * 3);
    
    return amplified;
  }

  /**
   * Resume audio context (required after user interaction).
   */
  async resumeContext(): Promise<void> {
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    this.stopVisualization();
    
    // Close audio context
    if (this.audioContext) {
      this.audioContext.close().catch(() => { /* ignore */ });
      this.audioContext = null;
      this.analyser = null;
    }

    // Clear preloaded sounds
    this.sounds.clear();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Preload all sound effects.
   * IMPORTANT: Uses timeout to prevent hanging on iOS Safari where
   * oncanplaythrough may never fire due to autoplay restrictions.
   */
  private async preloadSounds(): Promise<void> {
    const soundMap: Record<SoundEffect, string> = {
      'connect': AUDIO.SOUNDS.CONNECT,
      'disconnect': AUDIO.SOUNDS.DISCONNECT,
      'handoff-to-peter': AUDIO.SOUNDS.HANDOFF_TO_PETER,
      'handoff-to-jack': AUDIO.SOUNDS.HANDOFF_TO_JACK,
      'handoff-to-alex': AUDIO.SOUNDS.HANDOFF_TO_ALEX,
      'handoff-to-maya': AUDIO.SOUNDS.HANDOFF_TO_MAYA,
      'handoff-to-jordan': AUDIO.SOUNDS.HANDOFF_TO_JORDAN,
      'dramatic-entrance': AUDIO.SOUNDS.DRAMATIC_ENTRANCE,
    };

    const LOAD_TIMEOUT_MS = 2000; // Don't wait more than 2 seconds per sound

    const loadPromises = Object.entries(soundMap).map(async ([effect, path]) => {
      const audio = new Audio();
      audio.preload = 'auto';
      
      // Store immediately so it's available even if not fully loaded
      this.sounds.set(effect as SoundEffect, audio);
      
      return new Promise<void>((resolve) => {
        // Timeout to prevent hanging on iOS Safari
        const timeout = setTimeout(() => {
          console.debug(`Sound load timeout: ${path}`);
          resolve();
        }, LOAD_TIMEOUT_MS);
        
        audio.oncanplaythrough = () => {
          clearTimeout(timeout);
          resolve();
        };
        audio.onerror = () => {
          clearTimeout(timeout);
          console.warn(`Failed to load sound: ${path}`);
          resolve();
        };
        audio.src = path;
      });
    });

    await Promise.all(loadPromises);
  }

  /**
   * Start the visualization animation loop.
   */
  private startVisualizationLoop(): void {
    let frameCount = 0;
    let loggedZero = false;
    
    const update = () => {
      if (!this.analyser || !this.visualizationCallback) {
        return;
      }

      const volume = this.getCurrentVolume();
      this.visualizationCallback(volume);
      
      // Debug: Log volume status
      frameCount++;
      if (frameCount % 120 === 0) {
        if (volume > 0.01) {
          console.log(`🔊 Audio volume: ${(volume * 100).toFixed(1)}%`);
          loggedZero = false;
        } else if (!loggedZero) {
          console.log(`🔇 Audio volume: 0 (is audio playing?)`);
          loggedZero = true;
        }
      }

      this.animationFrame = requestAnimationFrame(update);
    };

    update();
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

/**
 * Singleton audio service instance.
 */
export const audioService = new AudioService();

