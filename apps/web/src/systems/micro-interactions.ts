/**
 * Micro-Interactions Vocabulary
 *
 * "The difference between a good product and a great product is often
 * in the details - those tiny moments that make you smile."
 * - Dan Saffer, Microinteractions
 *
 * This system defines a complete vocabulary of 0.1-0.3 second magic moments:
 * - Button press depth
 * - Card hover lift
 * - Input focus glow
 * - Toggle snap
 * - Slider drag feel
 * - Checkbox mark draw
 *
 * These are the moments that make Apple products feel premium and
 * Google's Material Design feel polished. But we're going further.
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import {
  calculatePhysicsAnimation,
  getPresetPhysics,
  animateSpring,
  type Mass,
  type Material,
} from './physics.js';
import { triggerSecondaryActions, react } from './secondary-action.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Micro-interaction state
 */
export type MicroState =
  | 'idle'
  | 'hover'
  | 'focus'
  | 'press'
  | 'active'
  | 'disabled'
  | 'loading';

/**
 * Micro-interaction configuration
 */
export interface MicroConfig {
  /** Duration in ms (default: based on physics) */
  duration?: number;
  /** Intensity multiplier (0-1, default: 1) */
  intensity?: number;
  /** Whether to trigger secondary actions */
  triggerSecondary?: boolean;
  /** Whether to apply haptic feedback (if available) */
  haptic?: boolean;
  /** Sound effect to play (if available) */
  sound?: string;
}

/**
 * Haptic feedback types
 */
export type HapticType = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error';

// ─────────────────────────────────────────────────────────────────────────────
// Haptic Feedback (for supported devices)
// ─────────────────────────────────────────────────────────────────────────────

const HAPTIC_PATTERNS: Record<HapticType, number[]> = {
  light: [10],
  medium: [25],
  heavy: [50],
  selection: [10],
  success: [10, 50, 30],
  warning: [20, 40, 20],
  error: [30, 30, 30, 30],
};

/**
 * Trigger haptic feedback if available
 */
export function triggerHaptic(type: HapticType): void {
  if (!('vibrate' in navigator)) return;

  const pattern = HAPTIC_PATTERNS[type];
  navigator.vibrate(pattern);
}

// ─────────────────────────────────────────────────────────────────────────────
// Button Micro-Interactions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply button press micro-interaction.
 * This is the 100ms moment when a button feels "real".
 */
export function buttonPress(
  element: HTMLElement,
  config: MicroConfig = {}
): Promise<void> {
  const { intensity = 1, triggerSecondary = true, haptic = true } = config;

  // Get physics-based animation
  const physics = getPresetPhysics('button');

  // Apply press transform
  element.style.transition = `transform ${DURATION.FAST}ms ${physics.timing}`;
  element.style.transform = physics.pressTransform;

  // Haptic feedback
  if (haptic) {
    triggerHaptic('light');
  }

  // Secondary actions (icon wobble, shadow)
  if (triggerSecondary) {
    react.press(element, intensity);
  }

  return Promise.resolve();
}

/**
 * Apply button release micro-interaction.
 * The spring-back that makes it feel alive.
 */
export function buttonRelease(
  element: HTMLElement,
  config: MicroConfig = {}
): Promise<void> {
  const { intensity = 1, triggerSecondary = true } = config;

  // Get physics-based animation
  const physics = getPresetPhysics('button');

  // Spring back to normal
  element.style.transition = `transform ${physics.duration}ms ${physics.timing}`;
  element.style.transform = 'scale(1) translateY(0)';

  // Secondary actions
  if (triggerSecondary) {
    react.release(element, intensity);
  }

  return new Promise((resolve) => {
    setTimeout(resolve, physics.duration);
  });
}

/**
 * Apply button hover micro-interaction.
 * The subtle lift that says "I'm interactive".
 */
export function buttonHover(
  element: HTMLElement,
  entering: boolean,
  config: MicroConfig = {}
): void {
  const physics = getPresetPhysics('button');

  if (entering) {
    element.style.transition = `transform ${DURATION.FAST}ms ${EASING.DECELERATE}`;
    element.style.transform = physics.hoverTransform;

    if (config.triggerSecondary !== false) {
      react.hover(element, config.intensity ?? 0.5);
    }
  } else {
    element.style.transition = `transform ${DURATION.NORMAL}ms ${physics.timing}`;
    element.style.transform = 'scale(1) translateY(0)';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Card Micro-Interactions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply card hover lift.
 * Cards float up slightly on hover, shadows deepen.
 */
export function cardHover(
  element: HTMLElement,
  entering: boolean,
  config: MicroConfig = {}
): void {
  const { intensity = 1 } = config;
  const physics = getPresetPhysics('card');

  if (entering) {
    // Lift and shadow deepen
    element.style.transition = `transform ${DURATION.NORMAL}ms ${EASING.DECELERATE}, box-shadow ${DURATION.NORMAL}ms ease-out`;
    element.style.transform = `translateY(-${4 * intensity}px) scale(${1 + 0.01 * intensity})`;
    element.style.boxShadow = `0 ${8 * intensity}px ${16 * intensity}px rgba(0,0,0,${0.1 + 0.05 * intensity})`;
  } else {
    // Settle back down
    element.style.transition = `transform ${DURATION.SLOW}ms ${physics.timing}, box-shadow ${DURATION.SLOW}ms ease-out`;
    element.style.transform = 'translateY(0) scale(1)';
    element.style.boxShadow = '';
  }
}

/**
 * Apply card press (for clickable cards).
 */
export function cardPress(
  element: HTMLElement,
  config: MicroConfig = {}
): void {
  const { intensity = 1, haptic = true } = config;

  element.style.transition = `transform ${DURATION.FAST}ms ease-out`;
  element.style.transform = `scale(${0.98 * (1 / intensity)})`;

  if (haptic) {
    triggerHaptic('light');
  }
}

/**
 * Apply card release.
 */
export function cardRelease(element: HTMLElement): void {
  const physics = getPresetPhysics('card');

  element.style.transition = `transform ${physics.duration}ms ${physics.timing}`;
  element.style.transform = 'scale(1)';
}

// ─────────────────────────────────────────────────────────────────────────────
// Input Micro-Interactions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply input focus glow.
 * The ring that says "I'm listening".
 */
export function inputFocus(
  element: HTMLElement,
  focused: boolean,
  config: MicroConfig = {}
): void {
  const { intensity = 1 } = config;

  if (focused) {
    // Glow appears
    element.style.transition = `box-shadow ${DURATION.FAST}ms ease-out, border-color ${DURATION.FAST}ms ease-out`;
    element.style.boxShadow = `0 0 0 ${3 * intensity}px var(--color-accent-glow, rgba(61, 90, 69, 0.2))`;
    element.style.borderColor = 'var(--color-accent, #3D5A45)';

    // Subtle scale
    element.style.transform = `scale(${1 + 0.005 * intensity})`;
  } else {
    // Glow fades
    element.style.transition = `box-shadow ${DURATION.NORMAL}ms ease-out, border-color ${DURATION.NORMAL}ms ease-out, transform ${DURATION.NORMAL}ms ease-out`;
    element.style.boxShadow = '';
    element.style.borderColor = '';
    element.style.transform = 'scale(1)';
  }
}

/**
 * Input shake on error.
 */
export function inputError(
  element: HTMLElement,
  config: MicroConfig = {}
): Promise<void> {
  const { intensity = 1, haptic = true } = config;

  if (haptic) {
    triggerHaptic('error');
  }

  return react.error(element, intensity);
}

/**
 * Input success checkmark.
 */
export function inputSuccess(
  element: HTMLElement,
  config: MicroConfig = {}
): Promise<void> {
  const { intensity = 1, haptic = true } = config;

  if (haptic) {
    triggerHaptic('success');
  }

  return react.success(element, intensity);
}

// ─────────────────────────────────────────────────────────────────────────────
// Toggle Micro-Interactions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply toggle snap.
 * The satisfying "click" when a toggle changes state.
 */
export function toggleSnap(
  element: HTMLElement,
  active: boolean,
  config: MicroConfig = {}
): Promise<void> {
  const { intensity = 1, haptic = true } = config;

  // Find the toggle thumb
  const thumb = element.querySelector<HTMLElement>('.toggle-thumb, [data-thumb]');

  if (haptic) {
    triggerHaptic('selection');
  }

  // Squash effect on snap
  if (thumb) {
    thumb.style.transition = `transform ${DURATION.FAST}ms ${EASING.SPRING}`;

    // Squash in direction of movement
    const squash = active
      ? `translateX(100%) scaleX(${1.2 * intensity}) scaleY(${0.9 / intensity})`
      : `translateX(0) scaleX(${1.2 * intensity}) scaleY(${0.9 / intensity})`;

    thumb.style.transform = squash;

    return new Promise((resolve) => {
      setTimeout(() => {
        // Settle to final position
        thumb.style.transition = `transform ${DURATION.NORMAL}ms ${EASING.SPRING}`;
        thumb.style.transform = active ? 'translateX(100%)' : 'translateX(0)';
        setTimeout(resolve, DURATION.NORMAL);
      }, DURATION.FAST);
    });
  }

  return Promise.resolve();
}

// ─────────────────────────────────────────────────────────────────────────────
// Checkbox Micro-Interactions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply checkbox check animation.
 * The satisfying checkmark draw.
 */
export function checkboxCheck(
  element: HTMLElement,
  checked: boolean,
  config: MicroConfig = {}
): Promise<void> {
  const { intensity = 1, haptic = true } = config;

  // Find the checkmark SVG path
  const checkmark = element.querySelector<SVGPathElement>('path, .checkmark');

  if (haptic) {
    triggerHaptic('selection');
  }

  if (checkmark && checkmark instanceof SVGPathElement) {
    const length = checkmark.getTotalLength?.() || 20;

    if (checked) {
      // Draw the checkmark
      checkmark.style.strokeDasharray = `${length}`;
      checkmark.style.strokeDashoffset = `${length}`;
      checkmark.style.transition = `stroke-dashoffset ${DURATION.NORMAL * intensity}ms ${EASING.DECELERATE}`;

      // Trigger animation
      requestAnimationFrame(() => {
        checkmark.style.strokeDashoffset = '0';
      });

      // Scale bounce
      element.style.transition = `transform ${DURATION.FAST}ms ${EASING.SPRING}`;
      element.style.transform = `scale(${1.1 * intensity})`;

      return new Promise((resolve) => {
        setTimeout(() => {
          element.style.transform = 'scale(1)';
          setTimeout(resolve, DURATION.FAST);
        }, DURATION.NORMAL);
      });
    } else {
      // Erase the checkmark
      checkmark.style.transition = `stroke-dashoffset ${DURATION.FAST}ms ease-in`;
      checkmark.style.strokeDashoffset = `${length}`;

      return new Promise((resolve) => {
        setTimeout(resolve, DURATION.FAST);
      });
    }
  }

  // Fallback: simple scale animation
  element.style.transition = `transform ${DURATION.FAST}ms ${EASING.SPRING}`;
  element.style.transform = checked ? 'scale(1)' : 'scale(0.9)';

  return new Promise((resolve) => {
    setTimeout(resolve, DURATION.FAST);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Slider Micro-Interactions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply slider drag feel.
 * The thumb grows slightly when grabbed.
 */
export function sliderGrab(
  element: HTMLElement,
  grabbed: boolean,
  config: MicroConfig = {}
): void {
  const { intensity = 1, haptic = true } = config;

  const thumb = element.querySelector<HTMLElement>('.slider-thumb, [data-thumb]');

  if (!thumb) return;

  if (grabbed) {
    if (haptic) {
      triggerHaptic('light');
    }

    thumb.style.transition = `transform ${DURATION.FAST}ms ${EASING.DECELERATE}`;
    thumb.style.transform = `scale(${1.2 * intensity})`;
  } else {
    thumb.style.transition = `transform ${DURATION.NORMAL}ms ${EASING.SPRING}`;
    thumb.style.transform = 'scale(1)';
  }
}

/**
 * Slider tick feedback when passing a notch.
 */
export function sliderTick(config: MicroConfig = {}): void {
  const { haptic = true } = config;

  if (haptic) {
    triggerHaptic('light');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Menu Item Micro-Interactions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply menu item hover.
 */
export function menuItemHover(
  element: HTMLElement,
  entering: boolean,
  config: MicroConfig = {}
): void {
  const { intensity = 1 } = config;

  if (entering) {
    element.style.transition = `transform ${DURATION.FAST}ms ${EASING.DECELERATE}, background-color ${DURATION.FAST}ms ease-out`;
    element.style.transform = `translateX(${4 * intensity}px)`;
    element.style.backgroundColor = 'var(--color-surface-hover, rgba(0,0,0,0.05))';
  } else {
    element.style.transition = `transform ${DURATION.NORMAL}ms ${EASING.SPRING}, background-color ${DURATION.NORMAL}ms ease-out`;
    element.style.transform = 'translateX(0)';
    element.style.backgroundColor = '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip Micro-Interactions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply tooltip appear animation.
 */
export function tooltipAppear(
  element: HTMLElement,
  appearing: boolean,
  config: MicroConfig = {}
): void {
  const { intensity = 1 } = config;
  const physics = getPresetPhysics('tooltip');

  if (appearing) {
    element.style.opacity = '0';
    element.style.transform = `scale(0.95) translateY(${4 * intensity}px)`;

    requestAnimationFrame(() => {
      element.style.transition = `opacity ${DURATION.FAST}ms ease-out, transform ${physics.duration}ms ${physics.timing}`;
      element.style.opacity = '1';
      element.style.transform = 'scale(1) translateY(0)';
    });
  } else {
    element.style.transition = `opacity ${DURATION.FAST}ms ease-in, transform ${DURATION.FAST}ms ease-in`;
    element.style.opacity = '0';
    element.style.transform = `scale(0.95) translateY(${4 * intensity}px)`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal Micro-Interactions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply modal entrance animation.
 * The dramatic reveal that commands attention.
 */
export function modalEntrance(
  element: HTMLElement,
  config: MicroConfig = {}
): Promise<void> {
  const { intensity = 1, haptic = true } = config;
  const physics = getPresetPhysics('modal');

  if (haptic) {
    triggerHaptic('medium');
  }

  // Start state
  element.style.opacity = '0';
  element.style.transform = `scale(0.9) translateY(${20 * intensity}px)`;

  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      element.style.transition = `opacity ${DURATION.NORMAL}ms ease-out, transform ${physics.duration}ms ${physics.timing}`;
      element.style.opacity = '1';
      element.style.transform = 'scale(1) translateY(0)';

      setTimeout(resolve, physics.duration);
    });
  });
}

/**
 * Apply modal exit animation.
 */
export function modalExit(
  element: HTMLElement,
  config: MicroConfig = {}
): Promise<void> {
  const { intensity = 1 } = config;

  element.style.transition = `opacity ${DURATION.FAST}ms ease-in, transform ${DURATION.NORMAL}ms ease-in`;
  element.style.opacity = '0';
  element.style.transform = `scale(0.95) translateY(${10 * intensity}px)`;

  return new Promise((resolve) => {
    setTimeout(resolve, DURATION.NORMAL);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Notification Micro-Interactions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply notification entrance.
 * The attention-grabbing slide-in.
 */
export function notificationEntrance(
  element: HTMLElement,
  from: 'top' | 'bottom' | 'left' | 'right' = 'top',
  config: MicroConfig = {}
): Promise<void> {
  const { intensity = 1, haptic = true } = config;
  const physics = getPresetPhysics('tooltip');

  if (haptic) {
    triggerHaptic('success');
  }

  // Direction-based start position
  const startTransforms: Record<typeof from, string> = {
    top: `translateY(-${100 * intensity}%)`,
    bottom: `translateY(${100 * intensity}%)`,
    left: `translateX(-${100 * intensity}%)`,
    right: `translateX(${100 * intensity}%)`,
  };

  element.style.opacity = '0';
  element.style.transform = startTransforms[from];

  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      element.style.transition = `opacity ${DURATION.FAST}ms ease-out, transform ${physics.duration}ms ${physics.timing}`;
      element.style.opacity = '1';
      element.style.transform = 'translate(0, 0)';

      setTimeout(resolve, physics.duration);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading States
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply loading pulse animation.
 */
export function loadingPulse(element: HTMLElement): () => void {
  let frame: number;
  let phase = 0;

  const animate = () => {
    phase += 0.05;
    const opacity = 0.5 + Math.sin(phase) * 0.3;
    const scale = 1 + Math.sin(phase) * 0.02;

    element.style.opacity = String(opacity);
    element.style.transform = `scale(${scale})`;

    frame = requestAnimationFrame(animate);
  };

  frame = requestAnimationFrame(animate);

  // Return cleanup function
  return () => {
    cancelAnimationFrame(frame);
    element.style.opacity = '';
    element.style.transform = '';
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified Micro-Interaction API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The main micro-interaction interface.
 * Import and use like: micro.button.press(element)
 */
export const micro = {
  button: {
    press: buttonPress,
    release: buttonRelease,
    hover: buttonHover,
  },
  card: {
    hover: cardHover,
    press: cardPress,
    release: cardRelease,
  },
  input: {
    focus: inputFocus,
    error: inputError,
    success: inputSuccess,
  },
  toggle: {
    snap: toggleSnap,
  },
  checkbox: {
    check: checkboxCheck,
  },
  slider: {
    grab: sliderGrab,
    tick: sliderTick,
  },
  menu: {
    hover: menuItemHover,
  },
  tooltip: {
    appear: tooltipAppear,
  },
  modal: {
    enter: modalEntrance,
    exit: modalExit,
  },
  notification: {
    enter: notificationEntrance,
  },
  loading: {
    pulse: loadingPulse,
  },
  haptic: triggerHaptic,
};
