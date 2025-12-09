/**
 * GSAP Animation Utilities
 * 
 * Leverages GSAP for complex, high-performance animations that benefit from:
 * - GPU acceleration (automatic with transforms)
 * - Smart batching and auto-optimization
 * - Timeline sequencing with scrubbing
 * - Advanced easing and physics
 * 
 * All durations use centralized DURATION constants from animation-constants.ts
 */

// Import gsap from our setup file to ensure plugins are registered
import { gsap } from './gsap-setup.js';
import { DURATION, STAGGER } from '../config/animation-constants.js';

// ============================================================================
// GSAP Duration Helpers (converts ms to seconds for GSAP)
// ============================================================================

const toSeconds = (ms: number) => ms / 1000;

// ============================================================================
// GPU Optimization Setup
// ============================================================================

/**
 * Force GPU layer promotion for an element
 * Call this on elements that will animate frequently
 * NOTE: willChange removed - causes visible box bug in Safari
 * GSAP's force3D handles GPU acceleration internally
 */
export function promoteToGPU(_element: HTMLElement): void {
  // NOTE: GPU promotion disabled - Safari shows visible containment boxes
  // GSAP's force3D:'auto' default handles GPU when needed
}

/**
 * Remove GPU promotion when animations complete (saves memory)
 */
export function demoteFromGPU(element: HTMLElement): void {
  gsap.set(element, {
    force3D: 'auto',
    willChange: 'auto'
  });
}

/**
 * Batch GPU promotion for multiple elements
 * NOTE: willChange removed - causes visible box bug in Safari
 */
export function promoteAllToGPU(_selector: string): void {
  // NOTE: GPU promotion disabled - Safari shows visible containment boxes
  // GSAP's force3D:'auto' default handles GPU when needed
}

// ============================================================================
// Performance-Optimized Animations
// ============================================================================

/**
 * High-performance button press with GPU acceleration
 * Uses GSAP's smart transforms for 60fps
 */
export function animateButtonPress(button: HTMLElement): gsap.core.Tween {
  return gsap.to(button, {
    scale: 0.95,
    duration: toSeconds(DURATION.FAST_PRESS),
    ease: 'power2.out',
    force3D: true
  });
}

/**
 * Button release with spring physics
 */
export function animateButtonRelease(button: HTMLElement): gsap.core.Tween {
  return gsap.to(button, {
    scale: 1,
    duration: toSeconds(DURATION.STANDARD),
    ease: 'elastic.out(1, 0.5)',
    force3D: true
  });
}

/**
 * Smooth persona transition with GPU-accelerated morphing
 */
export function animatePersonaSwitch(
  outgoing: HTMLElement | null,
  incoming: HTMLElement,
  onComplete?: () => void
): gsap.core.Timeline {
  const tl = gsap.timeline({
    onComplete
  });

  // Outgoing persona fades and shrinks
  if (outgoing) {
    tl.to(outgoing, {
      scale: 0.9,
      opacity: 0.3,
      duration: toSeconds(DURATION.NORMAL),
      ease: 'power2.in',
      force3D: true
    }, 0);
  }

  // Incoming persona grows and brightens
  tl.fromTo(incoming, 
    { 
      scale: 0.85, 
      opacity: 0.5 
    },
    {
      scale: 1,
      opacity: 1,
      duration: toSeconds(DURATION.SLOW),
      ease: 'back.out(1.7)',
      force3D: true
    }, 
    outgoing ? toSeconds(DURATION.FAST) : 0
  );

  return tl;
}

/**
 * Staggered team roster reveal - Pixar style
 */
export function animateTeamReveal(members: HTMLElement[]): gsap.core.Timeline {
  const tl = gsap.timeline();
  
  tl.fromTo(members,
    {
      y: 20,
      opacity: 0,
      scale: 0.8
    },
    {
      y: 0,
      opacity: 1,
      scale: 1,
      duration: toSeconds(DURATION.MODERATE),
      ease: 'back.out(1.4)',
      stagger: {
        each: toSeconds(STAGGER.RELAXED),
        from: 'start'
      },
      force3D: true
    }
  );

  return tl;
}

/**
 * Waveform bar animation - highly optimized for continuous playback
 */
export function createWaveformAnimation(bars: HTMLElement[]): gsap.core.Tween {
  return gsap.to(bars, {
    scaleY: 'random(0.3, 1)',
    duration: 'random(0.1, 0.3)',
    ease: 'sine.inOut',
    stagger: {
      each: toSeconds(STAGGER.TIGHT),
      repeat: -1,
      yoyo: true
    },
    force3D: true
  });
}

/**
 * Avatar breathing - subtle continuous animation
 */
export function createBreathingAnimation(avatar: HTMLElement): gsap.core.Tween {
  return gsap.to(avatar, {
    scale: 1.02,
    duration: toSeconds(DURATION.AMBIENT_FAST),
    ease: 'sine.inOut',
    repeat: -1,
    yoyo: true,
    force3D: true
  });
}

/**
 * Pixar-style reaction - squash and stretch
 */
export function animateReaction(
  element: HTMLElement, 
  type: 'nod' | 'shake' | 'bounce' | 'curious'
): gsap.core.Timeline {
  const tl = gsap.timeline();

  switch (type) {
    case 'nod':
      tl.to(element, {
        scaleY: 0.92,
        scaleX: 1.05,
        y: 3,
        rotation: 3,
        duration: toSeconds(DURATION.FAST),
        ease: 'power2.out'
      })
      .to(element, {
        scaleY: 1.05,
        scaleX: 0.95,
        y: -5,
        rotation: -2,
        duration: toSeconds(DURATION.FAST_RELEASE),
        ease: 'power2.out'
      })
      .to(element, {
        scaleY: 1,
        scaleX: 1,
        y: 0,
        rotation: 0,
        duration: toSeconds(DURATION.STANDARD),
        ease: 'elastic.out(1, 0.5)'
      });
      break;

    case 'shake':
      tl.to(element, {
        x: -4,
        rotation: -2,
        scaleX: 0.98,
        duration: toSeconds(DURATION.FAST_PRESS)
      })
      .to(element, {
        x: 4,
        rotation: 2,
        scaleX: 1.02,
        duration: toSeconds(DURATION.FAST_PRESS)
      })
      .to(element, {
        x: -2,
        rotation: -1,
        duration: toSeconds(DURATION.FAST_PRESS)
      })
      .to(element, {
        x: 0,
        rotation: 0,
        scaleX: 1,
        duration: toSeconds(DURATION.FAST_RELEASE),
        ease: 'power2.out'
      });
      break;

    case 'bounce':
      // Luxo Jr. inspired bounce
      tl.to(element, {
        scaleX: 1.08,
        scaleY: 0.92,
        y: 2,
        duration: toSeconds(DURATION.FAST),
        ease: 'power2.in'
      })
      .to(element, {
        scaleX: 0.94,
        scaleY: 1.08,
        y: -15,
        duration: toSeconds(DURATION.NORMAL),
        ease: 'power2.out'
      })
      .to(element, {
        scaleX: 1.1,
        scaleY: 0.9,
        y: 0,
        duration: toSeconds(DURATION.FAST_RELEASE),
        ease: 'power2.in'
      })
      .to(element, {
        scaleX: 1,
        scaleY: 1,
        y: 0,
        duration: toSeconds(DURATION.SLOW),
        ease: 'elastic.out(1, 0.3)'
      });
      break;

    case 'curious':
      // WALL-E style curious tilt
      tl.to(element, {
        rotation: -8,
        y: -3,
        duration: toSeconds(DURATION.SLOW),
        ease: 'power2.out'
      })
      .to(element, {
        rotation: 0,
        y: 0,
        duration: toSeconds(DURATION.DELIBERATE),
        ease: 'elastic.out(1, 0.5)'
      });
      break;
  }

  return tl;
}

/**
 * Energy transfer between team members during handoff
 */
export function animateEnergyTransfer(
  from: HTMLElement,
  to: HTMLElement,
  color: string
): gsap.core.Timeline {
  const tl = gsap.timeline();
  
  // Create particle effect
  const particle = document.createElement('div');
  particle.style.cssText = `
    position: absolute;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: ${color};
    pointer-events: none;
    z-index: 1000;
    filter: blur(2px);
    box-shadow: 0 0 20px ${color};
  `;
  document.body.appendChild(particle);

  const fromRect = from.getBoundingClientRect();
  const toRect = to.getBoundingClientRect();

  gsap.set(particle, {
    x: fromRect.left + fromRect.width / 2,
    y: fromRect.top + fromRect.height / 2
  });

  tl.to(particle, {
    x: toRect.left + toRect.width / 2,
    y: toRect.top + toRect.height / 2,
    scale: 1.5,
    duration: toSeconds(DURATION.MODERATE),
    ease: 'power2.inOut'
  })
  .to(particle, {
    scale: 0,
    opacity: 0,
    duration: toSeconds(DURATION.NORMAL),
    ease: 'power2.in',
    onComplete: () => particle.remove()
  });

  // Pulse outgoing
  tl.to(from, {
    scale: 0.95,
    filter: 'brightness(0.8)',
    duration: toSeconds(DURATION.NORMAL)
  }, 0);

  // Pulse incoming
  tl.to(to, {
    scale: 1.1,
    filter: 'brightness(1.3)',
    duration: toSeconds(DURATION.NORMAL)
  }, toSeconds(DURATION.NORMAL))
  .to(to, {
    scale: 1,
    filter: 'brightness(1)',
    duration: toSeconds(DURATION.SLOW),
    ease: 'power2.out'
  });

  return tl;
}

// ============================================================================
// Animation Presets for Common Patterns
// ============================================================================

export const GSAP_PRESETS = {
  // Fast micro-interaction
  micro: {
    duration: toSeconds(DURATION.MICRO),
    ease: 'power2.out',
    force3D: true
  },
  
  // Standard UI feedback
  feedback: {
    duration: toSeconds(DURATION.FAST),
    ease: 'power2.out',
    force3D: true
  },
  
  // Spring animation
  spring: {
    duration: toSeconds(DURATION.STANDARD),
    ease: 'elastic.out(1, 0.5)',
    force3D: true
  },
  
  // Deliberate transition
  transition: {
    duration: toSeconds(DURATION.DELIBERATE),
    ease: 'power3.inOut',
    force3D: true
  },
  
  // Dramatic entrance
  entrance: {
    duration: toSeconds(DURATION.DRAMATIC),
    ease: 'back.out(1.7)',
    force3D: true
  }
} as const;

// ============================================================================
// Performance Monitoring
// ============================================================================

const animationBudget = 16.67; // 60fps target
let lastFrameTime = 0;

/**
 * Check if we have frame budget for more animations
 */
export function hasFrameBudget(): boolean {
  const now = performance.now();
  const frameDelta = now - lastFrameTime;
  lastFrameTime = now;
  return frameDelta <= animationBudget;
}

/**
 * Reduce animation complexity if frame budget exceeded
 */
export function optimizeForPerformance(): void {
  // Reduce GSAP's ticker rate if struggling
  if (!hasFrameBudget()) {
    gsap.ticker.fps(30);
  } else {
    gsap.ticker.fps(60);
  }
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Kill all animations on an element
 */
export function killAnimations(element: HTMLElement): void {
  gsap.killTweensOf(element);
}

/**
 * Pause all active animations (useful for background tabs)
 */
export function pauseAllAnimations(): void {
  gsap.globalTimeline.pause();
}

/**
 * Resume all paused animations
 */
export function resumeAllAnimations(): void {
  gsap.globalTimeline.resume();
}

// ============================================================================
// Initialize
// ============================================================================

/**
 * Initialize GSAP with optimal settings
 */
export function initGSAP(): void {
  // Set global defaults
  // NOTE: force3D: true for GPU acceleration, but willChange is NOT set (Safari bug)
  gsap.defaults({
    overwrite: 'auto',
    force3D: true // GPU acceleration via transforms - this is fine, willChange was the issue
  });

  // Optimize for transforms (GPU accelerated)
  gsap.config({
    autoSleep: 60,
    nullTargetWarn: false
  });

  // Handle visibility changes
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseAllAnimations();
    } else {
      resumeAllAnimations();
    }
  });
}
