/**
 * Avatar State Service
 * 
 * Central state manager for avatar animations and visual feedback.
 * Integrates glow controller, animation states, and voice sync.
 * 
 * @module @ferni/avatar-state
 */

import { createLogger } from '../utils/logger.js';
import { getGlowController } from './glow-controller.service.js';
import { HapticsService } from './haptics.service.js';
import { DURATION, EASING } from '../config/animation-constants.js';

const log = createLogger('AvatarState');

// ============================================================================
// TYPES
// ============================================================================

type PersonaId = 'ferni' | 'jack' | 'peter' | 'alex' | 'maya' | 'jordan' | 'nayan';

export type AvatarState = 
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'celebrating'
  | 'transitioning'
  | 'error'
  | 'offline';

export interface AvatarStateConfig {
  /** The avatar element to animate */
  avatarElement: HTMLElement;
  
  /** The glow/ring element around avatar */
  glowElement?: HTMLElement;
  
  /** Container element for positioning */
  containerElement?: HTMLElement;
  
  /** Enable voice amplitude sync */
  voiceSync?: boolean;
  
  /** Enable haptic feedback */
  hapticsEnabled?: boolean;
}

interface StateTransition {
  from: AvatarState;
  to: AvatarState;
  duration: number;
  easing: string;
}

// ============================================================================
// STATE DEFINITIONS
// ============================================================================

const STATE_STYLES: Record<AvatarState, Partial<CSSStyleDeclaration>> = {
  idle: {
    transform: 'scale(1)',
    opacity: '1',
    filter: 'none',
  },
  connecting: {
    transform: 'scale(0.95)',
    opacity: '0.9',
  },
  connected: {
    transform: 'scale(1)',
    opacity: '1',
  },
  listening: {
    transform: 'scale(1.02)',
    opacity: '1',
  },
  thinking: {
    transform: 'scale(0.98)',
    opacity: '0.95',
  },
  speaking: {
    transform: 'scale(1)',
    opacity: '1',
  },
  celebrating: {
    transform: 'scale(1.05)',
    opacity: '1',
  },
  transitioning: {
    transform: 'scale(0.9)',
    opacity: '0.7',
  },
  error: {
    transform: 'scale(1)',
    opacity: '0.8',
  },
  offline: {
    transform: 'scale(0.95)',
    opacity: '0.6',
    filter: 'grayscale(0.3)',
  },
};

// ============================================================================
// AVATAR STATE SERVICE
// ============================================================================

export class AvatarStateService {
  private config: AvatarStateConfig;
  private currentState: AvatarState = 'idle';
  private currentPersona: PersonaId = 'ferni';
  private isInitialized: boolean = false;
  
  // Animation state
  private breathingAnimation: Animation | null = null;
  private stateAnimation: Animation | null = null;
  private voiceAmplitude: number = 0;
  private animationFrame: number | null = null;
  
  // Glow integration
  private glowController = getGlowController();
  private haptics = HapticsService.getInstance();
  
  constructor(config: AvatarStateConfig) {
    this.config = {
      voiceSync: true,
      hapticsEnabled: true,
      ...config,
    };
    
    log.debug('AvatarStateService created');
  }
  
  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================
  
  /**
   * Initialize the avatar state service
   */
  initialize(): void {
    if (this.isInitialized) return;
    
    // Attach glow controller to glow element
    if (this.config.glowElement) {
      this.glowController.attach(this.config.glowElement);
    }
    
    // Start breathing animation
    this.startBreathing();
    
    // Start glow breathing
    this.glowController.startBreathing();
    
    this.isInitialized = true;
    log.info('Avatar state service initialized');
  }
  
  /**
   * Cleanup and detach
   */
  destroy(): void {
    this.stopBreathing();
    this.glowController.detach();
    
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    
    this.isInitialized = false;
    log.info('Avatar state service destroyed');
  }
  
  // ==========================================================================
  // STATE MANAGEMENT
  // ==========================================================================
  
  /**
   * Get current state
   */
  getState(): AvatarState {
    return this.currentState;
  }
  
  /**
   * Set avatar state with animation
   */
  async setState(newState: AvatarState): Promise<void> {
    if (newState === this.currentState) return;
    
    const previousState = this.currentState;
    this.currentState = newState;
    
    log.debug('State change', { from: previousState, to: newState });
    
    // Update glow state
    this.syncGlowState(newState);
    
    // Animate avatar transition
    await this.animateStateTransition(previousState, newState);
    
    // Play haptic feedback if appropriate
    if (this.config.hapticsEnabled) {
      this.playStateHaptic(newState);
    }
    
    // Dispatch event
    this.dispatchStateChange(previousState, newState);
  }
  
  /**
   * Sync glow controller with avatar state
   */
  private syncGlowState(state: AvatarState): void {
    switch (state) {
      case 'listening':
        this.glowController.setListening(true);
        this.glowController.setSpeaking(false);
        this.glowController.setThinking(false);
        break;
        
      case 'speaking':
        this.glowController.setSpeaking(true);
        this.glowController.setListening(false);
        this.glowController.setThinking(false);
        break;
        
      case 'thinking':
        this.glowController.setThinking(true);
        this.glowController.setSpeaking(false);
        this.glowController.setListening(false);
        break;
        
      case 'celebrating':
        this.glowController.celebrate(DURATION.CELEBRATION);
        break;
        
      case 'idle':
      case 'connected':
        this.glowController.setListening(false);
        this.glowController.setSpeaking(false);
        this.glowController.setThinking(false);
        break;
        
      case 'offline':
      case 'error':
        this.glowController.stopAnimation();
        break;
    }
  }
  
  /**
   * Animate state transition
   */
  private async animateStateTransition(from: AvatarState, to: AvatarState): Promise<void> {
    const element = this.config.avatarElement;
    if (!element) return;
    
    // Cancel existing animation
    if (this.stateAnimation) {
      this.stateAnimation.cancel();
    }
    
    const fromStyles = STATE_STYLES[from];
    const toStyles = STATE_STYLES[to];
    
    // Build keyframes
    const keyframes: Keyframe[] = [
      {
        transform: fromStyles.transform,
        opacity: fromStyles.opacity,
        filter: fromStyles.filter,
      },
      {
        transform: toStyles.transform,
        opacity: toStyles.opacity,
        filter: toStyles.filter,
      },
    ];
    
    // Determine duration based on transition type
    let duration = DURATION.NORMAL;
    let easing = EASING.STANDARD;
    
    if (to === 'celebrating') {
      duration = DURATION.SLOW;
      easing = EASING.SPRING;
    } else if (to === 'transitioning') {
      duration = DURATION.MODERATE;
      easing = EASING.GENTLE;
    } else if (to === 'error' || to === 'offline') {
      duration = DURATION.SLOW;
      easing = EASING.GENTLE;
    }
    
    this.stateAnimation = element.animate(keyframes, {
      duration,
      easing,
      fill: 'forwards',
    });
    
    await this.stateAnimation.finished;
  }
  
  /**
   * Play haptic feedback for state
   */
  private playStateHaptic(state: AvatarState): void {
    switch (state) {
      case 'connected':
        this.haptics.play('presence');
        break;
      case 'listening':
        this.haptics.play('softTap');
        break;
      case 'celebrating':
        this.haptics.play('celebration');
        break;
      case 'error':
        this.haptics.play('error');
        break;
    }
  }
  
  /**
   * Dispatch state change event
   */
  private dispatchStateChange(from: AvatarState, to: AvatarState): void {
    document.dispatchEvent(new CustomEvent('ferni:avatar-state-change', {
      detail: { from, to, persona: this.currentPersona },
    }));
  }
  
  // ==========================================================================
  // PERSONA MANAGEMENT
  // ==========================================================================
  
  /**
   * Set current persona
   */
  setPersona(personaId: PersonaId): void {
    if (personaId === this.currentPersona) return;
    
    this.currentPersona = personaId;
    this.glowController.switchPersona(personaId, DURATION.SLOW);
    
    log.info('Persona changed', { personaId });
  }
  
  /**
   * Get current persona
   */
  getPersona(): PersonaId {
    return this.currentPersona;
  }
  
  // ==========================================================================
  // VOICE SYNC
  // ==========================================================================
  
  /**
   * Update voice amplitude for visual sync
   */
  updateVoiceAmplitude(amplitude: number): void {
    this.voiceAmplitude = Math.max(0, Math.min(1, amplitude));
    this.glowController.updateVoiceAmplitude(this.voiceAmplitude);
    
    // Also update avatar scale slightly for "breathing to speech"
    if (this.currentState === 'speaking' && this.config.avatarElement) {
      const scale = 1 + (this.voiceAmplitude * 0.03);
      this.config.avatarElement.style.transform = `scale(${scale})`;
    }
  }
  
  // ==========================================================================
  // BREATHING ANIMATION
  // ==========================================================================
  
  /**
   * Start idle breathing animation
   */
  private startBreathing(): void {
    if (this.breathingAnimation) return;
    
    const element = this.config.avatarElement;
    if (!element) return;
    
    // Check for reduced motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    
    this.breathingAnimation = element.animate([
      { transform: 'scale(1)' },
      { transform: 'scale(1.015)' },
      { transform: 'scale(1)' },
    ], {
      duration: 5000,
      easing: 'ease-in-out',
      iterations: Infinity,
    });
  }
  
  /**
   * Stop breathing animation
   */
  private stopBreathing(): void {
    if (this.breathingAnimation) {
      this.breathingAnimation.cancel();
      this.breathingAnimation = null;
    }
  }
  
  /**
   * Pause breathing (during other animations)
   */
  pauseBreathing(): void {
    if (this.breathingAnimation) {
      this.breathingAnimation.pause();
    }
  }
  
  /**
   * Resume breathing
   */
  resumeBreathing(): void {
    if (this.breathingAnimation) {
      this.breathingAnimation.play();
    }
  }
  
  // ==========================================================================
  // REACTIONS
  // ==========================================================================
  
  /**
   * Play a quick reaction animation
   */
  async playReaction(type: 'nod' | 'shake' | 'bounce' | 'pulse'): Promise<void> {
    const element = this.config.avatarElement;
    if (!element) return;
    
    // Pause breathing during reaction
    this.pauseBreathing();
    
    let keyframes: Keyframe[];
    let duration: number;
    let easing: string;
    
    switch (type) {
      case 'nod':
        keyframes = [
          { transform: 'translateY(0) rotate(0)' },
          { transform: 'translateY(3px) rotate(2deg)' },
          { transform: 'translateY(0) rotate(0)' },
          { transform: 'translateY(2px) rotate(1deg)' },
          { transform: 'translateY(0) rotate(0)' },
        ];
        duration = DURATION.MODERATE;
        easing = EASING.GENTLE;
        break;
        
      case 'shake':
        keyframes = [
          { transform: 'translateX(0)' },
          { transform: 'translateX(-4px)' },
          { transform: 'translateX(4px)' },
          { transform: 'translateX(-3px)' },
          { transform: 'translateX(3px)' },
          { transform: 'translateX(0)' },
        ];
        duration = DURATION.SLOW;
        easing = EASING.GENTLE;
        break;
        
      case 'bounce':
        keyframes = [
          { transform: 'scale(1) translateY(0)' },
          { transform: 'scale(0.95) translateY(3px)' },
          { transform: 'scale(1.05) translateY(-8px)' },
          { transform: 'scale(1) translateY(0)' },
        ];
        duration = DURATION.SLOW;
        easing = EASING.SPRING;
        break;
        
      case 'pulse':
        keyframes = [
          { transform: 'scale(1)' },
          { transform: 'scale(1.08)' },
          { transform: 'scale(1)' },
        ];
        duration = DURATION.NORMAL;
        easing = EASING.SPRING;
        break;
    }
    
    const animation = element.animate(keyframes, {
      duration,
      easing,
      fill: 'forwards',
    });
    
    await animation.finished;
    
    // Resume breathing
    this.resumeBreathing();
    
    // Trigger glow pulse for visual emphasis
    this.glowController.celebrate(duration);
    
    // Haptic feedback
    if (this.config.hapticsEnabled) {
      if (type === 'nod') {
        this.haptics.play('acknowledgment');
      } else if (type === 'bounce') {
        this.haptics.play('success');
      }
    }
  }
  
  // ==========================================================================
  // CONVENIENCE METHODS
  // ==========================================================================
  
  /**
   * Quick state setters
   */
  setIdle(): Promise<void> { return this.setState('idle'); }
  setConnecting(): Promise<void> { return this.setState('connecting'); }
  setConnected(): Promise<void> { return this.setState('connected'); }
  setListening(): Promise<void> { return this.setState('listening'); }
  setThinking(): Promise<void> { return this.setState('thinking'); }
  setSpeaking(): Promise<void> { return this.setState('speaking'); }
  setCelebrating(): Promise<void> { return this.setState('celebrating'); }
  setError(): Promise<void> { return this.setState('error'); }
  setOffline(): Promise<void> { return this.setState('offline'); }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let avatarStateInstance: AvatarStateService | null = null;

export function getAvatarStateService(): AvatarStateService | null {
  return avatarStateInstance;
}

export function initAvatarStateService(config: AvatarStateConfig): AvatarStateService {
  if (avatarStateInstance) {
    avatarStateInstance.destroy();
  }
  
  avatarStateInstance = new AvatarStateService(config);
  avatarStateInstance.initialize();
  
  return avatarStateInstance;
}

export function resetAvatarStateService(): void {
  if (avatarStateInstance) {
    avatarStateInstance.destroy();
  }
  avatarStateInstance = null;
}

