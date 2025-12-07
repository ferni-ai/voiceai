/**
 * 🎬 Ferni Animation Orchestrator
 * 
 * GSAP-powered master timeline that coordinates all avatar animations.
 * Implements the 12 Principles of Animation for lifelike behavior.
 * 
 * Architecture:
 * - Master timeline coordinates sub-timelines
 * - Sub-timelines handle breathing, glow, ring, reactions
 * - Emotion state drives animation parameters
 * - Interruptions blend smoothly using GSAP's overwrite logic
 * 
 * Animation Principles Applied:
 * 1. Squash & Stretch - Breathing compresses/stretches avatar
 * 2. Anticipation - Wind-up before reactions
 * 3. Follow-Through - Secondary elements lag behind primary
 * 4. Slow In/Out - Organic easing on all motions
 * 5. Arcs - Curved motion paths for tilts and nods
 * 6. Secondary Action - Glow/ring animate offset from primary
 * 7. Timing - Emotion-driven animation speeds
 * 8. Exaggeration - Push emotions 10-20% for clarity
 */

import gsap from 'gsap';
import { createLogger } from '../utils/logger.js';
import { emotionState, type EmotionState, type EmotionId, EMOTIONS } from '../emotion/emotion-state.js';

const log = createLogger('FerniOrchestrator');

// ============================================================================
// TYPES
// ============================================================================

export interface AvatarElements {
  /** Outermost container - base positioning */
  container: HTMLElement;
  /** The avatar element itself */
  avatar: HTMLElement;
  /** Animated ring around avatar */
  ring: HTMLElement;
  /** Outer glow element */
  glow?: HTMLElement;
  /** Text/emoji inside avatar */
  text?: HTMLElement;
  /** Waveform container */
  waveform?: HTMLElement;
}

export type ReactionType = 
  | 'nod'
  | 'shake'
  | 'bounce'
  | 'pulse'
  | 'curious'
  | 'surprise'
  | 'celebrate';

export interface OrchestratorOptions {
  /** Enable reduced motion for accessibility */
  reducedMotion?: boolean;
  /** Initial emotion state */
  initialEmotion?: EmotionId;
}

// ============================================================================
// GSAP EASINGS - Character-quality physics
// ============================================================================

const FERNI_EASE = {
  // Standard easing - organic, weighted
  standard: 'power2.inOut',
  
  // Anticipation - quick pullback
  anticipate: 'power2.in',
  
  // Action - confident forward motion
  action: 'power2.out',
  
  // Settle - elastic with personality
  settle: 'elastic.out(1, 0.4)',
  
  // Breathing - sine for organic feel
  breathe: 'sine.inOut',
  
  // Bounce - playful hop
  bounce: 'bounce.out',
  
  // Spring - overshoot with character
  spring: 'elastic.out(1.2, 0.5)',
  
  // Gentle spring - subtle overshoot
  gentleSpring: 'elastic.out(1, 0.6)',
};

// ============================================================================
// FERNI ORCHESTRATOR CLASS
// ============================================================================

export class FerniOrchestrator {
  private elements: AvatarElements;
  private options: Required<OrchestratorOptions>;
  
  // Timelines
  private breathingTL: gsap.core.Timeline | null = null;
  private glowTL: gsap.core.Timeline | null = null;
  private ringTL: gsap.core.Timeline | null = null;
  
  // State
  private isRunning = false;
  private currentEmotion: EmotionState;
  private unsubscribeEmotion: (() => void) | null = null;
  
  // Quirks timers
  private blinkTimer: ReturnType<typeof setTimeout> | null = null;
  private tiltTimer: ReturnType<typeof setTimeout> | null = null;
  private warmthTimer: ReturnType<typeof setTimeout> | null = null;
  
  constructor(elements: AvatarElements, options: OrchestratorOptions = {}) {
    this.elements = elements;
    this.options = {
      reducedMotion: options.reducedMotion ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      initialEmotion: options.initialEmotion ?? 'neutral',
    };
    
    this.currentEmotion = EMOTIONS[this.options.initialEmotion];
    
    // GPU promote all elements
    this.promoteToGPU();
    
    log.debug('Ferni Orchestrator initialized');
  }
  
  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================
  
  /**
   * Start all animations
   */
  start(): void {
    if (this.isRunning) return;
    
    log.info('Starting Ferni animation system');
    this.isRunning = true;
    
    // Subscribe to emotion changes
    this.unsubscribeEmotion = emotionState.subscribe((emotion, previous) => {
      this.onEmotionChange(emotion, previous);
    });
    
    // Start continuous animations
    this.startBreathing();
    this.startGlow();
    this.startRing();
    
    // Start personality quirks
    this.scheduleNextBlink();
    this.scheduleNextTilt();
    this.scheduleNextWarmthPulse();
  }
  
  /**
   * Pause all animations (preserves state)
   */
  pause(): void {
    this.breathingTL?.pause();
    this.glowTL?.pause();
    this.ringTL?.pause();
  }
  
  /**
   * Resume paused animations
   */
  resume(): void {
    this.breathingTL?.resume();
    this.glowTL?.resume();
    this.ringTL?.resume();
  }
  
  /**
   * Stop all animations and clean up
   */
  dispose(): void {
    log.info('Disposing Ferni animation system');
    this.isRunning = false;
    
    // Unsubscribe from emotion state
    this.unsubscribeEmotion?.();
    
    // Kill all timelines
    this.breathingTL?.kill();
    this.glowTL?.kill();
    this.ringTL?.kill();
    
    // Clear quirk timers
    if (this.blinkTimer) clearTimeout(this.blinkTimer);
    if (this.tiltTimer) clearTimeout(this.tiltTimer);
    if (this.warmthTimer) clearTimeout(this.warmthTimer);
    
    // Demote from GPU
    this.demoteFromGPU();
  }
  
  // ==========================================================================
  // BREATHING ANIMATION - The Heart of Life
  // ==========================================================================
  
  private startBreathing(): void {
    if (this.options.reducedMotion) return;
    
    const emotion = this.currentEmotion;
    const breathDuration = 60 / emotion.breathing.rate; // Convert BPM to seconds
    const depth = emotion.breathing.depth;
    
    // Kill existing
    this.breathingTL?.kill();
    
    this.breathingTL = gsap.timeline({ repeat: -1 });
    
    // Inhale - stretch vertically, compress horizontally (squash & stretch)
    this.breathingTL.to(this.elements.container, {
      scaleY: depth,
      scaleX: 2 - depth, // Inverse for volume preservation
      duration: breathDuration / 2,
      ease: FERNI_EASE.breathe,
    });
    
    // Exhale - return with slight overshoot (follow-through)
    this.breathingTL.to(this.elements.container, {
      scaleY: 1,
      scaleX: 1,
      duration: breathDuration / 2,
      ease: FERNI_EASE.breathe,
    });
  }
  
  // ==========================================================================
  // GLOW ANIMATION - Secondary Action
  // ==========================================================================
  
  private startGlow(): void {
    if (!this.elements.glow || this.options.reducedMotion) return;
    
    const emotion = this.currentEmotion;
    const glowIntensity = emotion.color.intensity;
    
    // Kill existing
    this.glowTL?.kill();
    
    this.glowTL = gsap.timeline({ repeat: -1 });
    
    // Glow pulses slightly out of phase with breathing
    const pulseDuration = (60 / emotion.breathing.rate) * 1.23; // Golden ratio offset
    
    this.glowTL.to(this.elements.glow, {
      opacity: glowIntensity * 0.7,
      scale: 1.05,
      duration: pulseDuration / 2,
      ease: FERNI_EASE.breathe,
    });
    
    this.glowTL.to(this.elements.glow, {
      opacity: glowIntensity,
      scale: 1,
      duration: pulseDuration / 2,
      ease: FERNI_EASE.breathe,
    });
  }
  
  // ==========================================================================
  // RING ANIMATION - Continuous Rotation
  // ==========================================================================
  
  private startRing(): void {
    if (this.options.reducedMotion) return;
    
    // Kill existing
    this.ringTL?.kill();
    
    // Gentle continuous rotation
    this.ringTL = gsap.timeline({ repeat: -1 });
    
    this.ringTL.to(this.elements.ring, {
      rotation: 360,
      duration: 20 * this.currentEmotion.movement.speed,
      ease: 'none',
    });
  }
  
  // ==========================================================================
  // EMOTION TRANSITIONS - Smooth Morphs
  // ==========================================================================
  
  private onEmotionChange(emotion: EmotionState, previous: EmotionState): void {
    log.debug(`Emotion changed: ${previous.id} → ${emotion.id}`);
    this.currentEmotion = emotion;
    
    // Create transition timeline
    const transitionDuration = 0.8;
    const tl = gsap.timeline();
    
    // Morph color (ring)
    tl.to(this.elements.ring, {
      borderColor: emotion.color.primary,
      boxShadow: `0 0 ${20 * emotion.color.intensity}px ${emotion.color.glow}`,
      duration: transitionDuration,
      ease: FERNI_EASE.standard,
    }, 0);
    
    // Morph glow intensity
    if (this.elements.glow) {
      tl.to(this.elements.glow, {
        opacity: emotion.color.intensity,
        duration: transitionDuration,
        ease: FERNI_EASE.standard,
      }, 0);
    }
    
    // Anticipation squash
    tl.to(this.elements.container, {
      scaleY: 0.97,
      scaleX: 1.02,
      duration: transitionDuration * 0.2,
      ease: FERNI_EASE.anticipate,
    }, 0);
    
    // Stretch into new emotion
    tl.to(this.elements.container, {
      scaleY: 1.02,
      scaleX: 0.98,
      duration: transitionDuration * 0.3,
      ease: FERNI_EASE.action,
    }, transitionDuration * 0.2);
    
    // Settle with personality
    tl.to(this.elements.container, {
      scaleY: 1,
      scaleX: 1,
      duration: transitionDuration * 0.5,
      ease: FERNI_EASE.gentleSpring,
    }, transitionDuration * 0.5);
    
    // Update continuous animations with new parameters
    tl.call(() => {
      this.updateAnimationParameters();
    }, [], transitionDuration);
  }
  
  private updateAnimationParameters(): void {
    // Time-stretch breathing timeline to match new emotion
    if (this.breathingTL) {
      gsap.to(this.breathingTL, {
        timeScale: this.currentEmotion.movement.speed,
        duration: 0.5,
        ease: FERNI_EASE.standard,
      });
    }
    
    // Update ring rotation speed
    if (this.ringTL) {
      gsap.to(this.ringTL, {
        timeScale: this.currentEmotion.movement.speed,
        duration: 0.5,
        ease: FERNI_EASE.standard,
      });
    }
  }
  
  // ==========================================================================
  // REACTIONS - Character Moments
  // ==========================================================================
  
  /**
   * Play a reaction animation
   */
  react(type: ReactionType): void {
    if (this.options.reducedMotion) {
      // Minimal feedback for reduced motion
      gsap.to(this.elements.avatar, {
        filter: 'brightness(1.1)',
        duration: 0.2,
        yoyo: true,
        repeat: 1,
      });
      return;
    }
    
    log.debug(`Playing reaction: ${type}`);
    
    switch (type) {
      case 'nod':
        this.playNodReaction();
        break;
      case 'shake':
        this.playShakeReaction();
        break;
      case 'bounce':
        this.playBounceReaction();
        break;
      case 'pulse':
        this.playPulseReaction();
        break;
      case 'curious':
        this.playCuriousReaction();
        break;
      case 'surprise':
        this.playSurpriseReaction();
        break;
      case 'celebrate':
        this.playCelebrateReaction();
        break;
    }
  }
  
  private playNodReaction(): void {
    const tl = gsap.timeline();
    
    tl
      // Anticipation - slight pull back
      .to(this.elements.container, {
        y: -2,
        scaleY: 0.97,
        scaleX: 1.02,
        rotation: -1,
        duration: 0.08,
        ease: FERNI_EASE.anticipate,
      })
      // Main nod down
      .to(this.elements.container, {
        y: 6,
        scaleY: 1.03,
        scaleX: 0.98,
        rotation: 3,
        duration: 0.12,
        ease: FERNI_EASE.action,
      })
      // Follow-through (second smaller nod)
      .to(this.elements.container, {
        y: 3,
        scaleY: 1.01,
        scaleX: 0.99,
        rotation: 1.5,
        duration: 0.1,
        ease: FERNI_EASE.standard,
      })
      // Settle with spring
      .to(this.elements.container, {
        y: 0,
        scaleY: 1,
        scaleX: 1,
        rotation: 0,
        duration: 0.25,
        ease: FERNI_EASE.settle,
      });
  }
  
  private playShakeReaction(): void {
    const tl = gsap.timeline();
    
    tl
      // Quick shake left-right-left-right
      .to(this.elements.container, {
        x: -6,
        rotation: -3,
        duration: 0.06,
        ease: FERNI_EASE.anticipate,
      })
      .to(this.elements.container, {
        x: 6,
        rotation: 3,
        duration: 0.08,
        ease: FERNI_EASE.action,
      })
      .to(this.elements.container, {
        x: -4,
        rotation: -2,
        duration: 0.08,
        ease: FERNI_EASE.action,
      })
      .to(this.elements.container, {
        x: 4,
        rotation: 2,
        duration: 0.08,
        ease: FERNI_EASE.action,
      })
      // Settle
      .to(this.elements.container, {
        x: 0,
        rotation: 0,
        duration: 0.2,
        ease: FERNI_EASE.settle,
      });
  }
  
  private playBounceReaction(): void {
    // Playful bounce with squash & stretch
    const tl = gsap.timeline();
    
    tl
      // Anticipation squash
      .to(this.elements.container, {
        y: 3,
        scaleY: 0.88,
        scaleX: 1.08,
        duration: 0.1,
        ease: FERNI_EASE.anticipate,
      })
      // Launch stretch
      .to(this.elements.container, {
        y: -15,
        scaleY: 1.12,
        scaleX: 0.92,
        duration: 0.15,
        ease: FERNI_EASE.action,
      })
      // Hang at peak
      .to(this.elements.container, {
        y: -16,
        scaleY: 1.08,
        scaleX: 0.94,
        duration: 0.05,
        ease: 'none',
      })
      // Fall
      .to(this.elements.container, {
        y: 0,
        scaleY: 1.1,
        scaleX: 0.93,
        duration: 0.12,
        ease: FERNI_EASE.anticipate,
      })
      // Landing squash
      .to(this.elements.container, {
        y: 4,
        scaleY: 0.85,
        scaleX: 1.12,
        duration: 0.08,
        ease: FERNI_EASE.action,
      })
      // Recovery bounce
      .to(this.elements.container, {
        y: -4,
        scaleY: 1.04,
        scaleX: 0.97,
        duration: 0.12,
        ease: FERNI_EASE.action,
      })
      // Final settle
      .to(this.elements.container, {
        y: 0,
        scaleY: 1,
        scaleX: 1,
        duration: 0.3,
        ease: FERNI_EASE.spring,
      });
  }
  
  private playPulseReaction(): void {
    const tl = gsap.timeline();
    
    tl
      .to(this.elements.avatar, {
        scale: 1.08,
        filter: 'brightness(1.15)',
        duration: 0.15,
        ease: FERNI_EASE.action,
      })
      .to(this.elements.avatar, {
        scale: 1,
        filter: 'brightness(1)',
        duration: 0.4,
        ease: FERNI_EASE.settle,
      });
    
    // Ring expands with secondary action offset
    tl.to(this.elements.ring, {
      scale: 1.1,
      opacity: 0.8,
      duration: 0.2,
      ease: FERNI_EASE.action,
    }, 0.05);
    
    tl.to(this.elements.ring, {
      scale: 1,
      opacity: 1,
      duration: 0.35,
      ease: FERNI_EASE.settle,
    }, 0.2);
  }
  
  private playCuriousReaction(): void {
    // Curious head tilt
    const direction = Math.random() > 0.5 ? 1 : -1;
    const tl = gsap.timeline();
    
    tl
      // Curious tilt
      .to(this.elements.container, {
        rotation: direction * 8,
        x: direction * 3,
        y: -2,
        duration: 0.3,
        ease: FERNI_EASE.action,
      })
      // Hold
      .to(this.elements.container, {
        rotation: direction * 6,
        duration: 0.5,
        ease: FERNI_EASE.standard,
      })
      // Return with slight counter-tilt
      .to(this.elements.container, {
        rotation: direction * -2,
        x: direction * -1,
        y: 0,
        duration: 0.25,
        ease: FERNI_EASE.action,
      })
      // Settle
      .to(this.elements.container, {
        rotation: 0,
        x: 0,
        duration: 0.3,
        ease: FERNI_EASE.gentleSpring,
      });
  }
  
  private playSurpriseReaction(): void {
    const tl = gsap.timeline();
    
    tl
      // Quick scale up with stretch
      .to(this.elements.container, {
        scale: 1.15,
        y: -5,
        duration: 0.1,
        ease: FERNI_EASE.action,
      })
      // Eyes widen effect (brightness)
      .to(this.elements.avatar, {
        filter: 'brightness(1.2)',
        duration: 0.1,
      }, 0)
      // Hold
      .to(this.elements.container, {
        duration: 0.2,
      })
      // Settle back
      .to(this.elements.container, {
        scale: 1,
        y: 0,
        duration: 0.4,
        ease: FERNI_EASE.spring,
      })
      .to(this.elements.avatar, {
        filter: 'brightness(1)',
        duration: 0.3,
      }, '-=0.3');
  }
  
  private playCelebrateReaction(): void {
    // Full celebration - multiple bounces with increasing joy
    const tl = gsap.timeline();
    
    // First excited bounce
    tl.add(this.createMiniBounce(0.8));
    
    // Pause
    tl.to({}, { duration: 0.1 });
    
    // Second bigger bounce
    tl.add(this.createMiniBounce(1.0));
    
    // Spin with joy
    tl.to(this.elements.container, {
      rotation: 360,
      duration: 0.5,
      ease: FERNI_EASE.action,
    });
    
    // Final settle
    tl.to(this.elements.container, {
      rotation: 0,
      scale: 1,
      duration: 0.3,
      ease: FERNI_EASE.spring,
    });
    
    // Glow burst
    if (this.elements.glow) {
      tl.to(this.elements.glow, {
        scale: 1.5,
        opacity: 1,
        duration: 0.3,
        ease: FERNI_EASE.action,
      }, 0);
      
      tl.to(this.elements.glow, {
        scale: 1,
        opacity: this.currentEmotion.color.intensity,
        duration: 0.5,
        ease: FERNI_EASE.settle,
      }, 0.5);
    }
  }
  
  private createMiniBounce(intensity: number): gsap.core.Timeline {
    const tl = gsap.timeline();
    
    tl
      .to(this.elements.container, {
        scaleY: 0.9 * intensity,
        scaleX: 1.06 * intensity,
        duration: 0.08,
        ease: FERNI_EASE.anticipate,
      })
      .to(this.elements.container, {
        y: -10 * intensity,
        scaleY: 1.1 * intensity,
        scaleX: 0.94,
        duration: 0.12,
        ease: FERNI_EASE.action,
      })
      .to(this.elements.container, {
        y: 0,
        scaleY: 0.92,
        scaleX: 1.05,
        duration: 0.1,
        ease: FERNI_EASE.anticipate,
      })
      .to(this.elements.container, {
        scaleY: 1,
        scaleX: 1,
        duration: 0.15,
        ease: FERNI_EASE.settle,
      });
    
    return tl;
  }
  
  // ==========================================================================
  // PERSONALITY QUIRKS - Random Delightful Behaviors
  // ==========================================================================
  
  private scheduleNextBlink(): void {
    if (!this.isRunning) return;
    
    const emotion = this.currentEmotion;
    const baseInterval = (60 / emotion.quirks.blinkRate) * 1000;
    const variance = baseInterval * 0.3;
    const nextBlink = baseInterval + (Math.random() - 0.5) * variance;
    
    this.blinkTimer = setTimeout(() => {
      this.performBlink();
      this.scheduleNextBlink();
    }, nextBlink);
  }
  
  private performBlink(): void {
    if (this.options.reducedMotion) return;
    
    gsap.timeline()
      .to(this.elements.avatar, {
        scaleY: 0.92,
        filter: 'brightness(0.85)',
        duration: 0.06,
        ease: FERNI_EASE.anticipate,
      })
      .to(this.elements.avatar, {
        scaleY: 1,
        filter: 'brightness(1)',
        duration: 0.1,
        ease: FERNI_EASE.action,
      });
  }
  
  private scheduleNextTilt(): void {
    if (!this.isRunning) return;
    
    const emotion = this.currentEmotion;
    if (!emotion.quirks.curiousTilts) {
      // Re-check in 5 seconds (emotion might change)
      this.tiltTimer = setTimeout(() => this.scheduleNextTilt(), 5000);
      return;
    }
    
    const interval = 8000 + Math.random() * 12000; // 8-20 seconds
    
    this.tiltTimer = setTimeout(() => {
      this.performCuriousTilt();
      this.scheduleNextTilt();
    }, interval);
  }
  
  private performCuriousTilt(): void {
    if (this.options.reducedMotion) return;
    
    const direction = Math.random() > 0.5 ? 1 : -1;
    
    gsap.timeline()
      .to(this.elements.container, {
        rotation: direction * 4,
        x: direction * 2,
        duration: 0.4,
        ease: FERNI_EASE.action,
      })
      .to(this.elements.container, {
        rotation: direction * -1,
        x: direction * -0.5,
        duration: 0.3,
        ease: FERNI_EASE.standard,
      })
      .to(this.elements.container, {
        rotation: 0,
        x: 0,
        duration: 0.4,
        ease: FERNI_EASE.gentleSpring,
      });
  }
  
  private scheduleNextWarmthPulse(): void {
    if (!this.isRunning) return;
    
    const emotion = this.currentEmotion;
    if (!emotion.quirks.warmthPulses) {
      this.warmthTimer = setTimeout(() => this.scheduleNextWarmthPulse(), 5000);
      return;
    }
    
    const interval = 15000 + Math.random() * 20000; // 15-35 seconds
    
    this.warmthTimer = setTimeout(() => {
      this.performWarmthPulse();
      this.scheduleNextWarmthPulse();
    }, interval);
  }
  
  private performWarmthPulse(): void {
    if (this.options.reducedMotion) return;
    
    gsap.timeline()
      .to(this.elements.avatar, {
        filter: 'brightness(1.08) saturate(1.15)',
        duration: 0.4,
        ease: FERNI_EASE.action,
      })
      .to(this.elements.avatar, {
        filter: 'brightness(1) saturate(1)',
        duration: 0.6,
        ease: FERNI_EASE.standard,
      });
  }
  
  // ==========================================================================
  // GPU OPTIMIZATION
  // ==========================================================================
  
  private promoteToGPU(): void {
    const elements = [
      this.elements.container,
      this.elements.avatar,
      this.elements.ring,
      this.elements.glow,
      this.elements.text,
    ].filter(Boolean) as HTMLElement[];
    
    elements.forEach(el => {
      gsap.set(el, {
        force3D: true,
        willChange: 'transform, opacity',
      });
    });
  }
  
  private demoteFromGPU(): void {
    const elements = [
      this.elements.container,
      this.elements.avatar,
      this.elements.ring,
      this.elements.glow,
      this.elements.text,
    ].filter(Boolean) as HTMLElement[];
    
    elements.forEach(el => {
      gsap.set(el, {
        willChange: 'auto',
        clearProps: 'force3D',
      });
    });
  }
  
  // ==========================================================================
  // PUBLIC API
  // ==========================================================================
  
  /**
   * Manually set emotion (bypasses state machine for direct control)
   */
  setEmotion(emotionId: EmotionId): void {
    emotionState.setEmotion(emotionId);
  }
  
  /**
   * Flash emotion temporarily
   */
  flashEmotion(emotionId: EmotionId, durationMs?: number): void {
    emotionState.flashEmotion(emotionId, durationMs);
  }
  
  /**
   * Get current emotion
   */
  get emotion(): EmotionState {
    return this.currentEmotion;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

let instance: FerniOrchestrator | null = null;

/**
 * Create or get the Ferni Orchestrator singleton
 */
export function createFerniOrchestrator(
  elements: AvatarElements,
  options?: OrchestratorOptions
): FerniOrchestrator {
  if (instance) {
    instance.dispose();
  }
  
  instance = new FerniOrchestrator(elements, options);
  return instance;
}

/**
 * Get the current orchestrator instance
 */
export function getFerniOrchestrator(): FerniOrchestrator | null {
  return instance;
}

export default FerniOrchestrator;
