/**
 * 🍞 Toast Notification Choreography
 *
 * Small, cute, centered pill toasts that feel like gentle whispers.
 * Inspired by iOS/macOS subtle notifications.
 *
 * DESIGN PHILOSOPHY:
 * - Centered at bottom (not a corner!)
 * - Pill-shaped, compact
 * - Single line, no icons
 * - Quick in, quick out
 * - Unobtrusive but noticeable
 *
 * @module @ferni/choreography/toast
 */

import { DURATION, EASING } from '../../frontend-typescript/src/config/animation-constants.js';

// ============================================================================
// TOAST DESIGN TOKENS
// ============================================================================

export const TOAST_DESIGN = {
  /**
   * Position - Always bottom center
   */
  position: {
    bottom: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
  },

  /**
   * Shape - Pill (fully rounded), compact
   */
  shape: {
    borderRadius: 'var(--radius-full, 9999px)',
    padding: 'var(--space-2, 8px) var(--space-4, 16px)',
  },

  /**
   * Typography - Small & cute
   */
  typography: {
    fontSize: '13px',
    fontWeight: '500',
    fontFamily: 'var(--font-body, system-ui)',
    whiteSpace: 'nowrap',
  },

  /**
   * Shadow - Subtle, minimal elevation
   */
  shadow: '0 2px 12px rgba(0, 0, 0, 0.12)',

  /**
   * Z-Index - Above everything except modals
   */
  zIndex: 10001,
};

// ============================================================================
// TYPE COLORS - Brand-aligned
// ============================================================================

export const TOAST_COLORS = {
  info: {
    background: 'var(--persona-primary, #4a6741)',
    text: 'white',
  },
  success: {
    background: 'var(--persona-primary, #4a6741)',
    text: 'white',
  },
  warning: {
    background: 'var(--color-warning, #b8956a)',
    text: 'white',
  },
  error: {
    background: 'var(--color-destructive, #a65a52)',
    text: 'white',
  },
} as const;

// ============================================================================
// ANIMATION SPECS
// ============================================================================

export const TOAST_ANIMATION = {
  /**
   * Enter animation
   * Pop up from below with slight scale
   */
  enter: {
    keyframes: [
      {
        opacity: 0,
        transform: 'translateX(-50%) translateY(20px) scale(0.9)',
      },
      {
        opacity: 1,
        transform: 'translateX(-50%) translateY(0) scale(1)',
      },
    ],
    options: {
      duration: DURATION.SLOW, // 300ms
      easing: EASING.SPRING, // Pixar bounce
      fill: 'forwards' as FillMode,
    },
  },

  /**
   * Exit animation
   * Fade up and out
   */
  exit: {
    keyframes: [
      {
        opacity: 1,
        transform: 'translateX(-50%) translateY(0) scale(1)',
      },
      {
        opacity: 0,
        transform: 'translateX(-50%) translateY(-10px) scale(0.95)',
      },
    ],
    options: {
      duration: DURATION.NORMAL, // 200ms
      easing: EASING.STANDARD,
      fill: 'forwards' as FillMode,
    },
  },
};

// ============================================================================
// TIMING
// ============================================================================

export const TOAST_TIMING = {
  /** Default duration before auto-dismiss */
  default: 2500,

  /** Short messages */
  short: 2000,

  /** Important messages */
  long: 4000,

  /** Error messages - give user time to read */
  error: 4000,

  /** Persistent - must dismiss manually */
  persistent: 0,
};

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * Example usage:
 *
 * ```typescript
 * import { toast } from '../ui/toast.ui.js';
 *
 * // Simple messages
 * toast.success('Saved!');
 * toast.info('Updated');
 * toast.warning('Check your input');
 * toast.error('Something went wrong');
 *
 * // With custom config
 * toast.show({
 *   message: 'Custom message',
 *   type: 'info',
 *   duration: 3000
 * });
 * ```
 */

export default {
  design: TOAST_DESIGN,
  colors: TOAST_COLORS,
  animation: TOAST_ANIMATION,
  timing: TOAST_TIMING,
};
