/**
 * Ferni Audio Engine
 * 
 * Manages all audio playback with preloading, ducking,
 * and category-based volume control.
 * 
 * @module @ferni/audio
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('FerniAudio');

// ============================================================================
// TYPES
// ============================================================================

export type SoundCategory = 
  | 'system'
  | 'celebration'
  | 'notification'
  | 'error'
  | 'ui'
  | 'handoff'
  | 'persona'
  | 'ambient';

export interface SoundDefinition {
  file: string;
  duration: number;
  volume: number;      // dB
  preload: boolean;
  loop?: boolean;
  category: SoundCategory;
}

export interface PlayOptions {
  volume?: number;     // Override volume (dB)
  loop?: boolean;      // Override loop setting
  fadeIn?: number;     // Fade in duration (ms)
  onEnd?: () => void;  // Callback when sound ends
}

export interface AudioConfig {
  /** Master enable/disable */
  enabled: boolean;
  
  /** Master volume (0-1) */
  masterVolume: number;
  
  /** Category volumes (0-1) */
  categoryVolumes: Partial<Record<SoundCategory, number>>;
  
  /** Base URL for sound files */
  basePath: string;
  
  /** Whether to respect system silent mode */
  respectSilentMode: boolean;
}

interface LoadedSound {
  buffer: AudioBuffer;
  definition: SoundDefinition;
}

interface ActiveSound {
  source: AudioBufferSourceNode;
  gainNode: GainNode;
  startTime: number;
  definition: SoundDefinition;
}

// ============================================================================
// SOUND REGISTRY
// ============================================================================

const SOUND_DEFINITIONS: Record<string, SoundDefinition> = {
  // System - mapped to existing sounds
  'system.startup': { file: 'connect.mp3', duration: 500, volume: -6, preload: true, category: 'system' },
  'system.connectionSuccess': { file: 'connect.mp3', duration: 500, volume: -6, preload: true, category: 'system' },
  'system.connectionLost': { file: 'disconnect.mp3', duration: 500, volume: -9, preload: true, category: 'system' },
  'system.sessionEnd': { file: 'disconnect.mp3', duration: 500, volume: -6, preload: false, category: 'system' },
  // Note: thinking sound not available - use ambient instead
  'system.thinking': { file: 'ambient/forest-loop.mp3', duration: 3000, volume: -24, preload: false, loop: true, category: 'system' },
  
  // Celebration - use dramatic entrance for now (TODO: create proper celebration sounds)
  'celebration.small': { file: 'dramatic-entrance.mp3', duration: 1000, volume: -6, preload: false, category: 'celebration' },
  'celebration.big': { file: 'dramatic-entrance.mp3', duration: 1000, volume: -3, preload: false, category: 'celebration' },
  'celebration.milestone': { file: 'dramatic-entrance.mp3', duration: 1000, volume: -3, preload: false, category: 'celebration' },
  'celebration.streak': { file: 'dramatic-entrance.mp3', duration: 1000, volume: -6, preload: false, category: 'celebration' },
  'celebration.teamUnlock': { file: 'dramatic-entrance.mp3', duration: 1000, volume: -3, preload: false, category: 'celebration' },
  
  // Notification - use connect sound
  'notification.gentle': { file: 'connect.mp3', duration: 500, volume: -12, preload: true, category: 'notification' },
  'notification.thinkingOfYou': { file: 'connect.mp3', duration: 500, volume: -12, preload: false, category: 'notification' },
  
  // Error - use disconnect sound
  'error.graceful': { file: 'disconnect.mp3', duration: 500, volume: -12, preload: true, category: 'error' },
  
  // UI - use connect sound at lower volume (TODO: create proper UI sounds)
  'ui.buttonPress': { file: 'connect.mp3', duration: 500, volume: -18, preload: false, category: 'ui' },
  'ui.toggleOn': { file: 'connect.mp3', duration: 500, volume: -15, preload: false, category: 'ui' },
  'ui.toggleOff': { file: 'disconnect.mp3', duration: 500, volume: -15, preload: false, category: 'ui' },
  'ui.messageSent': { file: 'connect.mp3', duration: 500, volume: -15, preload: false, category: 'ui' },
  
  // Handoff - use existing handoff sounds
  'handoff.toFerni': { file: 'handoff-to-ferni.mp3', duration: 800, volume: -6, preload: false, category: 'handoff' },
  'handoff.toJack': { file: 'handoff-to-jack.mp3', duration: 800, volume: -6, preload: false, category: 'handoff' },
  'handoff.toPeter': { file: 'handoff-to-peter.mp3', duration: 800, volume: -6, preload: false, category: 'handoff' },
  'handoff.toAlex': { file: 'handoff-to-alex.mp3', duration: 800, volume: -6, preload: false, category: 'handoff' },
  'handoff.toMaya': { file: 'handoff-to-maya.mp3', duration: 800, volume: -6, preload: false, category: 'handoff' },
  'handoff.toJordan': { file: 'handoff-to-jordan.mp3', duration: 800, volume: -6, preload: false, category: 'handoff' },
  'handoff.toNayan': { file: 'handoff-to-nayan.mp3', duration: 800, volume: -6, preload: false, category: 'handoff' },
  
  // Persona Entrance - use dramatic entrance or handoff sounds
  'persona.ferni': { file: 'handoff-to-ferni.mp3', duration: 800, volume: -9, preload: false, category: 'persona' },
  'persona.jack': { file: 'handoff-to-jack.mp3', duration: 800, volume: -9, preload: false, category: 'persona' },
  'persona.peter': { file: 'handoff-to-peter.mp3', duration: 800, volume: -9, preload: false, category: 'persona' },
  'persona.alex': { file: 'handoff-to-alex.mp3', duration: 800, volume: -9, preload: false, category: 'persona' },
  'persona.maya': { file: 'handoff-to-maya.mp3', duration: 800, volume: -9, preload: false, category: 'persona' },
  'persona.jordan': { file: 'handoff-to-jordan.mp3', duration: 800, volume: -9, preload: false, category: 'persona' },
  'persona.nayan': { file: 'handoff-to-nayan.mp3', duration: 800, volume: -9, preload: false, category: 'persona' },
  
  // Cameo - existing sounds
  'cameo.arrive': { file: 'cameo-arrive.mp3', duration: 1000, volume: -6, preload: false, category: 'persona' },
  'cameo.return': { file: 'cameo-return.mp3', duration: 500, volume: -6, preload: false, category: 'persona' },
  
  // Ambient - existing loop sounds
  'ambient.forest': { file: 'ambient/forest-loop.mp3', duration: 10000, volume: -18, preload: false, loop: true, category: 'ambient' },
  'ambient.rain': { file: 'ambient/rain-loop.mp3', duration: 10000, volume: -18, preload: false, loop: true, category: 'ambient' },
  'ambient.fireplace': { file: 'ambient/fireplace-loop.mp3', duration: 10000, volume: -18, preload: false, loop: true, category: 'ambient' },
};

// ============================================================================
// AUDIO ENGINE
// ============================================================================

export class FerniAudioEngine {
  private config: AudioConfig;
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private categoryGains: Map<SoundCategory, GainNode> = new Map();
  
  private loadedSounds: Map<string, LoadedSound> = new Map();
  private activeSounds: Map<string, ActiveSound> = new Map();
  private loadingPromises: Map<string, Promise<void>> = new Map();
  
  // For ducking
  private ambientGain: GainNode | null = null;
  private isDucked: boolean = false;
  
  constructor(config: Partial<AudioConfig> = {}) {
    this.config = {
      enabled: true,
      masterVolume: 1,
      categoryVolumes: {},
      basePath: '/sounds/',
      respectSilentMode: true,
      ...config,
    };
    
    log.info('Audio engine initialized', { enabled: this.config.enabled });
  }
  
  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================
  
  /**
   * Initialize the audio context (must be called after user interaction)
   */
  async initialize(): Promise<void> {
    if (this.audioContext) return;
    
    try {
      this.audioContext = new AudioContext();
      
      // Create master gain
      this.masterGain = this.audioContext.createGain();
      this.masterGain.connect(this.audioContext.destination);
      this.setMasterVolume(this.config.masterVolume);
      
      // Create category gains
      const categories: SoundCategory[] = ['system', 'celebration', 'notification', 'error', 'ui', 'handoff', 'persona', 'ambient'];
      for (const category of categories) {
        const gain = this.audioContext.createGain();
        gain.connect(this.masterGain);
        this.categoryGains.set(category, gain);
        
        // Set initial category volume
        const vol = this.config.categoryVolumes[category] ?? 1;
        gain.gain.value = vol;
      }
      
      // Special ambient gain for ducking
      this.ambientGain = this.categoryGains.get('ambient') ?? null;
      
      log.info('Audio context initialized', { sampleRate: this.audioContext.sampleRate });
      
      // Preload critical sounds
      await this.preloadCritical();
      
    } catch (error) {
      log.error('Failed to initialize audio context', error);
      throw error;
    }
  }
  
  /**
   * Preload critical sounds
   */
  private async preloadCritical(): Promise<void> {
    const criticalSounds = Object.entries(SOUND_DEFINITIONS)
      .filter(([_, def]) => def.preload)
      .map(([id]) => id);
    
    log.info('Preloading critical sounds', { count: criticalSounds.length });
    
    await Promise.all(criticalSounds.map(id => this.loadSound(id)));
  }
  
  /**
   * Preload a specific group of sounds
   */
  async preloadGroup(soundIds: string[]): Promise<void> {
    await Promise.all(soundIds.map(id => this.loadSound(id)));
  }
  
  // ==========================================================================
  // LOADING
  // ==========================================================================
  
  /**
   * Load a sound by ID
   */
  private async loadSound(soundId: string): Promise<void> {
    // Already loaded
    if (this.loadedSounds.has(soundId)) return;
    
    // Already loading
    if (this.loadingPromises.has(soundId)) {
      await this.loadingPromises.get(soundId);
      return;
    }
    
    const definition = SOUND_DEFINITIONS[soundId];
    if (!definition) {
      log.warn('Unknown sound ID', { soundId });
      return;
    }
    
    const loadPromise = this.loadSoundBuffer(soundId, definition);
    this.loadingPromises.set(soundId, loadPromise);
    
    try {
      await loadPromise;
    } finally {
      this.loadingPromises.delete(soundId);
    }
  }
  
  // Track sounds that failed to load so we don't retry them
  private failedSounds: Set<string> = new Set();

  private async loadSoundBuffer(soundId: string, definition: SoundDefinition): Promise<void> {
    if (!this.audioContext) {
      log.warn('Audio context not initialized');
      return;
    }

    // Skip sounds that already failed - don't retry
    if (this.failedSounds.has(soundId)) {
      return;
    }

    try {
      const url = `${this.config.basePath}${definition.file}`;
      const response = await fetch(url);

      if (!response.ok) {
        // Mark as failed and log only once at debug level
        this.failedSounds.add(soundId);
        log.debug('Sound file not found (expected in dev)', { soundId, file: definition.file });
        return;
      }

      // Check content type - Vite returns HTML for 404s
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('audio') && !contentType.includes('octet-stream')) {
        this.failedSounds.add(soundId);
        log.debug('Sound file not valid audio (expected in dev)', { soundId, contentType });
        return;
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      this.loadedSounds.set(soundId, { buffer: audioBuffer, definition });
      log.debug('Sound loaded', { soundId, duration: audioBuffer.duration });

    } catch (error) {
      // Mark as failed so we don't spam the console
      this.failedSounds.add(soundId);
      // Only log at debug level - missing sounds are expected in development
      if (import.meta.env?.DEV) {
        log.debug('Sound unavailable (expected in dev)', { soundId });
      }
    }
  }
  
  // ==========================================================================
  // PLAYBACK
  // ==========================================================================
  
  /**
   * Play a sound by ID
   */
  async play(soundId: string, options: PlayOptions = {}): Promise<void> {
    if (!this.config.enabled) return;
    if (!this.audioContext || !this.masterGain) {
      log.warn('Audio not initialized, call initialize() first');
      return;
    }
    
    // Resume context if suspended
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    
    // Load if needed
    if (!this.loadedSounds.has(soundId)) {
      await this.loadSound(soundId);
    }
    
    const loaded = this.loadedSounds.get(soundId);
    if (!loaded) {
      log.warn('Sound not available', { soundId });
      return;
    }
    
    // Stop existing instance of this sound
    this.stop(soundId);
    
    // Create nodes
    const source = this.audioContext.createBufferSource();
    source.buffer = loaded.buffer;
    source.loop = options.loop ?? loaded.definition.loop ?? false;
    
    const gainNode = this.audioContext.createGain();
    
    // Calculate volume
    const baseVolumeDb = options.volume ?? loaded.definition.volume;
    const linearVolume = this.dbToLinear(baseVolumeDb);
    
    // Connect to category gain
    const categoryGain = this.categoryGains.get(loaded.definition.category);
    if (categoryGain) {
      gainNode.connect(categoryGain);
    } else {
      gainNode.connect(this.masterGain);
    }
    
    source.connect(gainNode);
    
    // Apply fade in
    if (options.fadeIn && options.fadeIn > 0) {
      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(linearVolume, this.audioContext.currentTime + options.fadeIn / 1000);
    } else {
      gainNode.gain.value = linearVolume;
    }
    
    // Track active sound
    const activeSound: ActiveSound = {
      source,
      gainNode,
      startTime: this.audioContext.currentTime,
      definition: loaded.definition,
    };
    this.activeSounds.set(soundId, activeSound);
    
    // Handle end
    source.onended = () => {
      this.activeSounds.delete(soundId);
      options.onEnd?.();
    };
    
    // Start playback
    source.start();
    
    log.debug('Playing sound', { soundId, volume: baseVolumeDb, loop: source.loop });
  }
  
  /**
   * Stop a specific sound
   */
  stop(soundId: string, fadeOut: number = 0): void {
    const active = this.activeSounds.get(soundId);
    if (!active || !this.audioContext) return;
    
    if (fadeOut > 0) {
      active.gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + fadeOut / 1000);
      setTimeout(() => {
        try {
          active.source.stop();
        } catch {
          // Ignore if already stopped
        }
      }, fadeOut);
    } else {
      try {
        active.source.stop();
      } catch {
        // Ignore if already stopped
      }
    }
    
    this.activeSounds.delete(soundId);
  }
  
  /**
   * Stop all sounds in a category
   */
  stopCategory(category: SoundCategory, fadeOut: number = 0): void {
    for (const [soundId, active] of this.activeSounds) {
      if (active.definition.category === category) {
        this.stop(soundId, fadeOut);
      }
    }
  }
  
  /**
   * Stop all sounds
   */
  stopAll(fadeOut: number = 0): void {
    for (const soundId of this.activeSounds.keys()) {
      this.stop(soundId, fadeOut);
    }
  }
  
  // ==========================================================================
  // DUCKING
  // ==========================================================================
  
  /**
   * Duck ambient sounds (reduce volume for speech/important sounds)
   */
  duck(duration: number = 300): void {
    if (!this.ambientGain || !this.audioContext || this.isDucked) return;
    
    const currentTime = this.audioContext.currentTime;
    this.ambientGain.gain.linearRampToValueAtTime(0.3, currentTime + duration / 1000);
    this.isDucked = true;
    
    log.debug('Ducking ambient');
  }
  
  /**
   * Unduck ambient sounds
   */
  unduck(duration: number = 500): void {
    if (!this.ambientGain || !this.audioContext || !this.isDucked) return;
    
    const currentTime = this.audioContext.currentTime;
    const targetVolume = this.config.categoryVolumes.ambient ?? 1;
    this.ambientGain.gain.linearRampToValueAtTime(targetVolume, currentTime + duration / 1000);
    this.isDucked = false;
    
    log.debug('Unducking ambient');
  }
  
  // ==========================================================================
  // VOLUME CONTROL
  // ==========================================================================
  
  /**
   * Set master volume (0-1)
   */
  setMasterVolume(volume: number): void {
    this.config.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain) {
      this.masterGain.gain.value = this.config.masterVolume;
    }
    log.debug('Master volume set', { volume: this.config.masterVolume });
  }
  
  /**
   * Set category volume (0-1)
   */
  setCategoryVolume(category: SoundCategory, volume: number): void {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    this.config.categoryVolumes[category] = clampedVolume;
    
    const gainNode = this.categoryGains.get(category);
    if (gainNode) {
      gainNode.gain.value = clampedVolume;
    }
    
    log.debug('Category volume set', { category, volume: clampedVolume });
  }
  
  /**
   * Mute/unmute all audio
   */
  setMuted(muted: boolean): void {
    this.config.enabled = !muted;
    if (muted) {
      this.stopAll(100);
    }
    log.info('Audio muted', { muted });
  }
  
  // ==========================================================================
  // HELPERS
  // ==========================================================================
  
  private dbToLinear(db: number): number {
    return Math.pow(10, db / 20);
  }
  
  /**
   * Check if a sound is currently playing
   */
  isPlaying(soundId: string): boolean {
    return this.activeSounds.has(soundId);
  }
  
  /**
   * Get list of available sounds
   */
  getAvailableSounds(): string[] {
    return Object.keys(SOUND_DEFINITIONS);
  }
  
  /**
   * Get sound definition
   */
  getSoundDefinition(soundId: string): SoundDefinition | undefined {
    return SOUND_DEFINITIONS[soundId];
  }
  
  /**
   * Get current configuration
   */
  getConfig(): AudioConfig {
    return { ...this.config };
  }
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<AudioConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (config.masterVolume !== undefined) {
      this.setMasterVolume(config.masterVolume);
    }
    
    if (config.categoryVolumes) {
      for (const [category, volume] of Object.entries(config.categoryVolumes)) {
        this.setCategoryVolume(category as SoundCategory, volume);
      }
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let audioEngineInstance: FerniAudioEngine | null = null;

/**
 * Get the audio engine singleton
 */
export function getFerniAudioEngine(config?: Partial<AudioConfig>): FerniAudioEngine {
  if (!audioEngineInstance) {
    audioEngineInstance = new FerniAudioEngine(config);
  }
  return audioEngineInstance;
}

/**
 * Reset the audio engine (for testing)
 */
export function resetFerniAudioEngine(): void {
  if (audioEngineInstance) {
    audioEngineInstance.stopAll();
  }
  audioEngineInstance = null;
}

