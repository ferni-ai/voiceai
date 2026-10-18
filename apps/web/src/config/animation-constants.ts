/**
 * Animation Constants - Centralized Timing & Easing System
 *
 * 🎬 PIXAR-INSPIRED ANIMATION ARCHITECTURE
 *
 * All animations should use these constants for consistency.
 * Timing is based on golden ratio and Fibonacci sequence for natural rhythm.
 *
 * TIMING TIERS:
 * - MICRO: 50-100ms - Immediate feedback (button press, toggle)
 * - FAST: 150-200ms - Quick transitions (hover, focus)
 * - NORMAL: 200-300ms - Standard animations (fade, slide)
 * - SLOW: 400-500ms - Deliberate movements (modal, panel)
 * - DRAMATIC: 600-800ms - Emphasis animations (celebration, entrance)
 * - AMBIENT: 3000ms+ - Background effects (breathing, floating)
 *
 * EASING CATEGORIES:
 * - Standard: For most UI transitions
 * - Spring: For playful, bouncy effects
 * - Anticipation: For "wind-up before action" effects
 * - Follow-through: For settling after action
 *
 * ANIMATION STANDARDS (measured in the dev app, 2026-10; see PR #1034):
 * 1. Animate transform and opacity only. filter, box-shadow, border-width,
 *    width/height/top/left and text rewrites repaint or re-layout every frame.
 *    For a glow, fade the opacity of a pre-painted layer instead.
 * 2. Durations come from DURATION / ANIMATION_PRESET, never literals. A
 *    response to an event (a handoff, a tap) shows its result in the next
 *    frame and settles within DURATION.MODERATE; never await a sound or a
 *    timer before showing it.
 * 3. One engine per element: WAAPI (safeAnimate) or CSS or GSAP, not two on
 *    the same property. Overlap phases in one timeline; don't chain timeouts.
 * 4. Reduced motion: go through safeAnimate(), which keeps opacity and pins
 *    motion to its end state. CSS animations need a prefers-reduced-motion rule.
 * 5. Nothing runs per frame while idle. No rAF loop that writes styles when
 *    nothing changed, and never a per-frame custom property on :root (it
 *    re-runs style for the whole document). Write on change, to the element
 *    that uses it. will-change only while an animation runs.
 * 6. Measure layouts per second, not only style and task time. Two shapes
 *    looked cheap and weren't: any animation on an anchor-positioned element
 *    re-runs anchor layout every frame (60 layouts/s, PR #1248's connect
 *    glow), and `composite: 'add'` keeps an animation off the compositor.
 */

// ============================================================================
// RE-EXPORTS FROM GENERATED FILE
// These constants are auto-generated from design-system/tokens/animation.json
// ============================================================================
import { DURATION_GENERATED, EASING_GENERATED } from './animation-constants.generated.js';

export {
  AVATAR_SQUASH_STRETCH,
  PERSONA_ANIMATION_PROFILES,
} from './animation-constants.generated.js';

// ============================================================================
// DURATION CONSTANTS (ms)
// The one duration scale, shared with CSS (--duration-*). Edit
// design-system/tokens/animation.json `durations`, then run
// `pnpm build:design-system`; CI fails when the generated file is stale.
// ============================================================================

export const DURATION = DURATION_GENERATED;

// Fibonacci-based timing (φ-ratio based)
export const FIBONACCI_DURATION = {
  F5: 55, // ~φ^5 / 100
  F6: 89, // ~φ^6 / 100
  F7: 144, // ~φ^7 / 100
  F8: 233, // ~φ^8 / 100
  F9: 377, // ~φ^9 / 100
  F10: 610, // ~φ^10 / 100
  F11: 987, // ~φ^11 / 100
  F12: 1597, // ~φ^12 / 100
} as const;

// ============================================================================
// EASING CURVES
// Named timing functions, shared with CSS (--ease-*). Source of truth:
// design-system/tokens/animation.json `easings`. SPRING is the one spring curve.
// ============================================================================

export const EASING = EASING_GENERATED;

// ============================================================================
// ANIMATION PRESETS
// Pre-configured animation options for common use cases
// ============================================================================

export const ANIMATION_PRESET = {
  // Button interactions
  BUTTON_PRESS: {
    duration: DURATION.FAST_PRESS,
    easing: EASING.ANTICIPATE,
  },
  BUTTON_RELEASE: {
    duration: DURATION.STANDARD,
    easing: EASING.SPRING,
  },

  // Hover effects
  HOVER_IN: {
    duration: DURATION.FAST,
    easing: EASING.DECELERATE,
  },
  HOVER_OUT: {
    duration: DURATION.NORMAL,
    easing: EASING.GENTLE,
  },

  // Focus states
  FOCUS_RING: {
    duration: DURATION.FAST_RELEASE,
    easing: EASING.SPRING_GENTLE,
  },

  // Content transitions
  FADE: {
    duration: DURATION.NORMAL,
    easing: EASING.STANDARD,
  },
  SLIDE: {
    duration: DURATION.SLOW,
    easing: EASING.EXPO_OUT,
  },

  // Avatar reactions (character-quality)
  REACTION_QUICK: {
    duration: DURATION.SLOW,
    easing: EASING.SPRING,
  },
  REACTION_DELIBERATE: {
    duration: DURATION.DELIBERATE,
    easing: EASING.SPRING,
  },
  REACTION_DRAMATIC: {
    duration: DURATION.DRAMATIC,
    easing: EASING.SPRING_STRONG,
  },

  // Team member animations
  TEAM_HOVER: {
    duration: DURATION.NORMAL,
    easing: EASING.SPRING_GENTLE,
  },
  TEAM_SELECT: {
    duration: DURATION.MODERATE,
    easing: EASING.SPRING,
  },

  // Celebration effects
  CELEBRATION: {
    duration: DURATION.CELEBRATION,
    easing: EASING.SPRING,
  },

  // Ambient effects
  BREATHING: {
    duration: DURATION.AMBIENT_SLOW,
    easing: EASING.EASE_IN_OUT,
  },

  // Glow/warmth
  GLOW_PULSE: {
    duration: DURATION.ENTRANCE,
    easing: EASING.GENTLE,
  },
} as const;

// ============================================================================
// STAGGER DELAYS
// For cascading animations
// ============================================================================

export const STAGGER = {
  TIGHT: 30, // Very tight cascade (fast lists)
  NORMAL: 50, // Standard stagger
  RELAXED: 80, // Relaxed cascade
  DRAMATIC: 120, // Dramatic reveal
  SLOW: 150, // Slow cascade for emphasis
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get animation options with persona timing multiplier applied.
 */
export function getPersonaAdjustedTiming(
  baseDuration: number,
  personaMultiplier: number = 1
): number {
  return Math.round(baseDuration * personaMultiplier);
}

/**
 * Check if user prefers reduced motion.
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** Keyframe keys that are not motion: they still play under reduced motion. */
const NON_MOTION_KEYS = new Set(['opacity', 'offset', 'easing', 'composite']);

/**
 * Reduced-motion version of a keyframe list: every motion property (transform,
 * scale, position, glow...) is pinned to its final value, so the element lands
 * exactly where the full animation would leave it; only opacity still changes.
 */
export function toReducedMotionKeyframes(keyframes: Keyframe[]): Keyframe[] {
  const last = keyframes[keyframes.length - 1] ?? {};
  const settled: Keyframe = {};
  for (const [key, value] of Object.entries(last)) {
    if (!NON_MOTION_KEYS.has(key)) settled[key] = value;
  }
  const frames = keyframes.map((frame) => {
    const kept: Keyframe = { ...settled };
    for (const key of NON_MOTION_KEYS) if (key in frame) kept[key] = frame[key];
    return kept;
  });
  return frames.length > 1 ? frames : [settled, settled];
}

/**
 * element.animate() that respects prefers-reduced-motion. With reduced motion
 * the animation plays once as an opacity-only fade (or instantly, when it has
 * no opacity) and ends in the same state the full animation would.
 */
export function safeAnimate(
  element: Element,
  keyframes: Keyframe[],
  options?: number | KeyframeAnimationOptions
): Animation {
  if (!prefersReducedMotion()) return element.animate(keyframes, options);
  const timing: KeyframeAnimationOptions = typeof options === 'number' ? { duration: options } : { ...options };
  const fades = keyframes.some((frame) => 'opacity' in frame);
  return element.animate(toReducedMotionKeyframes(keyframes), {
    ...timing,
    duration: fades ? timing.duration : 0,
    iterations: 1,
  });
}

/**
 * Get reduced motion fallback duration (instant).
 */
export function getAccessibleDuration(duration: number): number {
  return prefersReducedMotion() ? 1 : duration;
}

/**
 * Create staggered delays for an array of elements.
 */
export function createStaggerDelays(count: number, baseDelay: number = STAGGER.NORMAL): number[] {
  return Array.from({ length: count }, (_, i) => i * baseDelay);
}

// ============================================================================
// ANIMATION SEQUENCING
// For coordinating multi-part animations
// ============================================================================

export interface AnimationStep {
  delay: number;
  duration: number;
  easing: string;
}

/**
 * Create a character-quality 3-phase animation sequence.
 * Every action has: Anticipation → Action → Follow-through
 */
export function createCharacterSequence(baseDuration: number = DURATION.DELIBERATE): {
  anticipation: AnimationStep;
  action: AnimationStep;
  followThrough: AnimationStep;
} {
  return {
    anticipation: {
      delay: 0,
      duration: Math.round(baseDuration * 0.15), // 15% of total
      easing: EASING.ANTICIPATE,
    },
    action: {
      delay: Math.round(baseDuration * 0.15),
      duration: Math.round(baseDuration * 0.55), // 55% of total
      easing: EASING.SPRING,
    },
    followThrough: {
      delay: Math.round(baseDuration * 0.7),
      duration: Math.round(baseDuration * 0.3), // 30% of total
      easing: EASING.GENTLE,
    },
  };
}

// Legacy alias for backward compatibility
export const createPixarSequence = createCharacterSequence;

// ============================================================================
// ANIMATION CONFLICT PREVENTION
// Track what's animating to prevent overlaps
// ============================================================================

const activeAnimationTargets = new Set<string>();

/**
 * Register an animation target to prevent conflicts.
 * Returns false if target is already animating.
 */
export function registerAnimation(targetId: string): boolean {
  if (activeAnimationTargets.has(targetId)) {
    return false; // Already animating
  }
  activeAnimationTargets.add(targetId);
  return true;
}

/**
 * Unregister an animation target.
 */
export function unregisterAnimation(targetId: string): void {
  activeAnimationTargets.delete(targetId);
}

/**
 * Check if a target is currently animating.
 */
export function isAnimating(targetId: string): boolean {
  return activeAnimationTargets.has(targetId);
}

/**
 * Clear all registered animations (for cleanup).
 */
export function clearAllAnimations(): void {
  activeAnimationTargets.clear();
}
