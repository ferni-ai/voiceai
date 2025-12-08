/**
 * Error Recovery Choreographies
 * Frame-by-frame specifications for error and recovery animations
 */

import { Choreography, EASING, DURATION } from './index.js';

// ============================================================================
// ERROR SHAKE
// ============================================================================

/**
 * Error shake choreography
 * Attention-getting but not aggressive
 */
export const ERROR_SHAKE_CHOREOGRAPHY: Choreography = {
  name: 'Error Shake',
  description: 'Gentle attention-getting shake',
  totalDuration: 400,
  
  phases: [
    {
      name: 'left-1',
      start: 0,
      end: 70,
      properties: {
        transform: ['translateX(0)', 'translateX(-6px)'],
      },
      easing: EASING.ACCELERATE,
    },
    {
      name: 'right-1',
      start: 70,
      end: 140,
      properties: {
        transform: ['translateX(-6px)', 'translateX(6px)'],
      },
      easing: EASING.SMOOTH,
    },
    {
      name: 'left-2',
      start: 140,
      end: 210,
      properties: {
        transform: ['translateX(6px)', 'translateX(-4px)'],
      },
      easing: EASING.SMOOTH,
    },
    {
      name: 'right-2',
      start: 210,
      end: 280,
      properties: {
        transform: ['translateX(-4px)', 'translateX(4px)'],
      },
      easing: EASING.SMOOTH,
    },
    {
      name: 'settle',
      start: 280,
      end: 400,
      properties: {
        transform: ['translateX(4px)', 'translateX(0)'],
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
// INPUT ERROR
// ============================================================================

/**
 * Input field error choreography
 */
export const INPUT_ERROR_CHOREOGRAPHY: Choreography = {
  name: 'Input Error',
  description: 'Input field error indication',
  totalDuration: 500,
  
  phases: [
    {
      name: 'shake',
      start: 0,
      end: 300,
      properties: {
        transform: [
          'translateX(0)',
          'translateX(-4px)',
          'translateX(4px)',
          'translateX(-2px)',
          'translateX(0)'
        ].join(' → '), // Simplified - actual implementation uses keyframes
      },
      easing: EASING.SMOOTH,
    },
    {
      name: 'glow',
      start: 0,
      end: 500,
      properties: {
        boxShadow: [
          '0 0 0 0 rgba(181, 69, 58, 0)',
          '0 0 0 4px rgba(181, 69, 58, 0.2)'
        ],
        borderColor: [
          'var(--color-border-strong)',
          'var(--color-error)'
        ],
      },
      easing: EASING.EXPO_OUT,
    },
  ],
  
  reducedMotion: {
    totalDuration: 100,
    properties: {
      borderColor: ['var(--color-border-strong)', 'var(--color-error)'],
    },
  },
};

// ============================================================================
// RETRY BOUNCE
// ============================================================================

/**
 * Retry button bounce choreography
 */
export const RETRY_BOUNCE_CHOREOGRAPHY: Choreography = {
  name: 'Retry Bounce',
  description: 'Encouraging bounce for retry action',
  totalDuration: 300,
  
  phases: [
    {
      name: 'squash',
      start: 0,
      end: 80,
      properties: {
        transform: ['scale(1)', 'scale(0.9)'],
      },
      easing: EASING.ANTICIPATE,
    },
    {
      name: 'bounce',
      start: 80,
      end: 200,
      properties: {
        transform: ['scale(0.9)', 'scale(1.1)'],
      },
      easing: EASING.SPRING,
    },
    {
      name: 'settle',
      start: 200,
      end: 300,
      properties: {
        transform: ['scale(1.1)', 'scale(1)'],
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
// ERROR PULSE (PERSISTENT)
// ============================================================================

/**
 * Error pulse choreography
 * For persistent error states
 */
export const ERROR_PULSE_CHOREOGRAPHY: Choreography = {
  name: 'Error Pulse',
  description: 'Persistent error state pulse',
  totalDuration: 3000,
  
  phases: [
    {
      name: 'glow-up',
      start: 0,
      end: 1500,
      properties: {
        boxShadow: [
          '0 0 0 0 rgba(181, 69, 58, 0.1)',
          '0 0 0 8px rgba(181, 69, 58, 0.2)'
        ],
      },
      easing: EASING.SMOOTH,
    },
    {
      name: 'glow-down',
      start: 1500,
      end: 3000,
      properties: {
        boxShadow: [
          '0 0 0 8px rgba(181, 69, 58, 0.2)',
          '0 0 0 0 rgba(181, 69, 58, 0.1)'
        ],
      },
      easing: EASING.SMOOTH,
    },
  ],
  
  reducedMotion: {
    totalDuration: 0,
    properties: {},
  },
};

// ============================================================================
// ERROR RECOVERY SUCCESS
// ============================================================================

/**
 * Error recovery success choreography
 * When error is resolved
 */
export const ERROR_RECOVERY_SUCCESS_CHOREOGRAPHY: Choreography = {
  name: 'Error Recovery Success',
  description: 'Error resolved celebration',
  totalDuration: 600,
  
  phases: [
    {
      name: 'pulse-out',
      start: 0,
      end: 300,
      properties: {
        boxShadow: [
          '0 0 0 4px rgba(181, 69, 58, 0.2)',
          '0 0 0 8px rgba(61, 122, 82, 0.3)'
        ],
        borderColor: [
          'var(--color-error)',
          'var(--color-success)'
        ],
      },
      easing: EASING.EXPO_OUT,
    },
    {
      name: 'settle',
      start: 300,
      end: 600,
      properties: {
        boxShadow: [
          '0 0 0 8px rgba(61, 122, 82, 0.3)',
          '0 0 0 0 transparent'
        ],
        borderColor: [
          'var(--color-success)',
          'var(--color-border-strong)'
        ],
      },
      easing: EASING.GENTLE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 200,
    properties: {
      borderColor: ['var(--color-error)', 'var(--color-success)'],
    },
  },
};

// ============================================================================
// OFFLINE INDICATOR
// ============================================================================

/**
 * Offline state indicator choreography
 */
export const OFFLINE_INDICATOR_CHOREOGRAPHY: Choreography = {
  name: 'Offline Indicator',
  description: 'Offline state visual indicator',
  totalDuration: 400,
  
  phases: [
    {
      name: 'slide-in',
      start: 0,
      end: 400,
      properties: {
        transform: ['translateY(-100%)', 'translateY(0)'],
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
 * Online recovery indicator choreography
 */
export const ONLINE_RECOVERY_CHOREOGRAPHY: Choreography = {
  name: 'Online Recovery',
  description: 'Connection restored indicator',
  totalDuration: 800,
  
  phases: [
    {
      name: 'flash',
      start: 0,
      end: 300,
      properties: {
        backgroundColor: [
          'var(--color-warning)',
          'var(--color-success)'
        ],
        boxShadow: [
          '0 0 0 0 transparent',
          '0 0 20px rgba(61, 122, 82, 0.4)'
        ],
      },
      easing: EASING.EXPO_OUT,
    },
    {
      name: 'slide-out',
      start: 500,
      end: 800,
      properties: {
        transform: ['translateY(0)', 'translateY(-100%)'],
        opacity: [1, 0],
      },
      easing: EASING.ACCELERATE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 200,
    properties: {
      opacity: [1, 0],
    },
  },
};

// ============================================================================
// CONNECTION ERROR
// ============================================================================

/**
 * Connection error choreography
 */
export const CONNECTION_ERROR_CHOREOGRAPHY: Choreography = {
  name: 'Connection Error',
  description: 'Connection failure indication',
  totalDuration: 600,
  
  phases: [
    {
      name: 'shake',
      start: 0,
      end: 300,
      properties: {
        transform: ['rotate(0deg)', 'rotate(-3deg)', 'rotate(3deg)', 'rotate(0deg)'],
      },
      easing: EASING.SMOOTH,
    },
    {
      name: 'color-change',
      start: 0,
      end: 400,
      properties: {
        color: ['var(--color-text-secondary)', 'var(--color-error)'],
      },
      easing: EASING.EXPO_OUT,
    },
    {
      name: 'glow',
      start: 0,
      end: 600,
      properties: {
        filter: ['drop-shadow(0 0 0 transparent)', 'drop-shadow(0 0 8px rgba(181, 69, 58, 0.3))'],
      },
      easing: EASING.EXPO_OUT,
    },
  ],
  
  reducedMotion: {
    totalDuration: 100,
    properties: {
      color: ['var(--color-text-secondary)', 'var(--color-error)'],
    },
  },
};

// ============================================================================
// FORM VALIDATION ERROR
// ============================================================================

/**
 * Form validation error message choreography
 */
export const VALIDATION_ERROR_CHOREOGRAPHY: Choreography = {
  name: 'Validation Error',
  description: 'Validation error message appearance',
  totalDuration: 300,
  
  phases: [
    {
      name: 'appear',
      start: 0,
      end: 300,
      properties: {
        transform: ['translateY(-5px)', 'translateY(0)'],
        opacity: [0, 1],
        height: ['0', 'auto'],
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
 * Form validation error disappear choreography
 */
export const VALIDATION_ERROR_CLEAR_CHOREOGRAPHY: Choreography = {
  name: 'Validation Error Clear',
  description: 'Validation error message removal',
  totalDuration: 200,
  
  phases: [
    {
      name: 'disappear',
      start: 0,
      end: 200,
      properties: {
        transform: ['translateY(0)', 'translateY(-5px)'],
        opacity: [1, 0],
        height: ['auto', '0'],
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

