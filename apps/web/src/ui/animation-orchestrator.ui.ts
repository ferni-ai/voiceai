/**
 * Animation Orchestrator - Pixar-Quality Experience Coordinator
 * 
 * Implements Pixar's 12 Principles of Animation for a best-in-class experience:
 * 
 * 1. SQUASH & STRETCH - Elements deform naturally during motion
 * 2. ANTICIPATION - Wind-up before actions (the "pitcher's wind-up")
 * 3. STAGING - Direct attention, one clear idea at a time
 * 4. STRAIGHT AHEAD/POSE TO POSE - Key poses with natural in-betweens
 * 5. FOLLOW-THROUGH - Elements continue after main action stops
 * 6. SLOW IN/OUT - Easing on all movements
 * 7. ARCS - Natural curved motion paths
 * 8. SECONDARY ACTION - Supporting animations that don't distract
 * 9. TIMING - Speed conveys weight and emotion
 * 10. EXAGGERATION - Push poses for clarity
 * 11. SOLID DRAWING - Consistent transforms, weight, depth
 * 12. APPEAL - Characters should be likeable
 * 
 * This orchestrator coordinates page-load sequences, persona transitions,
 * celebration effects, and ensures 60fps with proper animation budgeting.
 */

import {
  getEasing,
  getPersonaAnimationProfile,
  prefersReducedMotion,
} from '@design-system/tokens';
import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

const log = createLogger('AnimationOrch');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

interface AnimationBudget {
  maxActiveAnimations: number;
  currentActive: number;
  frameTimeMs: number;
  isLowPower: boolean;
}

// ============================================================================
// STATE
// ============================================================================

// Animation budget - keep animations performant
const budget: AnimationBudget = {
  maxActiveAnimations: 12,
  currentActive: 0,
  frameTimeMs: 16.67, // Target 60fps
  isLowPower: false,
};

// Active animations for cleanup
const activeAnimations = new Map<string, Animation[]>();

// Page load sequence state
let pageLoadComplete = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the animation orchestrator.
 * Detects device capabilities and sets up animation budget.
 *
 * NOTE: Page load animations are now handled SOLELY by CSS (.app-loaded class).
 * This orchestrator only handles persona transitions, reactions, and celebrations.
 * This prevents race conditions between multiple animation systems.
 */
export function initAnimationOrchestrator(): void {
  // Check for reduced motion preference
  if (prefersReducedMotion()) {
    budget.isLowPower = true;
    budget.maxActiveAnimations = 4;
    log.debug('🎬 Animation Orchestrator: Reduced motion mode');
    return;
  }

  // Check for low-power devices
  detectDeviceCapabilities();

  // NOTE: We no longer auto-run page load sequence here.
  // CSS entrance animations (.app-loaded) handle page load.
  // This orchestrator is for persona transitions, reactions, celebrations only.
  // This fixes the race condition between orchestrator and app.ts adding app-loaded.

  log.debug('🎬 Animation Orchestrator initialized (page load handled by CSS)');
}

/**
 * Detect device capabilities and adjust animation budget.
 */
function detectDeviceCapabilities(): void {
  // Check for mobile/low-power devices
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const isLowMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory !== undefined && 
                      (navigator as Navigator & { deviceMemory?: number }).deviceMemory! < 4;
  const isSlowConnection = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType === 'slow-2g' ||
                           (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType === '2g';

  if (isMobile || isLowMemory || isSlowConnection) {
    budget.isLowPower = true;
    budget.maxActiveAnimations = 6;
    log.debug('🎬 Animation Orchestrator: Low-power mode');
  }
}

// ============================================================================
// PAGE LOAD SEQUENCE - Pixar-style "curtain rise"
// ============================================================================

/**
 * Run optional page load enhancements.
 *
 * IMPORTANT: CSS entrance animations (.app-loaded) are the PRIMARY system.
 * This function is DISABLED by default to prevent animation conflicts.
 *
 * Only call this explicitly if you want Pixar-quality enhancements on top of CSS.
 * Most of the time, CSS animations alone provide a smooth experience.
 */
export async function runPageLoadSequence(): Promise<void> {
  // DISABLED: CSS entrance animations handle page load.
  // This was causing race conditions and double-animations.
  // Keep this function for API compatibility but make it a no-op.

  if (!pageLoadComplete) {
    pageLoadComplete = true;
    document.body.classList.add('page-load-complete');
  }

  return Promise.resolve();
}

// NOTE: Page load entrance enhancements (enhanceAvatarEntrance, addEntranceWarmth,
// enhanceControlsEntrance) have been removed. CSS entrance animations in .app-loaded
// are now the single source of truth for page load. These can be recovered from
// git history (commit before this change) if ever needed for special occasions.

// ============================================================================
// PERSONA TRANSITION - Handoff animations
// ============================================================================

/**
 * Animate persona transition with Pixar principles.
 * Like a character stepping aside for another.
 */
export function animatePersonaTransition(
  fromPersonaId: string,
  toPersonaId: string
): Promise<void> {
  return new Promise((resolve) => {
    if (prefersReducedMotion()) {
      resolve();
      return;
    }

    const avatar = document.querySelector('.avatar-container');
    const name = document.getElementById('personaName');
    const subtitle = document.getElementById('personaSubtitle');

    if (!avatar || !(avatar instanceof HTMLElement)) {
      resolve();
      return;
    }

    // Get persona animation profiles for timing
    const fromProfile = getPersonaAnimationProfile(fromPersonaId);
    const toProfile = getPersonaAnimationProfile(toPersonaId);

    // Exit animation - current persona steps aside
    const exitAnimation = avatar.animate([
      { transform: 'scale(1) rotate(0deg)', opacity: 1 },
      { transform: 'scale(0.9) rotate(-3deg)', opacity: 0.8 },
      { transform: 'scale(0.85) rotate(-5deg) translateX(-20px)', opacity: 0 },
    ], {
      duration: DURATION.SLOW * (fromProfile?.timingMultiplier || 1),
      easing: getEasing('easeInOut'),
      fill: 'forwards',
    });

    trackAnimation('persona-exit', exitAnimation);

    exitAnimation.onfinish = () => {
      // Midpoint - quick change
      // (The actual persona change happens in app.ts)

      // Entry animation - new persona arrives
      trackedTimeout(() => {
        const entryAnimation = avatar.animate([
          { transform: 'scale(0.85) rotate(5deg) translateX(20px)', opacity: 0 },
          { transform: 'scale(0.95) rotate(2deg)', opacity: 0.8 },
          { transform: 'scale(1.03) rotate(-1deg)', opacity: 1 },
          { transform: 'scale(1) rotate(0deg)', opacity: 1 },
        ], {
          duration: DURATION.MODERATE * (toProfile?.timingMultiplier || 1),
          easing: getEasing(toProfile?.easingPreference || 'playful'),
          fill: 'forwards',
        });

        trackAnimation('persona-entry', entryAnimation);

        entryAnimation.onfinish = () => {
          avatar.style.transform = '';
          avatar.style.opacity = '';
          resolve();
        };
      }, 50);
    };

    // Also animate text
    if (name && subtitle) {
      [name, subtitle].forEach(el => {
        el.animate([
          { opacity: 1 },
          { opacity: 0 },
        ], {
          duration: DURATION.NORMAL,
          fill: 'forwards',
        });
      });

      trackedTimeout(() => {
        [name, subtitle].forEach(el => {
          el.animate([
            { opacity: 0, transform: 'translateY(5px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ], {
            duration: DURATION.SLOW,
            easing: getEasing('easeOutExpo'),
            fill: 'forwards',
          });
        });
      }, 350);
    }
  });
}

// ============================================================================
// PIXAR REACTIONS - Anticipation + Action + Follow-through
// ============================================================================

/**
 * Play a reaction with Pixar's three phases.
 * Every action has: Anticipation → Action → Follow-through
 */
export function playCharacterReaction(
  element: HTMLElement,
  type: 'bounce' | 'nod' | 'shake' | 'joy' | 'attention' | 'curious-tilt',
  personaId?: string
): Promise<void> {
  return new Promise((resolve) => {
    if (prefersReducedMotion() || !canRunAnimation()) {
      resolve();
      return;
    }

    const profile = personaId ? getPersonaAnimationProfile(personaId) : null;
    const timingMultiplier = profile?.timingMultiplier || 1;
    const bounciness = profile?.bounciness || 0.5;

    const reactions: Record<string, Keyframe[]> = {
      bounce: [
        // Anticipation - squash down
        { transform: 'scale(1) translateY(0)', offset: 0 },
        { transform: 'scale(1.02, 0.98) translateY(2px)', offset: 0.15 },
        // Action - spring up
        { transform: `scale(${0.95 + bounciness * 0.1}, ${1.05 + bounciness * 0.05}) translateY(-${8 + bounciness * 8}px)`, offset: 0.4 },
        // Follow-through - overshoot
        { transform: 'scale(1.01, 0.99) translateY(-2px)', offset: 0.6 },
        // Settle
        { transform: 'scale(0.99, 1.01) translateY(1px)', offset: 0.8 },
        { transform: 'scale(1) translateY(0)', offset: 1 },
      ],
      nod: [
        { transform: 'rotate(0deg) translateY(0)', offset: 0 },
        { transform: 'rotate(3deg) translateY(3px)', offset: 0.2 },
        { transform: 'rotate(-4deg) translateY(-5px)', offset: 0.4 },
        { transform: 'rotate(2deg) translateY(2px)', offset: 0.6 },
        { transform: 'rotate(-1deg) translateY(-1px)', offset: 0.8 },
        { transform: 'rotate(0deg) translateY(0)', offset: 1 },
      ],
      shake: [
        { transform: 'translateX(0) rotate(0deg)', offset: 0 },
        { transform: 'translateX(-4px) rotate(-2deg)', offset: 0.15 },
        { transform: 'translateX(4px) rotate(2deg)', offset: 0.3 },
        { transform: 'translateX(-3px) rotate(-1.5deg)', offset: 0.45 },
        { transform: 'translateX(2px) rotate(1deg)', offset: 0.6 },
        { transform: 'translateX(-1px) rotate(-0.5deg)', offset: 0.8 },
        { transform: 'translateX(0) rotate(0deg)', offset: 1 },
      ],
      joy: [
        { transform: 'scale(1) translateY(0) rotate(0deg)', filter: 'brightness(1)', offset: 0 },
        { transform: 'scale(1.08, 0.92) translateY(3px) rotate(-2deg)', filter: 'brightness(1.05)', offset: 0.15 },
        { transform: 'scale(0.94, 1.08) translateY(-12px) rotate(3deg)', filter: 'brightness(1.15)', offset: 0.35 },
        { transform: 'scale(1.02, 0.98) translateY(-2px) rotate(-1deg)', filter: 'brightness(1.1)', offset: 0.55 },
        { transform: 'scale(0.98, 1.02) translateY(2px) rotate(0.5deg)', filter: 'brightness(1.05)', offset: 0.75 },
        { transform: 'scale(1) translateY(0) rotate(0deg)', filter: 'brightness(1)', offset: 1 },
      ],
      attention: [
        { transform: 'scale(1) rotate(0deg)', offset: 0 },
        { transform: 'scale(0.98) rotate(-1deg)', offset: 0.2 },
        { transform: 'scale(1.04) rotate(1deg)', offset: 0.5 },
        { transform: 'scale(1.01) rotate(0.3deg)', offset: 0.7 },
        { transform: 'scale(1) rotate(0deg)', offset: 1 },
      ],
      'curious-tilt': [
        { transform: 'rotate(0deg) translateX(0)', offset: 0 },
        { transform: 'rotate(-4deg) translateX(-2px)', offset: 0.3 },
        { transform: 'rotate(3deg) translateX(1px)', offset: 0.6 },
        { transform: 'rotate(0deg) translateX(0)', offset: 1 },
      ],
    };

    const keyframes = reactions[type] ?? reactions.bounce;
    if (!keyframes) {
      resolve();
      return;
    }
    const baseDuration = type === 'joy' ? 650 : type === 'curious-tilt' ? 800 : 500;

    const animation = element.animate(keyframes, {
      duration: baseDuration * timingMultiplier,
      easing: getEasing(profile?.easingPreference || 'playful'),
      fill: 'forwards',
    });

    budget.currentActive++;
    trackAnimation(`reaction-${type}`, animation);

    animation.onfinish = () => {
      budget.currentActive--;
      element.style.transform = '';
      resolve();
    };
  });
}

// ============================================================================
// MICRO-INTERACTIONS
// ============================================================================

/**
 * Button hover anticipation effect.
 * Like the button is "reaching" toward the cursor.
 */
export function applyButtonAnticipation(button: HTMLElement): () => void {
  if (prefersReducedMotion()) return () => {};

  const handleMouseEnter = () => {
    button.animate([
      { transform: 'scale(1) translateY(0)' },
      { transform: 'scale(0.98) translateY(1px)' },
    ], {
      duration: 80,
      easing: 'cubic-bezier(0.38, -0.4, 0.88, 0.65)',
      fill: 'forwards',
    });
  };

  const handleMouseLeave = () => {
    button.animate([
      { transform: 'scale(0.98) translateY(1px)' },
      { transform: 'scale(1.02) translateY(-1px)' },
      { transform: 'scale(1) translateY(0)' },
    ], {
      duration: DURATION.NORMAL,
      easing: getEasing('easeOutBack'),
      fill: 'forwards',
    });
  };

  const handleMouseDown = () => {
    button.animate([
      { transform: 'scale(0.95) translateY(2px)' },
    ], {
      duration: 50,
      easing: 'ease-in',
      fill: 'forwards',
    });
  };

  const handleMouseUp = () => {
    button.animate([
      { transform: 'scale(0.95) translateY(2px)' },
      { transform: 'scale(1.03) translateY(-2px)' },
      { transform: 'scale(1) translateY(0)' },
    ], {
      duration: DURATION.STANDARD,
      easing: getEasing('easeOutBack'),
      fill: 'forwards',
    });
  };

  button.addEventListener('mouseenter', handleMouseEnter);
  button.addEventListener('mouseleave', handleMouseLeave);
  button.addEventListener('mousedown', handleMouseDown);
  button.addEventListener('mouseup', handleMouseUp);

  // Return cleanup function
  return () => {
    button.removeEventListener('mouseenter', handleMouseEnter);
    button.removeEventListener('mouseleave', handleMouseLeave);
    button.removeEventListener('mousedown', handleMouseDown);
    button.removeEventListener('mouseup', handleMouseUp);
  };
}

/**
 * Create a ripple effect from a point.
 */
export function createRipple(
  container: HTMLElement,
  x: number,
  y: number,
  color?: string
): void {
  if (prefersReducedMotion()) return;

  const ripple = document.createElement('div');
  ripple.className = 'animation-ripple';
  
  const rect = container.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2;
  
  ripple.style.cssText = `
    position: absolute;
    left: ${x - rect.left - size / 2}px;
    top: ${y - rect.top - size / 2}px;
    width: ${size}px;
    height: ${size}px;
    background: ${color || 'var(--persona-glow, rgba(74, 103, 65, 0.3))'};
    border-radius: 50%;
    pointer-events: none;
    transform: scale(0);
    opacity: 0.6;
  `;

  container.appendChild(ripple);

  const animation = ripple.animate([
    { transform: 'scale(0)', opacity: 0.6 },
    { transform: 'scale(1)', opacity: 0 },
  ], {
    duration: DURATION.DRAMATIC,
    easing: EASING.DECELERATE,
  });

  animation.onfinish = () => {
    ripple.remove();
  };
}

// ============================================================================
// CELEBRATION EFFECTS
// ============================================================================

/**
 * Warm glow celebration - zen aesthetic.
 * Warmth spreads outward like sunlight.
 */
export function warmthCelebration(target?: HTMLElement): void {
  if (prefersReducedMotion()) return;

  const element = target || document.querySelector('.avatar-container');
  if (!element || !(element instanceof HTMLElement)) return;

  // Create glow overlay
  const glow = document.createElement('div');
  glow.className = 'warmth-glow-effect';
  glow.style.cssText = `
    position: absolute;
    inset: -20px;
    border-radius: inherit;
    background: radial-gradient(circle, var(--persona-glow, rgba(251, 191, 36, 0.4)) 0%, transparent 70%);
    opacity: 0;
    pointer-events: none;
  `;

  element.style.position = element.style.position || 'relative';
  element.appendChild(glow);

  const animation = glow.animate([
    { opacity: 0, transform: 'scale(0.8)' },
    { opacity: 0.8, transform: 'scale(1.1)' },
    { opacity: 0.6, transform: 'scale(1.05)' },
    { opacity: 0, transform: 'scale(1.15)' },
  ], {
    duration: DURATION.ENTRANCE + DURATION.NORMAL, // ~1200ms
    easing: EASING.STANDARD,
  });

  animation.onfinish = () => {
    glow.remove();
  };
}

// ============================================================================
// ANIMATION UTILITIES
// ============================================================================

/**
 * Check if we can run another animation (budget management).
 */
function canRunAnimation(): boolean {
  return budget.currentActive < budget.maxActiveAnimations;
}

/**
 * Track an animation for cleanup.
 */
function trackAnimation(id: string, animation: Animation): void {
  const existing = activeAnimations.get(id) || [];
  existing.push(animation);
  activeAnimations.set(id, existing);

  animation.onfinish = () => {
    const animations = activeAnimations.get(id);
    if (animations) {
      const index = animations.indexOf(animation);
      if (index > -1) {
        animations.splice(index, 1);
      }
    }
  };
}

/**
 * Cancel all animations of a type.
 */
export function cancelAnimations(id: string): void {
  const animations = activeAnimations.get(id);
  if (animations) {
    animations.forEach(anim => anim.cancel());
    activeAnimations.delete(id);
  }
}

/**
 * Cancel all active animations.
 */
export function cancelAllAnimations(): void {
  activeAnimations.forEach((animations) => {
    animations.forEach(anim => anim.cancel());
  });
  activeAnimations.clear();
  budget.currentActive = 0;
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  cancelAllAnimations();
}

// ============================================================================
// EXPORTS
// ============================================================================

export const animationOrchestrator = {
  init: initAnimationOrchestrator,
  runPageLoadSequence,
  animatePersonaTransition,
  playCharacterReaction,
  applyButtonAnticipation,
  createRipple,
  warmthCelebration,
  cancelAnimations,
  cancelAllAnimations,
  dispose,
  // Expose state for debugging
  get isPageLoadComplete() { return pageLoadComplete; },
  get budget() { return { ...budget }; },
};

