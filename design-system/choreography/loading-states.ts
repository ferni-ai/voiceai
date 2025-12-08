/**
 * Loading State Choreographies
 * Frame-by-frame specifications for loading animations
 */

import { Choreography, EASING, DURATION } from './index.js';

// ============================================================================
// SKELETON SHIMMER
// ============================================================================

/**
 * Skeleton shimmer choreography
 * Loading placeholder animation
 */
export const SKELETON_SHIMMER_CHOREOGRAPHY: Choreography = {
  name: 'Skeleton Shimmer',
  description: 'Loading placeholder shimmer effect',
  totalDuration: 2000,
  
  phases: [
    {
      name: 'shimmer',
      start: 0,
      end: 2000,
      properties: {
        backgroundPosition: ['-200% 0', '200% 0'],
      },
      easing: 'linear',
    },
  ],
  
  reducedMotion: {
    totalDuration: 0,
    properties: {
      opacity: [0.7, 0.7],
    },
  },
};

// ============================================================================
// SKELETON PULSE
// ============================================================================

/**
 * Skeleton pulse choreography
 * Alternative to shimmer for simpler skeletons
 */
export const SKELETON_PULSE_CHOREOGRAPHY: Choreography = {
  name: 'Skeleton Pulse',
  description: 'Pulsing opacity for loading states',
  totalDuration: 1500,
  
  phases: [
    {
      name: 'fade-out',
      start: 0,
      end: 750,
      properties: {
        opacity: [0.4, 0.2],
      },
      easing: EASING.SMOOTH,
    },
    {
      name: 'fade-in',
      start: 750,
      end: 1500,
      properties: {
        opacity: [0.2, 0.4],
      },
      easing: EASING.SMOOTH,
    },
  ],
  
  reducedMotion: {
    totalDuration: 0,
    properties: {
      opacity: [0.3, 0.3],
    },
  },
};

// ============================================================================
// SPINNER
// ============================================================================

/**
 * Spinner choreography
 * Standard loading spinner
 */
export const SPINNER_CHOREOGRAPHY: Choreography = {
  name: 'Spinner',
  description: 'Rotating loading indicator',
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
// THINKING DOTS
// ============================================================================

/**
 * Thinking dots choreography
 * Three dots bouncing in sequence
 */
export const THINKING_DOTS_CHOREOGRAPHY: Choreography = {
  name: 'Thinking Dots',
  description: 'Sequential bouncing dots for AI thinking',
  totalDuration: 1400,
  
  phases: [
    // Dot 1
    {
      name: 'dot-1-up',
      start: 0,
      end: 200,
      properties: {
        transform: ['translateY(0)', 'translateY(-8px)'],
      },
      easing: EASING.EXPO_OUT,
    },
    {
      name: 'dot-1-down',
      start: 200,
      end: 400,
      properties: {
        transform: ['translateY(-8px)', 'translateY(0)'],
      },
      easing: EASING.ACCELERATE,
    },
    // Dot 2 (staggered by 200ms)
    {
      name: 'dot-2-up',
      start: 200,
      end: 400,
      properties: {
        transform: ['translateY(0)', 'translateY(-8px)'],
      },
      easing: EASING.EXPO_OUT,
    },
    {
      name: 'dot-2-down',
      start: 400,
      end: 600,
      properties: {
        transform: ['translateY(-8px)', 'translateY(0)'],
      },
      easing: EASING.ACCELERATE,
    },
    // Dot 3 (staggered by 400ms)
    {
      name: 'dot-3-up',
      start: 400,
      end: 600,
      properties: {
        transform: ['translateY(0)', 'translateY(-8px)'],
      },
      easing: EASING.EXPO_OUT,
    },
    {
      name: 'dot-3-down',
      start: 600,
      end: 800,
      properties: {
        transform: ['translateY(-8px)', 'translateY(0)'],
      },
      easing: EASING.ACCELERATE,
    },
    // Rest period
    {
      name: 'rest',
      start: 800,
      end: 1400,
      properties: {},
      easing: 'linear',
    },
  ],
  
  reducedMotion: {
    totalDuration: 1000,
    properties: {
      opacity: [0.3, 1],
    },
  },
};

// ============================================================================
// PROGRESS BAR
// ============================================================================

/**
 * Progress bar indeterminate choreography
 */
export const PROGRESS_INDETERMINATE_CHOREOGRAPHY: Choreography = {
  name: 'Progress Indeterminate',
  description: 'Indeterminate progress bar animation',
  totalDuration: 2000,
  
  phases: [
    {
      name: 'slide-right',
      start: 0,
      end: 1000,
      properties: {
        transform: ['translateX(-100%)', 'translateX(100%)'],
      },
      easing: EASING.SMOOTH,
    },
    {
      name: 'slide-back',
      start: 1000,
      end: 2000,
      properties: {
        transform: ['translateX(100%)', 'translateX(-100%)'],
      },
      easing: EASING.SMOOTH,
    },
  ],
  
  reducedMotion: {
    totalDuration: 0,
    properties: {
      opacity: [0.5, 0.5],
    },
  },
};

/**
 * Progress bar determinate choreography
 * Width transition for known progress
 */
export const PROGRESS_DETERMINATE_CHOREOGRAPHY: Choreography = {
  name: 'Progress Determinate',
  description: 'Progress bar width transition',
  totalDuration: 300,
  
  phases: [
    {
      name: 'grow',
      start: 0,
      end: 300,
      properties: {
        width: ['var(--from-width)', 'var(--to-width)'],
      },
      easing: EASING.EXPO_OUT,
    },
  ],
  
  reducedMotion: {
    totalDuration: 100,
    properties: {
      width: ['var(--from-width)', 'var(--to-width)'],
    },
  },
};

// ============================================================================
// CONTENT LOAD TRANSITION
// ============================================================================

/**
 * Content appearing after load choreography
 */
export const CONTENT_LOADED_CHOREOGRAPHY: Choreography = {
  name: 'Content Loaded',
  description: 'Content fade-in after loading completes',
  totalDuration: 400,
  
  phases: [
    {
      name: 'fade-up',
      start: 0,
      end: 400,
      properties: {
        transform: ['translateY(10px)', 'translateY(0)'],
        opacity: [0, 1],
      },
      easing: EASING.EXPO_OUT,
    },
  ],
  
  reducedMotion: {
    totalDuration: 150,
    properties: {
      opacity: [0, 1],
    },
  },
};

// ============================================================================
// SKELETON TO CONTENT
// ============================================================================

/**
 * Skeleton to content transition choreography
 */
export const SKELETON_TO_CONTENT_CHOREOGRAPHY: Choreography = {
  name: 'Skeleton to Content',
  description: 'Smooth transition from skeleton to real content',
  totalDuration: 500,
  
  phases: [
    {
      name: 'skeleton-fade',
      start: 0,
      end: 200,
      properties: {
        opacity: [1, 0],
      },
      easing: EASING.ACCELERATE,
    },
    {
      name: 'content-appear',
      start: 150,
      end: 500,
      properties: {
        opacity: [0, 1],
        transform: ['translateY(5px)', 'translateY(0)'],
      },
      easing: EASING.EXPO_OUT,
    },
  ],
  
  reducedMotion: {
    totalDuration: 200,
    properties: {
      opacity: [0, 1],
    },
  },
};

// ============================================================================
// CONNECTION PROGRESS
// ============================================================================

/**
 * Connection step active choreography
 */
export const CONNECTION_STEP_ACTIVE_CHOREOGRAPHY: Choreography = {
  name: 'Connection Step Active',
  description: 'Connection step becomes active',
  totalDuration: 300,
  
  phases: [
    {
      name: 'activate',
      start: 0,
      end: 300,
      properties: {
        transform: ['scale(1)', 'scale(1.1)'],
        backgroundColor: ['var(--color-bg-secondary)', 'var(--color-accent)'],
      },
      easing: EASING.SPRING_GENTLE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 100,
    properties: {
      backgroundColor: ['var(--color-bg-secondary)', 'var(--color-accent)'],
    },
  },
};

/**
 * Connection step complete choreography
 */
export const CONNECTION_STEP_COMPLETE_CHOREOGRAPHY: Choreography = {
  name: 'Connection Step Complete',
  description: 'Connection step completion animation',
  totalDuration: 400,
  
  phases: [
    {
      name: 'pulse',
      start: 0,
      end: 200,
      properties: {
        transform: ['scale(1.1)', 'scale(1.2)'],
        boxShadow: [
          '0 0 0 0 var(--color-success)',
          '0 0 0 8px rgba(61, 122, 82, 0.3)'
        ],
      },
      easing: EASING.EXPO_OUT,
    },
    {
      name: 'settle',
      start: 200,
      end: 400,
      properties: {
        transform: ['scale(1.2)', 'scale(1)'],
        boxShadow: [
          '0 0 0 8px rgba(61, 122, 82, 0.3)',
          '0 0 0 0 transparent'
        ],
      },
      easing: EASING.GENTLE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 100,
    properties: {
      opacity: [0.8, 1],
    },
  },
};

// ============================================================================
// PULSE INDICATOR
// ============================================================================

/**
 * Live/active indicator pulse
 */
export const PULSE_INDICATOR_CHOREOGRAPHY: Choreography = {
  name: 'Pulse Indicator',
  description: 'Live indicator pulsing animation',
  totalDuration: 2000,
  
  phases: [
    {
      name: 'expand',
      start: 0,
      end: 1000,
      properties: {
        transform: ['scale(1)', 'scale(1.5)'],
        opacity: [0.6, 0],
      },
      easing: EASING.SMOOTH,
    },
    {
      name: 'reset',
      start: 1000,
      end: 1001,
      properties: {
        transform: ['scale(1.5)', 'scale(1)'],
        opacity: [0, 0.6],
      },
      easing: 'linear',
    },
    {
      name: 'rest',
      start: 1001,
      end: 2000,
      properties: {},
      easing: 'linear',
    },
  ],
  
  reducedMotion: {
    totalDuration: 0,
    properties: {
      opacity: [0.6, 0.6],
    },
  },
};

