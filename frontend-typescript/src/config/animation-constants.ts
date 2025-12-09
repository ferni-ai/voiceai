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
 */

// ============================================================================
// DURATION CONSTANTS
// Based on design-system/tokens/animation.json
// ============================================================================

export const DURATION = {
  // Micro-interactions (immediate feedback)
  INSTANT: 0,
  MICRO: 50,
  
  // Fast transitions (hover, focus)
  FAST_PRESS: 80,
  FAST: 100,
  FAST_RELEASE: 150,
  
  // Standard transitions
  NORMAL: 200,
  STANDARD: 250,
  
  // Deliberate movements
  SLOW: 300,
  MODERATE: 400,
  
  // Emphasis animations
  DELIBERATE: 500,
  DRAMATIC: 600,
  CELEBRATION: 800,
  
  // Extended animations
  ENTRANCE: 1000,
  GLACIAL: 1500,
  
  // Ambient/background effects
  AMBIENT_FAST: 3000,
  AMBIENT_SLOW: 5000,
  AMBIENT_GLACIAL: 8000,
} as const;

// Fibonacci-based timing (φ-ratio based)
export const FIBONACCI_DURATION = {
  F5: 55,    // ~φ^5 / 100
  F6: 89,    // ~φ^6 / 100
  F7: 144,   // ~φ^7 / 100
  F8: 233,   // ~φ^8 / 100
  F9: 377,   // ~φ^9 / 100
  F10: 610,  // ~φ^10 / 100
  F11: 987,  // ~φ^11 / 100
  F12: 1597, // ~φ^12 / 100
} as const;

// ============================================================================
// EASING CURVES
// Named cubic-bezier functions for consistent feel
// ============================================================================

export const EASING = {
  // Standard Material Design easings
  STANDARD: 'cubic-bezier(0.4, 0, 0.2, 1)',      // Standard deceleration
  DECELERATE: 'cubic-bezier(0.0, 0, 0.2, 1)',   // Fast start, slow end
  ACCELERATE: 'cubic-bezier(0.4, 0, 1, 1)',     // Slow start, fast end
  
  // Spring/Bouncy (character-quality)
  SPRING: 'cubic-bezier(0.34, 1.56, 0.64, 1)',  // Overshoot and settle
  SPRING_GENTLE: 'cubic-bezier(0.25, 1.25, 0.5, 1)',
  SPRING_STRONG: 'cubic-bezier(0.5, 1.8, 0.5, 1)',
  
  // Anticipation (wind-up before action)
  ANTICIPATE: 'cubic-bezier(0.38, -0.4, 0.88, 0.65)',
  ANTICIPATE_GENTLE: 'cubic-bezier(0.6, -0.28, 0.735, 0.045)',
  
  // Expo curves (dramatic)
  EXPO_OUT: 'cubic-bezier(0.16, 1, 0.3, 1)',
  EXPO_IN_OUT: 'cubic-bezier(0.87, 0, 0.13, 1)',
  
  // Gentle/Organic
  GENTLE: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
  ORGANIC: 'cubic-bezier(0.4, 0.2, 0.2, 1.1)',
  
  // Linear (use sparingly)
  LINEAR: 'linear',
  
  // Simple
  EASE_OUT: 'ease-out',
  EASE_IN: 'ease-in',
  EASE_IN_OUT: 'ease-in-out',
} as const;

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
  TIGHT: 30,    // Very tight cascade (fast lists)
  NORMAL: 50,   // Standard stagger
  RELAXED: 80,  // Relaxed cascade
  DRAMATIC: 120, // Dramatic reveal
  SLOW: 150,    // Slow cascade for emphasis
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

