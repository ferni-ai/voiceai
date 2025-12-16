/**
 * Ferni Synesthesia Controller
 * 
 * Synchronizes voice, visuals, and sound in real-time
 * to create a unified, emotional experience.
 * 
 * "When voice, sight, and sound move as one, the AI becomes truly present."
 * 
 * @module @ferni/synesthesia
 */

import { createLogger } from '../utils/logger.js';
import type { PersonaId } from '../types/personas.js';

const log = createLogger('Synesthesia');

// ============================================================================
// TYPES
// ============================================================================

export type EmotionType = 
  | 'happy'
  | 'sad'
  | 'anxious'
  | 'frustrated'
  | 'thoughtful'
  | 'excited'
  | 'neutral';

export type ConversationState =
  | 'idle'
  | 'user_speaking'
  | 'ai_speaking'
  | 'ai_thinking'
  | 'celebrating'
  | 'transitioning_persona';

export interface SynesthesiaConfig {
  /** Master enable/disable */
  enabled: boolean;
  
  /** Avatar animations enabled */
  avatarEnabled: boolean;
  
  /** Ambient sound enabled */
  ambientEnabled: boolean;
  
  /** Glow effects enabled */
  glowEnabled: boolean;
  
  /** Debug mode shows visual indicators */
  debug: boolean;
  
  /** Respect prefers-reduced-motion */
  respectReducedMotion: boolean;
}

export interface AvatarState {
  breathingRate: number;      // ms per breath cycle
  pose: 'neutral' | 'listening' | 'speaking' | 'thinking' | 'excited';
  glowIntensity: number;      // 0-1
  glowColor: string;          // CSS color
  warmth: number;             // Color temperature shift -1 to 1
}

export interface AmbientState {
  volume: number;             // dB
  mood: 'calm' | 'attentive' | 'warm' | 'energetic';
  emotionalLayer: EmotionType;
  emotionalIntensity: number; // 0-1
}

interface PersonaSynesthesiaProfile {
  glowColor: string;
  breathingBase: number;      // Base breathing rate ms
  reactionStyle: 'warm' | 'wise' | 'curious' | 'empathetic' | 'efficient' | 'joyful' | 'deep';
  ambientMood: AmbientState['mood'];
  audioSignature: string;
}

// ============================================================================
// PERSONA PROFILES
// ============================================================================

const PERSONA_PROFILES: Record<PersonaId, PersonaSynesthesiaProfile> = {
  'ferni': {
    glowColor: '#4a6741',
    breathingBase: 5000,
    reactionStyle: 'warm',
    ambientMood: 'calm',
    audioSignature: 'felt-piano',
  },
  'peter-john': {
    glowColor: '#3a6b73',
    breathingBase: 4000,
    reactionStyle: 'curious',
    ambientMood: 'energetic',
    audioSignature: 'bright-clear',
  },
  'alex-chen': {
    glowColor: '#5a6b8a',
    breathingBase: 5000,
    reactionStyle: 'empathetic',
    ambientMood: 'calm',
    audioSignature: 'bell-like',
  },
  'maya-santos': {
    glowColor: '#a67a6a',
    breathingBase: 4500,
    reactionStyle: 'efficient',
    ambientMood: 'attentive',
    audioSignature: 'rhythmic',
  },
  'jordan-taylor': {
    glowColor: '#c4856a',
    breathingBase: 3500,
    reactionStyle: 'joyful',
    ambientMood: 'energetic',
    audioSignature: 'sparkle',
  },
  'nayan-patel': {
    glowColor: '#8a7a6a',
    breathingBase: 5500,
    reactionStyle: 'deep',
    ambientMood: 'calm',
    audioSignature: 'full-resonant',
  },
};

// ============================================================================
// AMPLITUDE TO BREATHING MAPPING
// ============================================================================

const AMPLITUDE_BREATHING_MAP = {
  silent: 5000,     // 5s breath cycle
  low: 4000,        // 4s cycle
  medium: 3000,     // 3s cycle
  high: 2000,       // 2s cycle
  emphatic: 1500,   // 1.5s cycle + glow pulse
};

const AMBIENT_LEVELS = {
  idle: -24,
  user_speaking: -30,
  ai_speaking: -27,
  emotional: -21,
  celebration: -18,
};

// ============================================================================
// SYNESTHESIA CONTROLLER
// ============================================================================

export class SynesthesiaController {
  private config: SynesthesiaConfig;
  private currentPersona: PersonaId = 'ferni';
  private conversationState: ConversationState = 'idle';
  private currentEmotion: EmotionType = 'neutral';
  private emotionIntensity: number = 0;
  
  // Current states
  private avatarState: AvatarState;
  private ambientState: AmbientState;
  
  // Animation frame handle
  private animationFrame: number | null = null;
  // Used for timing updates, reserved for future frame-rate-independent animations
  private lastUpdate: number = 0;
  
  // External controllers (injected)
  private avatarController?: AvatarController;
  private ambientController?: AmbientController;
  private glowController?: GlowController;
  
  // Audio analysis
  private audioAnalyzer?: AudioAnalyzer;
  
  constructor(config: Partial<SynesthesiaConfig> = {}) {
    this.config = {
      enabled: true,
      avatarEnabled: true,
      ambientEnabled: true,
      glowEnabled: true,
      debug: false,
      respectReducedMotion: true,
      ...config,
    };
    
    // Initialize states
    const profile = PERSONA_PROFILES[this.currentPersona];
    this.avatarState = {
      breathingRate: profile.breathingBase,
      pose: 'neutral',
      glowIntensity: 0.4,
      glowColor: profile.glowColor,
      warmth: 0,
    };
    
    this.ambientState = {
      volume: AMBIENT_LEVELS.idle,
      mood: profile.ambientMood,
      emotionalLayer: 'neutral',
      emotionalIntensity: 0,
    };
    
    // Check reduced motion preference
    if (this.config.respectReducedMotion && this.prefersReducedMotion()) {
      this.config.avatarEnabled = false;
      this.config.glowEnabled = false;
      log.info('Reduced motion detected, disabling animations');
    }
    
    log.info('Synesthesia controller initialized', { persona: this.currentPersona });
  }
  
  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================
  
  /**
   * Start the synesthesia update loop
   */
  start(): void {
    if (this.animationFrame) return;
    
    this.lastUpdate = performance.now();
    this.animationFrame = requestAnimationFrame(this.update.bind(this));
    log.info('Synesthesia started');
  }
  
  /**
   * Stop the synesthesia update loop
   */
  stop(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    log.info('Synesthesia stopped');
  }
  
  /**
   * Main update loop (60fps)
   */
  private update(currentTime: number): void {
    // Update timing for frame tracking
    void (currentTime - this.lastUpdate); // Calculate deltaTime (unused but keeps lastUpdate marked as read)
    this.lastUpdate = currentTime;
    
    if (!this.config.enabled) {
      this.animationFrame = requestAnimationFrame(this.update.bind(this));
      return;
    }
    
    // Update based on audio analysis
    if (this.audioAnalyzer) {
      this.updateFromAudio();
    }
    
    // Apply states to controllers
    this.applyAvatarState();
    this.applyAmbientState();
    this.applyGlowState();
    
    // Continue loop
    this.animationFrame = requestAnimationFrame(this.update.bind(this));
  }
  
  // ==========================================================================
  // SERVICE INJECTION
  // ==========================================================================
  
  /**
   * Inject external controllers
   */
  injectControllers(controllers: {
    avatar?: AvatarController;
    ambient?: AmbientController;
    glow?: GlowController;
    audioAnalyzer?: AudioAnalyzer;
  }): void {
    if (controllers.avatar) this.avatarController = controllers.avatar;
    if (controllers.ambient) this.ambientController = controllers.ambient;
    if (controllers.glow) this.glowController = controllers.glow;
    if (controllers.audioAnalyzer) this.audioAnalyzer = controllers.audioAnalyzer;
    
    log.debug('Controllers injected', {
      avatar: !!this.avatarController,
      ambient: !!this.ambientController,
      glow: !!this.glowController,
      audioAnalyzer: !!this.audioAnalyzer,
    });
  }
  
  // ==========================================================================
  // STATE SETTERS
  // ==========================================================================
  
  /**
   * Set current persona (triggers transition)
   */
  setPersona(personaId: PersonaId): void {
    if (personaId === this.currentPersona) return;
    
    const previousPersona = this.currentPersona;
    this.currentPersona = personaId;
    this.conversationState = 'transitioning_persona';
    
    const profile = PERSONA_PROFILES[personaId];
    
    // Transition avatar state
    this.avatarState = {
      ...this.avatarState,
      breathingRate: profile.breathingBase,
      glowColor: profile.glowColor,
    };
    
    // Transition ambient state
    this.ambientState = {
      ...this.ambientState,
      mood: profile.ambientMood,
    };
    
    log.info('Persona changed', { from: previousPersona, to: personaId });
    
    // Reset conversation state after transition
    setTimeout(() => {
      if (this.conversationState === 'transitioning_persona') {
        this.conversationState = 'idle';
      }
    }, 1000);
  }
  
  /**
   * Set conversation state
   */
  setConversationState(state: ConversationState): void {
    if (state === this.conversationState) return;
    
    this.conversationState = state;
    
    // Update ambient volume based on state
    this.ambientState.volume = AMBIENT_LEVELS[state as keyof typeof AMBIENT_LEVELS] ?? AMBIENT_LEVELS.idle;
    
    // Update avatar pose based on state
    const poseMap: Record<ConversationState, AvatarState['pose']> = {
      idle: 'neutral',
      user_speaking: 'listening',
      ai_speaking: 'speaking',
      ai_thinking: 'thinking',
      celebrating: 'excited',
      transitioning_persona: 'neutral',
    };
    this.avatarState.pose = poseMap[state];
    
    log.debug('Conversation state changed', { state });
  }
  
  /**
   * Set emotional context
   */
  setEmotionalContext(emotion: EmotionType, intensity: number = 0.5): void {
    this.currentEmotion = emotion;
    this.emotionIntensity = Math.max(0, Math.min(1, intensity));
    
    this.ambientState.emotionalLayer = emotion;
    this.ambientState.emotionalIntensity = this.emotionIntensity;
    
    // Adjust glow warmth based on emotion
    const warmthMap: Record<EmotionType, number> = {
      happy: 0.3,
      excited: 0.4,
      neutral: 0,
      thoughtful: -0.1,
      sad: -0.3,
      anxious: -0.2,
      frustrated: -0.1,
    };
    this.avatarState.warmth = warmthMap[emotion] * intensity;
    
    // Adjust ambient volume for emotional moments
    if (emotion !== 'neutral' && intensity > 0.5) {
      this.ambientState.volume = AMBIENT_LEVELS.emotional;
    }
    
    log.debug('Emotional context set', { emotion, intensity });
  }
  
  // ==========================================================================
  // AUDIO ANALYSIS
  // ==========================================================================
  
  /**
   * Update from audio analysis
   */
  private updateFromAudio(): void {
    if (!this.audioAnalyzer) return;
    
    const amplitude = this.audioAnalyzer.getAmplitude();
    // const pace = this.audioAnalyzer.getSpeechPace(); // Reserved for future speech pace visualization
    
    // Map amplitude to breathing rate
    let breathingRate: number;
    if (amplitude < 0.1) {
      breathingRate = AMPLITUDE_BREATHING_MAP.silent;
    } else if (amplitude < 0.3) {
      breathingRate = AMPLITUDE_BREATHING_MAP.low;
    } else if (amplitude < 0.6) {
      breathingRate = AMPLITUDE_BREATHING_MAP.medium;
    } else if (amplitude < 0.8) {
      breathingRate = AMPLITUDE_BREATHING_MAP.high;
    } else {
      breathingRate = AMPLITUDE_BREATHING_MAP.emphatic;
      // Trigger glow pulse for emphatic speech
      if (this.glowController) {
        this.glowController.pulse();
      }
    }
    
    // Apply persona modifier
    const profile = PERSONA_PROFILES[this.currentPersona];
    const modifier = profile.breathingBase / 5000; // Normalize to Ferni's base
    this.avatarState.breathingRate = breathingRate * modifier;
    
    // Adjust glow intensity based on amplitude
    this.avatarState.glowIntensity = 0.3 + (amplitude * 0.4);
  }
  
  // ==========================================================================
  // STATE APPLICATION
  // ==========================================================================
  
  private applyAvatarState(): void {
    if (!this.config.avatarEnabled || !this.avatarController) return;
    
    this.avatarController.setBreathingRate(this.avatarState.breathingRate);
    this.avatarController.setPose(this.avatarState.pose);
  }
  
  private applyAmbientState(): void {
    if (!this.config.ambientEnabled || !this.ambientController) return;
    
    this.ambientController.setVolume(this.ambientState.volume);
    this.ambientController.setMood(this.ambientState.mood);
    this.ambientController.setEmotionalLayer(
      this.ambientState.emotionalLayer,
      this.ambientState.emotionalIntensity
    );
  }
  
  private applyGlowState(): void {
    if (!this.config.glowEnabled || !this.glowController) return;
    
    this.glowController.setIntensity(this.avatarState.glowIntensity);
    this.glowController.setColor(this.avatarState.glowColor);
    this.glowController.setWarmth(this.avatarState.warmth);
  }
  
  // ==========================================================================
  // REACTIONS
  // ==========================================================================
  
  /**
   * Trigger a specific reaction
   */
  triggerReaction(reaction: 'nod' | 'bounce' | 'pulse' | 'shake' | 'warm'): void {
    if (!this.avatarController) return;
    
    log.debug('Triggering reaction', { reaction });
    this.avatarController.triggerReaction(reaction);
  }
  
  /**
   * Trigger celebration
   */
  triggerCelebration(magnitude: 'small' | 'medium' | 'large'): void {
    this.setConversationState('celebrating');
    
    if (this.avatarController) {
      this.avatarController.triggerReaction('bounce');
    }
    
    if (this.glowController) {
      const intensity = magnitude === 'small' ? 0.6 : magnitude === 'medium' ? 0.8 : 1;
      this.glowController.celebrationPulse(intensity);
    }
    
    // Return to previous state
    setTimeout(() => {
      this.setConversationState('idle');
    }, magnitude === 'small' ? 1500 : magnitude === 'medium' ? 2500 : 3500);
    
    log.info('Celebration triggered', { magnitude });
  }
  
  // ==========================================================================
  // UTILITIES
  // ==========================================================================
  
  private prefersReducedMotion(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  
  /**
   * Get current state (for debugging)
   */
  getState(): {
    persona: PersonaId;
    conversationState: ConversationState;
    emotion: EmotionType;
    avatar: AvatarState;
    ambient: AmbientState;
  } {
    return {
      persona: this.currentPersona,
      conversationState: this.conversationState,
      emotion: this.currentEmotion,
      avatar: { ...this.avatarState },
      ambient: { ...this.ambientState },
    };
  }
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<SynesthesiaConfig>): void {
    this.config = { ...this.config, ...config };
    log.info('Config updated', { enabled: this.config.enabled });
  }
}

// ============================================================================
// CONTROLLER INTERFACES
// ============================================================================

export interface AvatarController {
  setBreathingRate(rate: number): void;
  setPose(pose: AvatarState['pose']): void;
  triggerReaction(reaction: 'nod' | 'bounce' | 'pulse' | 'shake' | 'warm'): void;
}

export interface AmbientController {
  setVolume(volume: number): void;
  setMood(mood: AmbientState['mood']): void;
  setEmotionalLayer(emotion: EmotionType, intensity: number): void;
}

export interface GlowController {
  setIntensity(intensity: number): void;
  setColor(color: string): void;
  setWarmth(warmth: number): void;
  pulse(): void;
  celebrationPulse(intensity: number): void;
}

export interface AudioAnalyzer {
  getAmplitude(): number;
  getFrequencyData(): Uint8Array;
  getSpeechPace(): 'slow' | 'normal' | 'fast';
  getEmotionalTone(): EmotionType;
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let synesthesiaInstance: SynesthesiaController | null = null;

/**
 * Get the synesthesia controller singleton
 */
export function getSynesthesiaController(config?: Partial<SynesthesiaConfig>): SynesthesiaController {
  if (!synesthesiaInstance) {
    synesthesiaInstance = new SynesthesiaController(config);
  }
  return synesthesiaInstance;
}

/**
 * Reset the synesthesia controller (for testing)
 */
export function resetSynesthesiaController(): void {
  if (synesthesiaInstance) {
    synesthesiaInstance.stop();
  }
  synesthesiaInstance = null;
}

