/**
 * Secondary Action System
 *
 * "Secondary action adds richness and dimension to the animation.
 * While a character walks, their arms swing. While they talk, their
 * eyebrows move. These aren't the main action, but they make it real."
 * - Disney Animation: The Illusion of Life
 *
 * In UI terms: When a button is pressed, the icon wobbles slightly.
 * When a card expands, shadows deepen and nearby cards subtly shift.
 * When a notification appears, the bell icon shakes.
 *
 * The magic: Every action feels like it exists in a connected world,
 * not isolated UI components.
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { calculateSpring, type SpringConfig } from './physics.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Primary actions that can trigger secondary reactions
 */
export type PrimaryAction =
  | 'press'         // Button/element pressed
  | 'release'       // Button/element released
  | 'hover'         // Mouse entered
  | 'leave'         // Mouse left
  | 'focus'         // Element focused
  | 'blur'          // Element blurred
  | 'expand'        // Container expanded
  | 'collapse'      // Container collapsed
  | 'appear'        // Element appeared
  | 'disappear'     // Element disappearing
  | 'success'       // Successful action
  | 'error'         // Error occurred
  | 'notification'  // New notification
  | 'transition';   // Page/view transition

/**
 * Secondary action types
 */
export type SecondaryActionType =
  | 'wobble'        // Small rotation oscillation
  | 'bounce'        // Vertical bounce
  | 'shake'         // Horizontal shake
  | 'pulse'         // Scale pulse
  | 'glow'          // Opacity/shadow pulse
  | 'ripple'        // Outward ripple effect
  | 'shift'         // Subtle position shift
  | 'rotate'        // Small rotation
  | 'squeeze'       // Squash and stretch
  | 'shadow-deepen' // Shadow becomes more prominent
  | 'blur-adjust'   // Background blur changes
  | 'color-shift';  // Subtle color change

/**
 * Secondary action configuration
 */
export interface SecondaryAction {
  type: SecondaryActionType;
  /** Delay after primary action (ms) */
  delay: number;
  /** Duration of the secondary action (ms) */
  duration: number;
  /** Intensity multiplier (0-1) */
  intensity: number;
  /** Easing function */
  easing: string;
  /** CSS selector for target elements */
  target?: string;
  /** Custom parameters for specific action types */
  params?: Record<string, number | string>;
}

/**
 * Reaction rule: maps primary actions to secondary actions
 */
export interface ReactionRule {
  primary: PrimaryAction;
  secondaries: SecondaryAction[];
}

/**
 * Context for reaction calculation
 */
export interface ReactionContext {
  /** The element triggering the primary action */
  source: HTMLElement;
  /** Optional intensity override (0-1) */
  intensity?: number;
  /** Whether to include environmental effects */
  includeEnvironment?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Secondary Action Implementations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply a secondary action to an element
 */
function applySecondaryAction(
  element: HTMLElement,
  action: SecondaryAction
): Promise<void> {
  return new Promise((resolve) => {
    const { type, duration, intensity, easing, params } = action;

    // Create animation based on type
    let keyframes: Keyframe[] = [];

    switch (type) {
      case 'wobble': {
        const angle = (params?.angle as number) || 3;
        const scaledAngle = angle * intensity;
        keyframes = [
          { transform: 'rotate(0deg)' },
          { transform: `rotate(${scaledAngle}deg)` },
          { transform: `rotate(-${scaledAngle * 0.7}deg)` },
          { transform: `rotate(${scaledAngle * 0.4}deg)` },
          { transform: 'rotate(0deg)' },
        ];
        break;
      }

      case 'bounce': {
        const height = (params?.height as number) || 5;
        const scaledHeight = height * intensity;
        keyframes = [
          { transform: 'translateY(0)' },
          { transform: `translateY(-${scaledHeight}px)` },
          { transform: 'translateY(0)' },
          { transform: `translateY(-${scaledHeight * 0.4}px)` },
          { transform: 'translateY(0)' },
        ];
        break;
      }

      case 'shake': {
        const distance = (params?.distance as number) || 4;
        const scaledDistance = distance * intensity;
        keyframes = [
          { transform: 'translateX(0)' },
          { transform: `translateX(-${scaledDistance}px)` },
          { transform: `translateX(${scaledDistance}px)` },
          { transform: `translateX(-${scaledDistance * 0.5}px)` },
          { transform: `translateX(${scaledDistance * 0.25}px)` },
          { transform: 'translateX(0)' },
        ];
        break;
      }

      case 'pulse': {
        const scale = 1 + (0.05 * intensity);
        keyframes = [
          { transform: 'scale(1)' },
          { transform: `scale(${scale})` },
          { transform: 'scale(1)' },
        ];
        break;
      }

      case 'glow': {
        const glowIntensity = intensity * 0.3;
        keyframes = [
          { filter: 'brightness(1)' },
          { filter: `brightness(${1 + glowIntensity})` },
          { filter: 'brightness(1)' },
        ];
        break;
      }

      case 'ripple': {
        // Ripple is handled differently - creates a child element
        createRipple(element, intensity, duration);
        setTimeout(resolve, duration);
        return;
      }

      case 'shift': {
        const x = ((params?.x as number) || 0) * intensity;
        const y = ((params?.y as number) || 2) * intensity;
        keyframes = [
          { transform: 'translate(0, 0)' },
          { transform: `translate(${x}px, ${y}px)` },
          { transform: 'translate(0, 0)' },
        ];
        break;
      }

      case 'rotate': {
        const degrees = ((params?.degrees as number) || 5) * intensity;
        keyframes = [
          { transform: 'rotate(0)' },
          { transform: `rotate(${degrees}deg)` },
        ];
        break;
      }

      case 'squeeze': {
        // Squash and stretch - fundamental animation principle
        const squash = 1 - (0.05 * intensity);
        const stretch = 1 + (0.05 * intensity);
        keyframes = [
          { transform: 'scale(1, 1)' },
          { transform: `scale(${stretch}, ${squash})` },
          { transform: `scale(${squash}, ${stretch})` },
          { transform: 'scale(1, 1)' },
        ];
        break;
      }

      case 'shadow-deepen': {
        const shadowIntensity = intensity * 0.3;
        keyframes = [
          { boxShadow: 'var(--shadow-md, 0 4px 6px rgba(0,0,0,0.1))' },
          { boxShadow: `0 ${8 + shadowIntensity * 10}px ${12 + shadowIntensity * 8}px rgba(0,0,0,${0.1 + shadowIntensity})` },
        ];
        break;
      }

      case 'blur-adjust': {
        const blur = (params?.blur as number) || 2;
        const scaledBlur = blur * intensity;
        keyframes = [
          { backdropFilter: 'blur(0px)' },
          { backdropFilter: `blur(${scaledBlur}px)` },
        ];
        break;
      }

      case 'color-shift': {
        const hueShift = ((params?.hue as number) || 10) * intensity;
        keyframes = [
          { filter: 'hue-rotate(0deg)' },
          { filter: `hue-rotate(${hueShift}deg)` },
          { filter: 'hue-rotate(0deg)' },
        ];
        break;
      }
    }

    if (keyframes.length > 0) {
      const animation = element.animate(keyframes, {
        duration,
        easing,
        fill: 'forwards',
      });

      animation.onfinish = () => resolve();
    } else {
      resolve();
    }
  });
}

/**
 * Create a ripple effect element
 */
function createRipple(
  element: HTMLElement,
  intensity: number,
  duration: number
): void {
  const ripple = document.createElement('div');
  const rect = element.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2;

  ripple.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    width: ${size}px;
    height: ${size}px;
    margin-left: ${-size / 2}px;
    margin-top: ${-size / 2}px;
    border-radius: 50%;
    background: currentColor;
    opacity: ${0.1 * intensity};
    transform: scale(0);
    pointer-events: none;
  `;

  // Ensure element has position for ripple positioning
  const position = getComputedStyle(element).position;
  if (position === 'static') {
    element.style.position = 'relative';
  }

  element.appendChild(ripple);

  ripple.animate([
    { transform: 'scale(0)', opacity: 0.1 * intensity },
    { transform: 'scale(1)', opacity: 0 },
  ], {
    duration,
    easing: 'ease-out',
  }).onfinish = () => ripple.remove();
}

// ─────────────────────────────────────────────────────────────────────────────
// Reaction Rules - The Soul of Secondary Action
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default reaction rules mapping primary actions to secondary actions.
 * These create the connected, living feel of the UI.
 */
const DEFAULT_REACTIONS: ReactionRule[] = [
  {
    primary: 'press',
    secondaries: [
      // Icon wobbles when button pressed
      {
        type: 'wobble',
        target: '.icon, svg, [data-icon]',
        delay: 0,
        duration: DURATION.FAST,
        intensity: 0.6,
        easing: EASING.SPRING,
      },
      // Shadow deepens on press
      {
        type: 'shadow-deepen',
        delay: 0,
        duration: DURATION.FAST,
        intensity: 0.5,
        easing: 'ease-out',
      },
    ],
  },

  {
    primary: 'release',
    secondaries: [
      // Subtle bounce back
      {
        type: 'squeeze',
        delay: 0,
        duration: DURATION.NORMAL,
        intensity: 0.4,
        easing: EASING.SPRING,
      },
    ],
  },

  {
    primary: 'hover',
    secondaries: [
      // Icon lifts slightly
      {
        type: 'shift',
        target: '.icon, svg, [data-icon]',
        delay: 0,
        duration: DURATION.FAST,
        intensity: 0.5,
        easing: EASING.DECELERATE,
        params: { y: -2 },
      },
    ],
  },

  {
    primary: 'success',
    secondaries: [
      // Celebration bounce
      {
        type: 'bounce',
        delay: 0,
        duration: DURATION.NORMAL,
        intensity: 0.8,
        easing: EASING.SPRING,
      },
      // Success icon pulse
      {
        type: 'pulse',
        target: '.success-icon, [data-success]',
        delay: 50,
        duration: DURATION.NORMAL,
        intensity: 0.7,
        easing: EASING.SPRING,
      },
      // Glow effect
      {
        type: 'glow',
        delay: 0,
        duration: DURATION.SLOW,
        intensity: 0.6,
        easing: 'ease-out',
      },
    ],
  },

  {
    primary: 'error',
    secondaries: [
      // Error shake
      {
        type: 'shake',
        delay: 0,
        duration: DURATION.NORMAL,
        intensity: 0.8,
        easing: EASING.SPRING,
      },
      // Error icon emphasize
      {
        type: 'pulse',
        target: '.error-icon, [data-error]',
        delay: 100,
        duration: DURATION.FAST,
        intensity: 0.5,
        easing: 'ease-out',
      },
    ],
  },

  {
    primary: 'notification',
    secondaries: [
      // Bell shake
      {
        type: 'wobble',
        target: '.notification-icon, .bell-icon, [data-notification]',
        delay: 0,
        duration: DURATION.NORMAL,
        intensity: 1,
        easing: EASING.SPRING,
        params: { angle: 15 },
      },
      // Badge bounce
      {
        type: 'bounce',
        target: '.badge, .notification-count',
        delay: 100,
        duration: DURATION.FAST,
        intensity: 0.6,
        easing: EASING.SPRING,
      },
    ],
  },

  {
    primary: 'expand',
    secondaries: [
      // Content stretches slightly
      {
        type: 'squeeze',
        delay: 0,
        duration: DURATION.NORMAL,
        intensity: 0.3,
        easing: EASING.SPRING,
      },
      // Shadow expands
      {
        type: 'shadow-deepen',
        delay: 50,
        duration: DURATION.NORMAL,
        intensity: 0.7,
        easing: 'ease-out',
      },
    ],
  },

  {
    primary: 'collapse',
    secondaries: [
      // Content squishes
      {
        type: 'squeeze',
        delay: 0,
        duration: DURATION.FAST,
        intensity: 0.2,
        easing: 'ease-in',
      },
    ],
  },

  {
    primary: 'appear',
    secondaries: [
      // Gentle arrival bounce
      {
        type: 'squeeze',
        delay: 50,
        duration: DURATION.NORMAL,
        intensity: 0.4,
        easing: EASING.SPRING,
      },
      // Ripple from center
      {
        type: 'ripple',
        delay: 0,
        duration: DURATION.SLOW,
        intensity: 0.5,
        easing: 'ease-out',
      },
    ],
  },

  {
    primary: 'transition',
    secondaries: [
      // Environmental blur adjustment
      {
        type: 'blur-adjust',
        target: '.backdrop, [data-backdrop]',
        delay: 0,
        duration: DURATION.NORMAL,
        intensity: 0.5,
        easing: 'ease-in-out',
        params: { blur: 8 },
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Reaction Engine
// ─────────────────────────────────────────────────────────────────────────────

/** Custom reaction rules (can be extended) */
let customReactions: ReactionRule[] = [];

/**
 * Add custom reaction rules
 */
export function addReactionRule(rule: ReactionRule): void {
  customReactions.push(rule);
}

/**
 * Remove a custom reaction rule
 */
export function removeReactionRule(primary: PrimaryAction): void {
  customReactions = customReactions.filter(r => r.primary !== primary);
}

/**
 * Clear all custom reaction rules
 */
export function clearCustomReactions(): void {
  customReactions = [];
}

/**
 * Get all reaction rules (default + custom)
 */
function getAllReactions(): ReactionRule[] {
  return [...DEFAULT_REACTIONS, ...customReactions];
}

/**
 * Trigger secondary actions for a primary action.
 * This is the main API for the Secondary Action system.
 */
export async function triggerSecondaryActions(
  primary: PrimaryAction,
  context: ReactionContext
): Promise<void> {
  const { source, intensity = 1, includeEnvironment = true } = context;
  const reactions = getAllReactions();

  // Find matching rules
  const matchingRules = reactions.filter(r => r.primary === primary);

  if (matchingRules.length === 0) return;

  // Collect all secondary actions
  const allSecondaries = matchingRules.flatMap(r => r.secondaries);

  // Apply each secondary action
  const promises = allSecondaries.map(async (action) => {
    // Skip environmental effects if disabled
    if (!includeEnvironment && isEnvironmentalAction(action.type)) {
      return;
    }

    // Find target elements
    let targets: HTMLElement[];
    if (action.target) {
      targets = Array.from(source.querySelectorAll<HTMLElement>(action.target));
      // If no targets in source, check if source itself matches
      if (targets.length === 0 && source.matches(action.target)) {
        targets = [source];
      }
    } else {
      targets = [source];
    }

    // Apply action to each target with delay
    await new Promise<void>((resolve) => {
      setTimeout(async () => {
        await Promise.all(
          targets.map((target) =>
            applySecondaryAction(target, {
              ...action,
              intensity: action.intensity * intensity,
            })
          )
        );
        resolve();
      }, action.delay);
    });
  });

  await Promise.all(promises);
}

/**
 * Check if an action type affects the environment (not just the element)
 */
function isEnvironmentalAction(type: SecondaryActionType): boolean {
  return ['blur-adjust', 'shadow-deepen', 'ripple'].includes(type);
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Quick trigger for common actions
 */
export const react = {
  press: (element: HTMLElement, intensity = 1) =>
    triggerSecondaryActions('press', { source: element, intensity }),

  release: (element: HTMLElement, intensity = 1) =>
    triggerSecondaryActions('release', { source: element, intensity }),

  hover: (element: HTMLElement, intensity = 1) =>
    triggerSecondaryActions('hover', { source: element, intensity }),

  success: (element: HTMLElement, intensity = 1) =>
    triggerSecondaryActions('success', { source: element, intensity }),

  error: (element: HTMLElement, intensity = 1) =>
    triggerSecondaryActions('error', { source: element, intensity }),

  notification: (element: HTMLElement, intensity = 1) =>
    triggerSecondaryActions('notification', { source: element, intensity }),

  expand: (element: HTMLElement, intensity = 1) =>
    triggerSecondaryActions('expand', { source: element, intensity }),

  collapse: (element: HTMLElement, intensity = 1) =>
    triggerSecondaryActions('collapse', { source: element, intensity }),

  appear: (element: HTMLElement, intensity = 1) =>
    triggerSecondaryActions('appear', { source: element, intensity }),

  transition: (element: HTMLElement, intensity = 1) =>
    triggerSecondaryActions('transition', { source: element, intensity }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Auto-Binding for Interactive Elements
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bind secondary actions to an element's events.
 * Returns a cleanup function.
 */
export function bindSecondaryActions(element: HTMLElement): () => void {
  const handlers: Array<[string, EventListener]> = [];

  const addHandler = (event: string, handler: EventListener) => {
    element.addEventListener(event, handler);
    handlers.push([event, handler]);
  };

  // Press/release
  addHandler('mousedown', () => react.press(element));
  addHandler('mouseup', () => react.release(element));
  addHandler('touchstart', () => react.press(element));
  addHandler('touchend', () => react.release(element));

  // Hover
  addHandler('mouseenter', () => react.hover(element));

  // Focus
  addHandler('focus', () =>
    triggerSecondaryActions('focus', { source: element })
  );
  addHandler('blur', () =>
    triggerSecondaryActions('blur', { source: element })
  );

  // Cleanup function
  return () => {
    handlers.forEach(([event, handler]) => {
      element.removeEventListener(event, handler);
    });
  };
}

/**
 * Auto-bind secondary actions to all interactive elements in a container.
 */
export function autoBindSecondaryActions(container: HTMLElement): () => void {
  const selector = 'button, [role="button"], a, input, [tabindex]:not([tabindex="-1"])';
  const elements = Array.from(container.querySelectorAll<HTMLElement>(selector));

  const cleanups = elements.map(bindSecondaryActions);

  return () => {
    cleanups.forEach(cleanup => cleanup());
  };
}
