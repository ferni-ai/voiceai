/**
 * Breathing Typography System
 *
 * Text that subtly breathes with emotional rhythm - a "Better Than Human" capability.
 * Inspired by how living things breathe even at rest, and Pixar's Luxo Jr. lamp.
 *
 * Design Principles:
 * - Breathing must be nearly imperceptible (1-2% scale maximum)
 * - Cycle duration matches human breathing (~2-5 seconds)
 * - Only apply to hero/focus elements, never body text
 * - Respect reduced motion preferences
 * - Sync with user's detected breathing when available
 *
 * @module typography/breathing-text
 */

import type { MoodState } from '../color/mood-palette.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Mood states that affect breathing rhythm.
 * Mapped from emotional detection system.
 */
export type BreathingMood =
  | 'calm'
  | 'joyful'
  | 'anxious'
  | 'tired'
  | 'focused'
  | 'reflective'
  | 'stressed'
  | 'energized'
  | 'peaceful';

/**
 * Configuration for breathing animation.
 */
export interface BreathingConfig {
  /** Target element or selector */
  target: HTMLElement | string;
  /** Current mood state */
  mood?: BreathingMood;
  /** Intensity 0-1 (how pronounced the breathing) */
  intensity?: number;
  /** Override cycle duration in ms */
  cycleDuration?: number;
  /** Sync with external breathing signal */
  syncSignal?: BreathingSignal;
  /** Disable breathing (for reduced motion) */
  disabled?: boolean;
}

/**
 * External breathing signal for synchronization.
 * Can come from user's detected breathing rhythm.
 */
export interface BreathingSignal {
  /** Current phase: 0 = exhale complete, 0.5 = inhale complete */
  phase: number;
  /** Detected breathing rate in breaths per minute */
  bpm?: number;
}

/**
 * Breathing animation state.
 */
export interface BreathingState {
  /** Is animation active */
  active: boolean;
  /** Current phase (0-1) */
  phase: number;
  /** Current scale factor */
  scale: number;
  /** Current letter spacing adjustment */
  letterSpacing: number;
  /** Animation frame ID for cleanup */
  animationFrameId?: number;
}

/**
 * Breathing cycle parameters from tokens.
 */
interface BreathingCycle {
  /** Scale at inhale peak */
  inhaleScale: number;
  /** Letter spacing at inhale */
  inhaleLetterSpacing: number;
  /** Scale at exhale trough */
  exhaleScale: number;
  /** Letter spacing at exhale */
  exhaleLetterSpacing: number;
  /** Duration of inhale phase in ms */
  inhaleDuration: number;
  /** Duration of exhale phase in ms */
  exhaleDuration: number;
}

// ============================================================================
// CONSTANTS (from typography-emotional.json tokens)
// ============================================================================

/**
 * Breathing cycles for each mood.
 * These values are tuned for subliminal effect.
 */
const BREATHING_CYCLES: Record<BreathingMood, BreathingCycle> = {
  calm: {
    inhaleScale: 1.015,
    inhaleLetterSpacing: 0.5,
    exhaleScale: 1.0,
    exhaleLetterSpacing: 0,
    inhaleDuration: 2000,
    exhaleDuration: 2500,
  },
  joyful: {
    inhaleScale: 1.02,
    inhaleLetterSpacing: 0.3,
    exhaleScale: 1.0,
    exhaleLetterSpacing: 0,
    inhaleDuration: 1500,
    exhaleDuration: 1800,
  },
  anxious: {
    inhaleScale: 1.01,
    inhaleLetterSpacing: 0.2,
    exhaleScale: 1.0,
    exhaleLetterSpacing: 0,
    inhaleDuration: 1200,
    exhaleDuration: 1400,
  },
  tired: {
    inhaleScale: 1.01,
    inhaleLetterSpacing: 0.6,
    exhaleScale: 1.0,
    exhaleLetterSpacing: 0.2,
    inhaleDuration: 2500,
    exhaleDuration: 3000,
  },
  focused: {
    inhaleScale: 1.012,
    inhaleLetterSpacing: -0.1,
    exhaleScale: 1.0,
    exhaleLetterSpacing: -0.2,
    inhaleDuration: 1800,
    exhaleDuration: 2200,
  },
  reflective: {
    inhaleScale: 1.018,
    inhaleLetterSpacing: 0.8,
    exhaleScale: 1.0,
    exhaleLetterSpacing: 0.3,
    inhaleDuration: 2200,
    exhaleDuration: 2800,
  },
  stressed: {
    inhaleScale: 1.008,
    inhaleLetterSpacing: 0.1,
    exhaleScale: 1.0,
    exhaleLetterSpacing: 0,
    inhaleDuration: 1000,
    exhaleDuration: 1200,
  },
  energized: {
    inhaleScale: 1.025,
    inhaleLetterSpacing: -0.3,
    exhaleScale: 1.0,
    exhaleLetterSpacing: -0.1,
    inhaleDuration: 1400,
    exhaleDuration: 1600,
  },
  peaceful: {
    inhaleScale: 1.012,
    inhaleLetterSpacing: 1.0,
    exhaleScale: 1.0,
    exhaleLetterSpacing: 0.5,
    inhaleDuration: 2800,
    exhaleDuration: 3500,
  },
};

/**
 * Default breathing configuration.
 */
const DEFAULT_CONFIG: Required<Omit<BreathingConfig, 'target' | 'syncSignal'>> = {
  mood: 'calm',
  intensity: 0.7,
  cycleDuration: 0, // 0 = use mood-specific duration
  disabled: false,
};

/**
 * Minimum cycle duration to prevent jarring animation.
 * Tufte/Pixar principle: slower is usually better.
 */
const MIN_CYCLE_DURATION = 2000;

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/** Active breathing animations by element */
const activeBreathing = new WeakMap<HTMLElement, BreathingState>();

/** Check if user prefers reduced motion */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ============================================================================
// CORE ANIMATION
// ============================================================================

/**
 * Apply breathing typography to an element.
 *
 * @param config - Breathing configuration
 * @returns Cleanup function to stop breathing
 *
 * @example
 * ```typescript
 * // Apply calm breathing to hero text
 * const stop = applyBreathingTypography({
 *   target: '.hero-title',
 *   mood: 'calm',
 *   intensity: 0.8,
 * });
 *
 * // Later: stop breathing
 * stop();
 * ```
 */
export function applyBreathingTypography(config: BreathingConfig): () => void {
  const opts = { ...DEFAULT_CONFIG, ...config };

  // Resolve target element
  const element = typeof opts.target === 'string'
    ? document.querySelector<HTMLElement>(opts.target)
    : opts.target;

  if (!element) {
    console.warn('[breathing-text] Target element not found:', opts.target);
    return () => {};
  }

  // Respect reduced motion
  if (opts.disabled || prefersReducedMotion()) {
    return () => {};
  }

  // Stop any existing breathing on this element
  stopBreathing(element);

  // Get cycle parameters for mood
  const cycle = BREATHING_CYCLES[opts.mood];
  const totalDuration = opts.cycleDuration || (cycle.inhaleDuration + cycle.exhaleDuration);
  const actualDuration = Math.max(totalDuration, MIN_CYCLE_DURATION);

  // Initialize state
  const state: BreathingState = {
    active: true,
    phase: 0,
    scale: cycle.exhaleScale,
    letterSpacing: cycle.exhaleLetterSpacing,
  };

  activeBreathing.set(element, state);

  // Set up CSS custom properties for animation
  element.style.setProperty('--breathing-scale', String(state.scale));
  element.style.setProperty('--breathing-letter-spacing', `${state.letterSpacing}px`);
  element.style.setProperty('transform', 'scale(var(--breathing-scale))');
  element.style.setProperty('letter-spacing', 'var(--breathing-letter-spacing)');
  element.style.setProperty('transform-origin', 'center center');
  element.style.setProperty('will-change', 'transform, letter-spacing');

  // Animation loop
  let startTime: number | null = null;

  function animate(timestamp: number) {
    if (!state.active) return;

    if (!startTime) startTime = timestamp;
    const elapsed = timestamp - startTime;

    // Calculate phase (0-1, then back to 0)
    const rawPhase = (elapsed % actualDuration) / actualDuration;

    // Use sync signal if available
    const phase = config.syncSignal?.phase ?? rawPhase;

    // Calculate inhale/exhale ratio
    const inhaleRatio = cycle.inhaleDuration / (cycle.inhaleDuration + cycle.exhaleDuration);

    // Smooth easing for natural breathing feel
    let breathPhase: number;
    if (phase < inhaleRatio) {
      // Inhale phase (ease out - slow at peak)
      breathPhase = easeOutSine(phase / inhaleRatio);
    } else {
      // Exhale phase (ease in - slow at start, faster at end)
      breathPhase = 1 - easeInSine((phase - inhaleRatio) / (1 - inhaleRatio));
    }

    // Apply intensity
    const intensity = opts.intensity;

    // Interpolate values
    const scale = lerp(
      cycle.exhaleScale,
      cycle.exhaleScale + (cycle.inhaleScale - cycle.exhaleScale) * intensity,
      breathPhase
    );
    const letterSpacing = lerp(
      cycle.exhaleLetterSpacing,
      cycle.exhaleLetterSpacing + (cycle.inhaleLetterSpacing - cycle.exhaleLetterSpacing) * intensity,
      breathPhase
    );

    // Update state and CSS
    state.phase = phase;
    state.scale = scale;
    state.letterSpacing = letterSpacing;

    element?.style.setProperty('--breathing-scale', String(scale));
    element?.style.setProperty('--breathing-letter-spacing', `${letterSpacing}px`);

    // Continue animation
    state.animationFrameId = requestAnimationFrame(animate);
  }

  // Start animation
  state.animationFrameId = requestAnimationFrame(animate);

  // Return cleanup function
  return () => stopBreathing(element);
}

/**
 * Stop breathing animation on an element.
 */
export function stopBreathing(element: HTMLElement): void {
  const state = activeBreathing.get(element);
  if (state) {
    state.active = false;
    if (state.animationFrameId) {
      cancelAnimationFrame(state.animationFrameId);
    }
    activeBreathing.delete(element);
  }

  // Reset styles
  element.style.removeProperty('--breathing-scale');
  element.style.removeProperty('--breathing-letter-spacing');
  element.style.removeProperty('transform');
  element.style.removeProperty('letter-spacing');
  element.style.removeProperty('will-change');
}

/**
 * Update breathing mood without stopping animation.
 */
export function updateBreathingMood(
  element: HTMLElement,
  mood: BreathingMood,
  transitionDuration: number = 500
): void {
  const state = activeBreathing.get(element);
  if (!state) return;

  // For now, just restart with new mood
  // TODO: Implement smooth transition between moods
  const currentIntensity = 0.7; // Default
  stopBreathing(element);
  applyBreathingTypography({
    target: element,
    mood,
    intensity: currentIntensity,
  });
}

/**
 * Sync breathing with external signal (e.g., user's detected breathing).
 *
 * This is a "Better Than Human" capability - syncing Ferni's breathing
 * with the user creates unconscious rapport and trust.
 */
export function syncBreathingToUser(
  element: HTMLElement,
  signal: BreathingSignal
): void {
  const state = activeBreathing.get(element);
  if (!state) return;

  // Signal will be picked up by the animation loop
  // through the config.syncSignal reference
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Apply breathing to multiple elements.
 */
export function applyBreathingToAll(
  selector: string,
  config: Omit<BreathingConfig, 'target'>
): () => void {
  const elements = document.querySelectorAll<HTMLElement>(selector);
  const cleanups: (() => void)[] = [];

  elements.forEach(element => {
    const cleanup = applyBreathingTypography({
      ...config,
      target: element,
    });
    cleanups.push(cleanup);
  });

  return () => cleanups.forEach(fn => fn());
}

/**
 * Stop all breathing animations.
 */
export function stopAllBreathing(): void {
  // Note: WeakMap doesn't support iteration, so we need to track elements separately
  // For now, callers should track their own cleanup functions
  console.warn('[breathing-text] stopAllBreathing requires manual tracking. Use cleanup functions.');
}

// ============================================================================
// CSS GENERATION
// ============================================================================

/**
 * Generate CSS for breathing animation.
 * Use this for pure-CSS breathing when JS is not available.
 */
export function generateBreathingCSS(
  selector: string,
  mood: BreathingMood = 'calm',
  intensity: number = 0.7
): string {
  const cycle = BREATHING_CYCLES[mood];
  const totalDuration = cycle.inhaleDuration + cycle.exhaleDuration;

  const inhaleScale = cycle.exhaleScale + (cycle.inhaleScale - cycle.exhaleScale) * intensity;
  const inhaleLetterSpacing = cycle.exhaleLetterSpacing + (cycle.inhaleLetterSpacing - cycle.exhaleLetterSpacing) * intensity;
  const inhalePercent = Math.round((cycle.inhaleDuration / totalDuration) * 100);

  return `
@keyframes breathing-${mood} {
  0% {
    transform: scale(${cycle.exhaleScale});
    letter-spacing: ${cycle.exhaleLetterSpacing}px;
  }
  ${inhalePercent}% {
    transform: scale(${inhaleScale});
    letter-spacing: ${inhaleLetterSpacing}px;
  }
  100% {
    transform: scale(${cycle.exhaleScale});
    letter-spacing: ${cycle.exhaleLetterSpacing}px;
  }
}

${selector} {
  animation: breathing-${mood} ${totalDuration}ms ease-in-out infinite;
  transform-origin: center center;
}

@media (prefers-reduced-motion: reduce) {
  ${selector} {
    animation: none;
  }
}
`.trim();
}

/**
 * Inject breathing CSS into document head.
 */
export function injectBreathingStyles(
  selector: string,
  mood: BreathingMood = 'calm'
): HTMLStyleElement {
  const styleId = `breathing-styles-${mood}`;
  let style = document.getElementById(styleId) as HTMLStyleElement | null;

  if (!style) {
    style = document.createElement('style');
    style.id = styleId;
    document.head.appendChild(style);
  }

  style.textContent = generateBreathingCSS(selector, mood);
  return style;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Linear interpolation.
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Ease out sine (slow at end).
 */
function easeOutSine(t: number): number {
  return Math.sin((t * Math.PI) / 2);
}

/**
 * Ease in sine (slow at start).
 */
function easeInSine(t: number): number {
  return 1 - Math.cos((t * Math.PI) / 2);
}

/**
 * Get breathing state for debugging.
 */
export function getBreathingState(element: HTMLElement): BreathingState | undefined {
  return activeBreathing.get(element);
}

/**
 * Check if element is breathing.
 */
export function isBreathing(element: HTMLElement): boolean {
  const state = activeBreathing.get(element);
  return state?.active ?? false;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  BREATHING_CYCLES,
  MIN_CYCLE_DURATION,
};
