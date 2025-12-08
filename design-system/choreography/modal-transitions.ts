/**
 * Modal Transition Choreographies
 * Frame-by-frame specifications for modal and dialog animations
 */

import { Choreography, EASING, DURATION } from './index.js';

// ============================================================================
// MODAL OPEN
// ============================================================================

/**
 * Modal open choreography
 * Centered scale-in with backdrop
 */
export const MODAL_OPEN_CHOREOGRAPHY: Choreography = {
  name: 'Modal Open',
  description: 'Standard modal entrance animation',
  totalDuration: 400,
  
  phases: [
    {
      name: 'scale-in',
      start: 0,
      end: 400,
      properties: {
        transform: ['scale(0.95) translateY(10px)', 'scale(1) translateY(0)'],
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

/**
 * Modal backdrop choreography
 */
export const MODAL_BACKDROP_CHOREOGRAPHY: Choreography = {
  name: 'Modal Backdrop',
  description: 'Backdrop blur fade in',
  totalDuration: 300,
  
  phases: [
    {
      name: 'fade-blur',
      start: 0,
      end: 300,
      properties: {
        opacity: [0, 1],
        backdropFilter: ['blur(0px)', 'blur(20px)'],
      },
      easing: EASING.DECELERATE,
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
// MODAL CLOSE
// ============================================================================

/**
 * Modal close choreography
 */
export const MODAL_CLOSE_CHOREOGRAPHY: Choreography = {
  name: 'Modal Close',
  description: 'Modal exit animation',
  totalDuration: 250,
  
  phases: [
    {
      name: 'scale-out',
      start: 0,
      end: 250,
      properties: {
        transform: ['scale(1) translateY(0)', 'scale(0.95) translateY(10px)'],
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

/**
 * Modal backdrop exit choreography
 */
export const MODAL_BACKDROP_EXIT_CHOREOGRAPHY: Choreography = {
  name: 'Modal Backdrop Exit',
  description: 'Backdrop fade out',
  totalDuration: 200,
  
  phases: [
    {
      name: 'fade-out',
      start: 0,
      end: 200,
      properties: {
        opacity: [1, 0],
        backdropFilter: ['blur(20px)', 'blur(0px)'],
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
// SIDE PANEL (Settings)
// ============================================================================

/**
 * Side panel slide in choreography
 */
export const SIDE_PANEL_OPEN_CHOREOGRAPHY: Choreography = {
  name: 'Side Panel Open',
  description: 'Right-side panel slide in',
  totalDuration: 400,
  
  phases: [
    {
      name: 'slide-in',
      start: 0,
      end: 400,
      properties: {
        transform: ['translateX(100%)', 'translateX(0)'],
        opacity: [0.5, 1],
      },
      easing: EASING.EXPO_OUT,
    },
  ],
  
  reducedMotion: {
    totalDuration: 100,
    properties: {
      opacity: [0, 1],
    },
  },
};

/**
 * Side panel slide out choreography
 */
export const SIDE_PANEL_CLOSE_CHOREOGRAPHY: Choreography = {
  name: 'Side Panel Close',
  description: 'Right-side panel slide out',
  totalDuration: 300,
  
  phases: [
    {
      name: 'slide-out',
      start: 0,
      end: 300,
      properties: {
        transform: ['translateX(0)', 'translateX(100%)'],
        opacity: [1, 0.5],
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
// BOTTOM SHEET (Mobile)
// ============================================================================

/**
 * Bottom sheet open choreography
 */
export const BOTTOM_SHEET_OPEN_CHOREOGRAPHY: Choreography = {
  name: 'Bottom Sheet Open',
  description: 'Mobile bottom sheet slide up',
  totalDuration: 400,
  
  phases: [
    {
      name: 'slide-up',
      start: 0,
      end: 400,
      properties: {
        transform: ['translateY(100%)', 'translateY(0)'],
      },
      easing: EASING.SPRING_GENTLE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 100,
    properties: {
      transform: ['translateY(100%)', 'translateY(0)'],
    },
  },
};

/**
 * Bottom sheet close choreography
 */
export const BOTTOM_SHEET_CLOSE_CHOREOGRAPHY: Choreography = {
  name: 'Bottom Sheet Close',
  description: 'Mobile bottom sheet slide down',
  totalDuration: 300,
  
  phases: [
    {
      name: 'slide-down',
      start: 0,
      end: 300,
      properties: {
        transform: ['translateY(0)', 'translateY(100%)'],
      },
      easing: EASING.ACCELERATE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 100,
    properties: {
      transform: ['translateY(0)', 'translateY(100%)'],
    },
  },
};

// ============================================================================
// DIALOG (Alert/Confirm)
// ============================================================================

/**
 * Alert dialog choreography
 * Slightly more emphatic than standard modal
 */
export const ALERT_DIALOG_OPEN_CHOREOGRAPHY: Choreography = {
  name: 'Alert Dialog Open',
  description: 'Alert dialog with attention animation',
  totalDuration: 500,
  
  phases: [
    {
      name: 'scale-bounce',
      start: 0,
      end: 350,
      properties: {
        transform: ['scale(0.9)', 'scale(1.02)'],
        opacity: [0, 1],
      },
      easing: EASING.SPRING,
    },
    {
      name: 'settle',
      start: 350,
      end: 500,
      properties: {
        transform: ['scale(1.02)', 'scale(1)'],
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
// DROPDOWN MENU
// ============================================================================

/**
 * Dropdown menu open choreography
 */
export const DROPDOWN_OPEN_CHOREOGRAPHY: Choreography = {
  name: 'Dropdown Open',
  description: 'Dropdown menu appearance',
  totalDuration: 200,
  
  phases: [
    {
      name: 'unfold',
      start: 0,
      end: 200,
      properties: {
        transform: ['scaleY(0.8) translateY(-8px)', 'scaleY(1) translateY(0)'],
        opacity: [0, 1],
        transformOrigin: ['top', 'top'],
      },
      easing: EASING.EXPO_OUT,
    },
  ],
  
  reducedMotion: {
    totalDuration: 50,
    properties: {
      opacity: [0, 1],
    },
  },
};

/**
 * Dropdown menu close choreography
 */
export const DROPDOWN_CLOSE_CHOREOGRAPHY: Choreography = {
  name: 'Dropdown Close',
  description: 'Dropdown menu disappearance',
  totalDuration: 150,
  
  phases: [
    {
      name: 'fold',
      start: 0,
      end: 150,
      properties: {
        transform: ['scaleY(1) translateY(0)', 'scaleY(0.8) translateY(-8px)'],
        opacity: [1, 0],
        transformOrigin: ['top', 'top'],
      },
      easing: EASING.ACCELERATE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 50,
    properties: {
      opacity: [1, 0],
    },
  },
};

// ============================================================================
// TOOLTIP
// ============================================================================

/**
 * Tooltip appear choreography
 */
export const TOOLTIP_APPEAR_CHOREOGRAPHY: Choreography = {
  name: 'Tooltip Appear',
  description: 'Tooltip fade in with slight scale',
  totalDuration: 150,
  
  phases: [
    {
      name: 'appear',
      start: 0,
      end: 150,
      properties: {
        transform: ['scale(0.95)', 'scale(1)'],
        opacity: [0, 1],
      },
      easing: EASING.DECELERATE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 50,
    properties: {
      opacity: [0, 1],
    },
  },
};

/**
 * Tooltip disappear choreography
 */
export const TOOLTIP_DISAPPEAR_CHOREOGRAPHY: Choreography = {
  name: 'Tooltip Disappear',
  description: 'Tooltip fade out',
  totalDuration: 100,
  
  phases: [
    {
      name: 'disappear',
      start: 0,
      end: 100,
      properties: {
        opacity: [1, 0],
      },
      easing: EASING.ACCELERATE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 50,
    properties: {
      opacity: [1, 0],
    },
  },
};

// ============================================================================
// POPOVER
// ============================================================================

/**
 * Popover open choreography
 */
export const POPOVER_OPEN_CHOREOGRAPHY: Choreography = {
  name: 'Popover Open',
  description: 'Popover with spring animation',
  totalDuration: 300,
  
  phases: [
    {
      name: 'spring-in',
      start: 0,
      end: 300,
      properties: {
        transform: ['scale(0.9) translateY(-4px)', 'scale(1) translateY(0)'],
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

/**
 * Popover close choreography
 */
export const POPOVER_CLOSE_CHOREOGRAPHY: Choreography = {
  name: 'Popover Close',
  description: 'Popover exit animation',
  totalDuration: 200,
  
  phases: [
    {
      name: 'fade-out',
      start: 0,
      end: 200,
      properties: {
        transform: ['scale(1)', 'scale(0.95)'],
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

