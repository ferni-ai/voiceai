/**
 * Button Interaction Choreographies
 * Frame-by-frame specifications for button animations
 */

import { Choreography, EASING, DURATION } from './index.js';

// ============================================================================
// PRIMARY BUTTON PRESS
// ============================================================================

/**
 * Primary button press choreography
 * 
 * Timeline:
 * 0-50ms:    Anticipation (subtle squash)
 * 50-150ms:  Action (spring out)
 * 150-280ms: Settle (return to rest)
 */
export const BUTTON_PRESS_CHOREOGRAPHY: Choreography = {
  name: 'Primary Button Press',
  description: 'Satisfying press with Pixar-style squash and spring',
  totalDuration: 280,
  
  phases: [
    {
      name: 'anticipation',
      start: 0,
      end: 50,
      properties: {
        transform: ['scale(1) translateY(0)', 'scale(0.97) translateY(1px)'],
        boxShadow: [
          '0 4px 12px rgba(0,0,0,0.1)',
          '0 2px 6px rgba(0,0,0,0.08)'
        ],
      },
      easing: EASING.ACCELERATE,
    },
    {
      name: 'action',
      start: 50,
      end: 150,
      properties: {
        transform: ['scale(0.97) translateY(1px)', 'scale(1.02) translateY(-2px)'],
        boxShadow: [
          '0 2px 6px rgba(0,0,0,0.08)',
          '0 8px 20px rgba(0,0,0,0.15)'
        ],
      },
      easing: EASING.SPRING,
    },
    {
      name: 'settle',
      start: 150,
      end: 280,
      properties: {
        transform: ['scale(1.02) translateY(-2px)', 'scale(1) translateY(0)'],
        boxShadow: [
          '0 8px 20px rgba(0,0,0,0.15)',
          '0 4px 12px rgba(0,0,0,0.1)'
        ],
      },
      easing: EASING.GENTLE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 100,
    properties: {
      opacity: [1, 0.8],
    },
  },
};

// ============================================================================
// SECONDARY BUTTON PRESS
// ============================================================================

/**
 * Secondary (outline) button press choreography
 * Lighter, more subtle than primary
 */
export const BUTTON_SECONDARY_PRESS_CHOREOGRAPHY: Choreography = {
  name: 'Secondary Button Press',
  description: 'Subtle press for outline buttons',
  totalDuration: 200,
  
  phases: [
    {
      name: 'press',
      start: 0,
      end: 50,
      properties: {
        transform: ['scale(1)', 'scale(0.98)'],
        backgroundColor: ['transparent', 'rgba(44, 37, 32, 0.04)'],
      },
      easing: EASING.ACCELERATE,
    },
    {
      name: 'release',
      start: 50,
      end: 200,
      properties: {
        transform: ['scale(0.98)', 'scale(1)'],
        backgroundColor: ['rgba(44, 37, 32, 0.04)', 'transparent'],
      },
      easing: EASING.SPRING_GENTLE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 100,
    properties: {
      opacity: [1, 0.9],
    },
  },
};

// ============================================================================
// BUTTON HOVER
// ============================================================================

/**
 * Button hover choreography
 * Subtle lift that signals interactivity
 */
export const BUTTON_HOVER_ENTER_CHOREOGRAPHY: Choreography = {
  name: 'Button Hover Enter',
  description: 'Subtle anticipatory lift on hover',
  totalDuration: 150,
  
  phases: [
    {
      name: 'lift',
      start: 0,
      end: 150,
      properties: {
        transform: ['translateY(0)', 'translateY(-2px)'],
        boxShadow: [
          '0 4px 12px rgba(0,0,0,0.1)',
          '0 8px 20px rgba(0,0,0,0.15)'
        ],
      },
      easing: EASING.EXPO_OUT,
    },
  ],
  
  reducedMotion: {
    totalDuration: 0,
    properties: {},
  },
};

/**
 * Button hover exit choreography
 */
export const BUTTON_HOVER_EXIT_CHOREOGRAPHY: Choreography = {
  name: 'Button Hover Exit',
  description: 'Gentle return from hover',
  totalDuration: 200,
  
  phases: [
    {
      name: 'settle',
      start: 0,
      end: 200,
      properties: {
        transform: ['translateY(-2px)', 'translateY(0)'],
        boxShadow: [
          '0 8px 20px rgba(0,0,0,0.15)',
          '0 4px 12px rgba(0,0,0,0.1)'
        ],
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
// BUTTON FOCUS
// ============================================================================

/**
 * Button focus ring choreography
 * Accessible, visible focus with spring animation
 */
export const BUTTON_FOCUS_CHOREOGRAPHY: Choreography = {
  name: 'Button Focus',
  description: 'Accessible focus ring with spring animation',
  totalDuration: 200,
  
  phases: [
    {
      name: 'expand',
      start: 0,
      end: 200,
      properties: {
        outline: ['3px solid transparent', '3px solid var(--color-accent)'],
        outlineOffset: ['0px', '3px'],
      },
      easing: EASING.SPRING_GENTLE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 0,
    properties: {
      outline: ['none', '3px solid var(--color-accent)'],
      outlineOffset: ['0px', '3px'],
    },
  },
};

// ============================================================================
// ICON BUTTON PRESS
// ============================================================================

/**
 * Icon button (circular) press choreography
 * Rotation + scale for playful feel
 */
export const ICON_BUTTON_PRESS_CHOREOGRAPHY: Choreography = {
  name: 'Icon Button Press',
  description: 'Playful rotation + scale for icon buttons',
  totalDuration: 300,
  
  phases: [
    {
      name: 'anticipation',
      start: 0,
      end: 60,
      properties: {
        transform: ['rotate(0deg) scale(1)', 'rotate(-8deg) scale(0.95)'],
      },
      easing: EASING.ANTICIPATE,
    },
    {
      name: 'spring',
      start: 60,
      end: 180,
      properties: {
        transform: ['rotate(-8deg) scale(0.95)', 'rotate(3deg) scale(1.1)'],
      },
      easing: EASING.SPRING,
    },
    {
      name: 'settle',
      start: 180,
      end: 300,
      properties: {
        transform: ['rotate(3deg) scale(1.1)', 'rotate(0deg) scale(1)'],
      },
      easing: EASING.GENTLE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 100,
    properties: {
      opacity: [1, 0.8],
    },
  },
};

// ============================================================================
// CTA PULSE (ATTENTION)
// ============================================================================

/**
 * CTA attention pulse choreography
 * Subtle pulse to draw attention to primary action
 */
export const CTA_PULSE_CHOREOGRAPHY: Choreography = {
  name: 'CTA Pulse',
  description: 'Subtle attention-drawing pulse',
  totalDuration: 2000,
  
  phases: [
    {
      name: 'expand',
      start: 0,
      end: 1000,
      properties: {
        transform: ['scale(1)', 'scale(1.02)'],
        boxShadow: [
          '0 4px 12px rgba(61, 90, 69, 0.1)',
          '0 8px 24px rgba(61, 90, 69, 0.2)'
        ],
      },
      easing: EASING.SMOOTH,
    },
    {
      name: 'contract',
      start: 1000,
      end: 2000,
      properties: {
        transform: ['scale(1.02)', 'scale(1)'],
        boxShadow: [
          '0 8px 24px rgba(61, 90, 69, 0.2)',
          '0 4px 12px rgba(61, 90, 69, 0.1)'
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
// LOADING BUTTON
// ============================================================================

/**
 * Button loading state transition
 */
export const BUTTON_LOADING_CHOREOGRAPHY: Choreography = {
  name: 'Button Loading',
  description: 'Transition to loading state',
  totalDuration: 300,
  
  phases: [
    {
      name: 'compress',
      start: 0,
      end: 150,
      properties: {
        width: ['auto', '48px'],
        borderRadius: ['9999px', '50%'],
      },
      easing: EASING.EXPO_OUT,
    },
    {
      name: 'spin-start',
      start: 150,
      end: 300,
      properties: {
        // Spinner appears
        opacity: [0, 1],
      },
      easing: EASING.DECELERATE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 100,
    properties: {
      opacity: [1, 0.7],
    },
  },
};

// ============================================================================
// SUCCESS STATE
// ============================================================================

/**
 * Button success state (after loading completes)
 */
export const BUTTON_SUCCESS_CHOREOGRAPHY: Choreography = {
  name: 'Button Success',
  description: 'Celebratory success state',
  totalDuration: 600,
  
  phases: [
    {
      name: 'check-appear',
      start: 0,
      end: 200,
      properties: {
        transform: ['scale(0) rotate(-90deg)', 'scale(1.2) rotate(0deg)'],
        opacity: [0, 1],
      },
      easing: EASING.SPRING,
    },
    {
      name: 'check-settle',
      start: 200,
      end: 400,
      properties: {
        transform: ['scale(1.2)', 'scale(1)'],
      },
      easing: EASING.GENTLE,
    },
    {
      name: 'glow',
      start: 0,
      end: 600,
      properties: {
        boxShadow: [
          '0 0 0 rgba(61, 122, 82, 0)',
          '0 0 20px rgba(61, 122, 82, 0.3)'
        ],
      },
      easing: EASING.SMOOTH,
    },
  ],
  
  reducedMotion: {
    totalDuration: 100,
    properties: {
      opacity: [0, 1],
    },
  },
};

