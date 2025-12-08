/**
 * Toast Notification Choreographies
 * Frame-by-frame specifications for toast animations
 */

import { Choreography, EASING, DURATION } from './index.js';

// ============================================================================
// TOAST ENTER
// ============================================================================

/**
 * Toast enter choreography
 * Slide in from top-right with spring
 */
export const TOAST_ENTER_CHOREOGRAPHY: Choreography = {
  name: 'Toast Enter',
  description: 'Toast notification entrance',
  totalDuration: 400,
  
  phases: [
    {
      name: 'slide-spring',
      start: 0,
      end: 400,
      properties: {
        transform: ['translateX(100%) translateY(-10px)', 'translateX(0) translateY(0)'],
        opacity: [0, 1],
      },
      easing: EASING.SPRING_GENTLE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 100,
    properties: {
      opacity: [0, 1],
    },
  },
};

// ============================================================================
// TOAST EXIT
// ============================================================================

/**
 * Toast exit choreography
 */
export const TOAST_EXIT_CHOREOGRAPHY: Choreography = {
  name: 'Toast Exit',
  description: 'Toast notification exit',
  totalDuration: 300,
  
  phases: [
    {
      name: 'slide-out',
      start: 0,
      end: 300,
      properties: {
        transform: ['translateX(0)', 'translateX(100%)'],
        opacity: [1, 0],
      },
      easing: EASING.ACCELERATE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 100,
    properties: {
      opacity: [1, 0],
    },
  },
};

// ============================================================================
// TOAST SWIPE DISMISS
// ============================================================================

/**
 * Toast swipe dismiss choreography
 */
export const TOAST_SWIPE_DISMISS_CHOREOGRAPHY: Choreography = {
  name: 'Toast Swipe Dismiss',
  description: 'User-initiated swipe dismissal',
  totalDuration: 200,
  
  phases: [
    {
      name: 'swipe-out',
      start: 0,
      end: 200,
      properties: {
        transform: ['translateX(var(--swipe-x))', 'translateX(120%)'],
        opacity: [1, 0],
      },
      easing: EASING.ACCELERATE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 100,
    properties: {
      opacity: [1, 0],
    },
  },
};

// ============================================================================
// TOAST STACK SHIFT
// ============================================================================

/**
 * Toast stack shift choreography
 * When a new toast pushes others down
 */
export const TOAST_STACK_SHIFT_CHOREOGRAPHY: Choreography = {
  name: 'Toast Stack Shift',
  description: 'Existing toasts shift when new one arrives',
  totalDuration: 300,
  
  phases: [
    {
      name: 'shift-down',
      start: 0,
      end: 300,
      properties: {
        transform: ['translateY(0)', 'translateY(var(--toast-height))'],
      },
      easing: EASING.SPRING_GENTLE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 100,
    properties: {
      transform: ['translateY(0)', 'translateY(var(--toast-height))'],
    },
  },
};

// ============================================================================
// TOAST SUCCESS
// ============================================================================

/**
 * Toast success icon choreography
 */
export const TOAST_SUCCESS_ICON_CHOREOGRAPHY: Choreography = {
  name: 'Toast Success Icon',
  description: 'Checkmark animation for success toasts',
  totalDuration: 500,
  
  phases: [
    {
      name: 'scale-in',
      start: 0,
      end: 200,
      properties: {
        transform: ['scale(0) rotate(-90deg)', 'scale(1.2) rotate(0deg)'],
        opacity: [0, 1],
      },
      easing: EASING.SPRING,
    },
    {
      name: 'settle',
      start: 200,
      end: 500,
      properties: {
        transform: ['scale(1.2)', 'scale(1)'],
      },
      easing: EASING.GENTLE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 100,
    properties: {
      opacity: [0, 1],
    },
  },
};

// ============================================================================
// TOAST ERROR
// ============================================================================

/**
 * Toast error shake choreography
 */
export const TOAST_ERROR_SHAKE_CHOREOGRAPHY: Choreography = {
  name: 'Toast Error Shake',
  description: 'Attention-getting shake for errors',
  totalDuration: 400,
  
  phases: [
    {
      name: 'shake-1',
      start: 0,
      end: 80,
      properties: {
        transform: ['translateX(0)', 'translateX(-8px)'],
      },
      easing: EASING.ACCELERATE,
    },
    {
      name: 'shake-2',
      start: 80,
      end: 160,
      properties: {
        transform: ['translateX(-8px)', 'translateX(8px)'],
      },
      easing: EASING.SMOOTH,
    },
    {
      name: 'shake-3',
      start: 160,
      end: 240,
      properties: {
        transform: ['translateX(8px)', 'translateX(-4px)'],
      },
      easing: EASING.SMOOTH,
    },
    {
      name: 'settle',
      start: 240,
      end: 400,
      properties: {
        transform: ['translateX(-4px)', 'translateX(0)'],
      },
      easing: EASING.GENTLE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 0,
    properties: {},
  },
};

// ============================================================================
// TOAST LOADING
// ============================================================================

/**
 * Toast loading spinner choreography
 */
export const TOAST_LOADING_SPINNER_CHOREOGRAPHY: Choreography = {
  name: 'Toast Loading Spinner',
  description: 'Continuous loading animation',
  totalDuration: 1000,
  
  phases: [
    {
      name: 'spin',
      start: 0,
      end: 1000,
      properties: {
        transform: ['rotate(0deg)', 'rotate(360deg)'],
      },
      easing: 'linear',
    },
  ],
  
  reducedMotion: {
    totalDuration: 0,
    properties: {
      opacity: [0.5, 1],
    },
  },
};

// ============================================================================
// TOAST PROGRESS BAR
// ============================================================================

/**
 * Toast progress bar choreography
 * Auto-dismiss countdown
 */
export const TOAST_PROGRESS_CHOREOGRAPHY: Choreography = {
  name: 'Toast Progress',
  description: 'Auto-dismiss countdown bar',
  totalDuration: 5000, // Default 5 second auto-dismiss
  
  phases: [
    {
      name: 'countdown',
      start: 0,
      end: 5000,
      properties: {
        width: ['100%', '0%'],
      },
      easing: 'linear',
    },
  ],
  
  reducedMotion: {
    totalDuration: 5000,
    properties: {
      width: ['100%', '0%'],
    },
  },
};

// ============================================================================
// TOAST ACTION BUTTON
// ============================================================================

/**
 * Toast action button hover choreography
 */
export const TOAST_ACTION_HOVER_CHOREOGRAPHY: Choreography = {
  name: 'Toast Action Hover',
  description: 'Action button hover state',
  totalDuration: 150,
  
  phases: [
    {
      name: 'highlight',
      start: 0,
      end: 150,
      properties: {
        backgroundColor: ['transparent', 'rgba(255,255,255,0.1)'],
        transform: ['scale(1)', 'scale(1.02)'],
      },
      easing: EASING.DECELERATE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 0,
    properties: {},
  },
};

