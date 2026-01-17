/**
 * Avatar State Service
 *
 * Central state manager for avatar animations and visual feedback.
 * Integrates glow controller, animation states, and voice sync.
 *
 * @module @ferni/avatar-state
 */

import {
  AVATAR_SQUASH_STRETCH,
  DURATION,
  EASING,
  PERSONA_ANIMATION_PROFILES,
} from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { getGlowController } from './glow-controller.service.js';
import { getHapticsService } from './haptics.service.js';

const log = createLogger('AvatarState');

// ============================================================================
// TYPES
// ============================================================================

type PersonaId = 'ferni' | 'jack' | 'peter' | 'alex' | 'maya' | 'jordan' | 'nayan';

// Map short persona IDs to full design system profile keys
const PERSONA_ID_TO_PROFILE_KEY: Record<
  PersonaId,
  keyof typeof PERSONA_ANIMATION_PROFILES | 'ferni'
> = {
  ferni: 'ferni',
  jack: 'ferni', // Jack uses Ferni's timing (wise, grounded)
  peter: 'peter-john',
  alex: 'alex-chen',
  maya: 'maya-santos',
  jordan: 'jordan-taylor',
  nayan: 'ferni', // Nayan uses Ferni's timing
};

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

// StateTransition type - for future use in transition history tracking
// interface StateTransition {
//   from: AvatarState;
//   to: AvatarState;
//   duration: number;
//   easing: string;
// }

// ============================================================================
// STATE DEFINITIONS
// ============================================================================

/**
 * STATE_STYLES - Pixar-Quality Squash & Stretch for Avatar States
 *
 * Using AVATAR_SQUASH_STRETCH from design tokens for Pixar-inspired
 * state transformations. Each state has distinct shape/weight.
 *
 * Principle: scaleX and scaleY change INVERSELY (volume preservation)
 * - Speaking: More stretched vertically (energetic)
 * - Listening: Slight stretch (attentive lean)
 * - Idle: Subtle squash (grounded, relaxed)
 * - Connected: Between idle and speaking (ready)
 */
const STATE_STYLES: Record<AvatarState, Partial<CSSStyleDeclaration>> = {
  idle: {
    // Grounded, relaxed - subtle squash for "at rest" feeling
    transform: `scaleX(${AVATAR_SQUASH_STRETCH.idle.scaleX}) scaleY(${AVATAR_SQUASH_STRETCH.idle.scaleY}) translateY(${AVATAR_SQUASH_STRETCH.idle.translateY}px) rotate(${AVATAR_SQUASH_STRETCH.idle.rotate}deg)`,
    opacity: '1',
    filter: 'none',
  },
  connecting: {
    // Anticipation squash - preparing to spring into connected state
    transform: 'scaleX(1.03) scaleY(0.97) translateY(2px)',
    opacity: '0.9',
  },
  connected: {
    // Ready, alert - slight vertical stretch shows "awake"
    transform: `scaleX(${AVATAR_SQUASH_STRETCH.connected.scaleX}) scaleY(${AVATAR_SQUASH_STRETCH.connected.scaleY}) translateY(${AVATAR_SQUASH_STRETCH.connected.translateY}px) rotate(${AVATAR_SQUASH_STRETCH.connected.rotate}deg)`,
    opacity: '1',
  },
  listening: {
    // Attentive lean - slight stretch and tilt toward user
    transform: `scaleX(${AVATAR_SQUASH_STRETCH.listening.scaleX}) scaleY(${AVATAR_SQUASH_STRETCH.listening.scaleY}) translateY(${AVATAR_SQUASH_STRETCH.listening.translateY}px) rotate(${AVATAR_SQUASH_STRETCH.listening.rotate}deg)`,
    opacity: '1',
  },
  thinking: {
    // Processing - slight compression, like weight of thought
    transform: 'scaleX(1.01) scaleY(0.99) translateY(1px) rotate(1.5deg)',
    opacity: '0.95',
  },
  speaking: {
    // Energetic, expressive - more vertical stretch
    transform: `scaleX(${AVATAR_SQUASH_STRETCH.speaking.scaleX}) scaleY(${AVATAR_SQUASH_STRETCH.speaking.scaleY}) translateY(${AVATAR_SQUASH_STRETCH.speaking.translateY}px) rotate(${AVATAR_SQUASH_STRETCH.speaking.rotate}deg)`,
    opacity: '1',
  },
  celebrating: {
    // Joyful bounce peak - maximum stretch
    transform: 'scaleX(0.92) scaleY(1.1) translateY(-8px)',
    opacity: '1',
  },
  transitioning: {
    // Squash during persona transition - preparing for change
    transform: 'scaleX(1.05) scaleY(0.95) translateY(3px)',
    opacity: '0.7',
  },
  error: {
    // Slightly deflated - sadness squash
    transform: 'scaleX(1.02) scaleY(0.98) translateY(2px)',
    opacity: '0.8',
  },
  offline: {
    // Heavy, weighted - slumped posture
    transform: 'scaleX(1.03) scaleY(0.97) translateY(4px)',
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
  private haptics = getHapticsService();

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
   * Animate state transition with Pixar-quality anticipation and settle
   *
   * Uses persona animation profiles for timing:
   * - Jordan (creative): faster, bouncier
   * - Maya (methodical): slower, smoother
   * - Ferni (warm): balanced, playful
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

    // Get persona profile for timing adjustments
    const profileKey = PERSONA_ID_TO_PROFILE_KEY[this.currentPersona];
    const personaProfile =
      PERSONA_ANIMATION_PROFILES[profileKey] || PERSONA_ANIMATION_PROFILES['ferni'];
    const timingMultiplier = personaProfile?.timingMultiplier ?? 1;
    const bounciness = personaProfile?.bounciness ?? 0.7;

    // Build keyframes with Pixar anticipation → action → settle pattern
    // Anticipation: slight opposite movement before main action
    const anticipationScale = 1 + bounciness * 0.02;
    const overshootScale = 1 + bounciness * 0.03;

    const keyframes: Keyframe[] = [
      // Starting state
      {
        transform: fromStyles.transform,
        opacity: fromStyles.opacity,
        filter: fromStyles.filter,
        offset: 0,
      },
      // Anticipation: slight squash/pull-back (15% into animation)
      {
        transform: `scaleX(${anticipationScale}) scaleY(${2 - anticipationScale}) translateY(1px)`,
        opacity: fromStyles.opacity,
        offset: 0.15,
      },
      // Overshoot: go past target (70% into animation)
      {
        transform:
          toStyles.transform?.replace(
            /scaleY\(([^)]+)\)/,
            (_, val) => `scaleY(${(parseFloat(val) * overshootScale).toFixed(3)})`
          ) || toStyles.transform,
        opacity: toStyles.opacity,
        offset: 0.7,
      },
      // Settle: final position
      {
        transform: toStyles.transform,
        opacity: toStyles.opacity,
        filter: toStyles.filter,
        offset: 1,
      },
    ];

    // Determine duration based on transition type, scaled by persona
    let baseDuration: number = DURATION.NORMAL;
    let easing: string = EASING.STANDARD;

    if (to === 'celebrating') {
      baseDuration = DURATION.SLOW;
      easing = EASING.SPRING;
    } else if (to === 'transitioning') {
      baseDuration = DURATION.MODERATE;
      easing = EASING.GENTLE;
    } else if (to === 'error' || to === 'offline') {
      baseDuration = DURATION.SLOW;
      easing = EASING.GENTLE;
    } else if (to === 'speaking' || to === 'listening') {
      // Quick response for conversation states
      baseDuration = DURATION.FAST;
      easing = EASING.SPRING_GENTLE;
    }

    // Apply persona timing multiplier
    const duration = Math.round(baseDuration * timingMultiplier);

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
    document.dispatchEvent(
      new CustomEvent('ferni:avatar-state-change', {
        detail: { from, to, persona: this.currentPersona },
      })
    );
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
      const scale = 1 + this.voiceAmplitude * 0.03;
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

    this.breathingAnimation = element.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.015)' }, { transform: 'scale(1)' }],
      {
        duration: 5000,
        easing: 'ease-in-out',
        iterations: Infinity,
      }
    );
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
   * Play a quick reaction animation with Pixar-quality squash & stretch
   *
   * Each reaction follows the 3-part Pixar structure:
   * 1. Anticipation (wind-up)
   * 2. Action (main movement)
   * 3. Follow-through & Settle
   *
   * Timing is adjusted per persona for unique character feel.
   */
  async playReaction(type: 'nod' | 'shake' | 'bounce' | 'pulse'): Promise<void> {
    const element = this.config.avatarElement;
    if (!element) return;

    // Pause breathing during reaction
    this.pauseBreathing();

    // Get persona profile for timing/bounciness
    const profileKey = PERSONA_ID_TO_PROFILE_KEY[this.currentPersona];
    const profile = PERSONA_ANIMATION_PROFILES[profileKey] || PERSONA_ANIMATION_PROFILES['ferni'];
    const timingMultiplier = profile?.timingMultiplier ?? 1;
    const bounciness = profile?.bounciness ?? 0.7;

    // Scale intensity by persona bounciness
    const intensity = 1 + bounciness * 0.5;

    let keyframes: Keyframe[];
    let baseDuration: number;
    let easing: string;

    switch (type) {
      case 'nod':
        // WALL-E style acknowledgment nod with squash & stretch
        keyframes = [
          // Start
          { transform: 'scaleX(1) scaleY(1) translateY(0) rotate(0deg)', offset: 0 },
          // Anticipation - slight pull up
          { transform: 'scaleX(1.02) scaleY(0.98) translateY(-2px) rotate(-1deg)', offset: 0.15 },
          // Main nod down with squash
          {
            transform: `scaleX(${1.02 * intensity}) scaleY(${0.98 / intensity}) translateY(${3 * intensity}px) rotate(${3 * intensity}deg)`,
            offset: 0.3,
          },
          // Stretch up
          {
            transform: `scaleX(${0.98 / intensity}) scaleY(${1.03 * intensity}) translateY(${-5 * intensity}px) rotate(${-4 * intensity}deg)`,
            offset: 0.5,
          },
          // Second smaller nod
          {
            transform: `scaleX(1.01) scaleY(0.99) translateY(${2 * intensity}px) rotate(${2 * intensity}deg)`,
            offset: 0.65,
          },
          // Follow-through
          { transform: 'scaleX(0.99) scaleY(1.01) translateY(-2px) rotate(-1.5deg)', offset: 0.8 },
          // Settle overshoot
          { transform: 'scaleX(1.005) scaleY(0.995) translateY(1px) rotate(0.5deg)', offset: 0.92 },
          // Final rest
          { transform: 'scaleX(1) scaleY(1) translateY(0) rotate(0deg)', offset: 1 },
        ];
        baseDuration = DURATION.MODERATE;
        easing = EASING.EXPO_OUT;
        break;

      case 'shake':
        // Gentle disagreement with squash on direction changes
        keyframes = [
          // Start
          { transform: 'scaleX(1) scaleY(1) translateX(0) rotate(0deg)', offset: 0 },
          // Squash left
          {
            transform: `scaleX(${0.98 / intensity}) scaleY(${1.02 * intensity}) translateX(${-4 * intensity}px) rotate(${-2 * intensity}deg)`,
            offset: 0.15,
          },
          // Stretch right
          {
            transform: `scaleX(${1.02 * intensity}) scaleY(${0.98 / intensity}) translateX(${4 * intensity}px) rotate(${2 * intensity}deg)`,
            offset: 0.3,
          },
          // Squash left (smaller)
          { transform: 'scaleX(0.99) scaleY(1.01) translateX(-3px) rotate(-1.5deg)', offset: 0.45 },
          // Stretch right (smaller)
          { transform: 'scaleX(1.01) scaleY(0.99) translateX(2px) rotate(1deg)', offset: 0.6 },
          // Follow-through
          { transform: 'scaleX(1) scaleY(1) translateX(-1px) rotate(-0.5deg)', offset: 0.75 },
          // Settle
          { transform: 'scaleX(1) scaleY(1) translateX(0.5px) rotate(0.2deg)', offset: 0.88 },
          // Rest
          { transform: 'scaleX(1) scaleY(1) translateX(0) rotate(0deg)', offset: 1 },
        ];
        baseDuration = DURATION.SLOW;
        easing = EASING.EXPO_OUT;
        break;

      case 'bounce':
        // Luxo Jr. style excited bounce with full squash & stretch
        keyframes = [
          // Start
          { transform: 'scaleX(1) scaleY(1) translateY(0)', offset: 0 },
          // Anticipation squash (crouch before jump)
          {
            transform: `scaleX(${1.08 * intensity}) scaleY(${0.92 / intensity}) translateY(${2 * intensity}px)`,
            offset: 0.12,
          },
          // Launch stretch
          {
            transform: `scaleX(${0.94 / intensity}) scaleY(${1.08 * intensity}) translateY(${-12 * intensity}px)`,
            offset: 0.28,
          },
          // Peak - maximum stretch
          {
            transform: `scaleX(${0.92 / intensity}) scaleY(${1.1 * intensity}) translateY(${-15 * intensity}px)`,
            offset: 0.35,
          },
          // Falling - starting to squash
          { transform: `scaleX(0.96) scaleY(1.05) translateY(${-8 * intensity}px)`, offset: 0.48 },
          // Landing squash
          {
            transform: `scaleX(${1.1 * intensity}) scaleY(${0.9 / intensity}) translateY(3px)`,
            offset: 0.58,
          },
          // Secondary bounce
          { transform: 'scaleX(0.97) scaleY(1.04) translateY(-4px)', offset: 0.7 },
          // Secondary land
          { transform: 'scaleX(1.03) scaleY(0.97) translateY(1px)', offset: 0.8 },
          // Settle
          { transform: 'scaleX(0.99) scaleY(1.01) translateY(-0.5px)', offset: 0.9 },
          // Rest
          { transform: 'scaleX(1) scaleY(1) translateY(0)', offset: 1 },
        ];
        baseDuration = DURATION.DELIBERATE;
        easing = EASING.EXPO_OUT;
        break;

      case 'pulse':
        // Warm heartbeat-style acknowledgment pulse (no harsh glow)
        keyframes = [
          // Start
          { transform: 'scaleX(1) scaleY(1)', filter: 'brightness(1)', offset: 0 },
          // Quick expansion
          {
            transform: `scaleX(${1.05 * intensity}) scaleY(${1.05 * intensity})`,
            filter: 'brightness(1.08)',
            offset: 0.25,
          },
          // Overshoot
          {
            transform: `scaleX(${1.06 * intensity}) scaleY(${1.06 * intensity})`,
            filter: 'brightness(1.1)',
            offset: 0.35,
          },
          // Contract back
          { transform: 'scaleX(0.98) scaleY(0.98)', filter: 'brightness(1.03)', offset: 0.55 },
          // Second smaller pulse
          { transform: 'scaleX(1.02) scaleY(1.02)', filter: 'brightness(1.02)', offset: 0.7 },
          // Settle
          { transform: 'scaleX(0.995) scaleY(0.995)', filter: 'brightness(1)', offset: 0.85 },
          // Rest
          { transform: 'scaleX(1) scaleY(1)', filter: 'brightness(1)', offset: 1 },
        ];
        baseDuration = DURATION.SLOW;
        easing = EASING.EXPO_OUT;
        break;
    }

    // Apply persona timing multiplier
    const duration = Math.round(baseDuration * timingMultiplier);

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

    log.debug('Pixar reaction played', {
      type,
      duration,
      persona: this.currentPersona,
      bounciness,
    });
  }

  // ==========================================================================
  // CONVENIENCE METHODS
  // ==========================================================================

  /**
   * Quick state setters
   */
  setIdle(): Promise<void> {
    return this.setState('idle');
  }
  setConnecting(): Promise<void> {
    return this.setState('connecting');
  }
  setConnected(): Promise<void> {
    return this.setState('connected');
  }
  setListening(): Promise<void> {
    return this.setState('listening');
  }
  setThinking(): Promise<void> {
    return this.setState('thinking');
  }
  setSpeaking(): Promise<void> {
    return this.setState('speaking');
  }
  setCelebrating(): Promise<void> {
    return this.setState('celebrating');
  }
  setError(): Promise<void> {
    return this.setState('error');
  }
  setOffline(): Promise<void> {
    return this.setState('offline');
  }
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
