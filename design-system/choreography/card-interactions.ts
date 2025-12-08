/**
 * Card Interaction Choreographies
 * Frame-by-frame specifications for card animations
 */

import { Choreography, EASING, DURATION } from './index.js';

// ============================================================================
// CARD HOVER
// ============================================================================

/**
 * Card hover enter choreography
 * Lift with shadow expansion
 */
export const CARD_HOVER_ENTER_CHOREOGRAPHY: Choreography = {
  name: 'Card Hover Enter',
  description: 'Lift and shadow expansion on hover',
  totalDuration: 300,
  
  phases: [
    {
      name: 'lift',
      start: 0,
      end: 300,
      properties: {
        transform: ['translateY(0)', 'translateY(-4px)'],
        boxShadow: [
          '0 2px 8px rgba(44, 37, 32, 0.04)',
          '0 12px 32px rgba(44, 37, 32, 0.12)'
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
 * Card hover exit choreography
 */
export const CARD_HOVER_EXIT_CHOREOGRAPHY: Choreography = {
  name: 'Card Hover Exit',
  description: 'Gentle settle from hover',
  totalDuration: 400,
  
  phases: [
    {
      name: 'settle',
      start: 0,
      end: 400,
      properties: {
        transform: ['translateY(-4px)', 'translateY(0)'],
        boxShadow: [
          '0 12px 32px rgba(44, 37, 32, 0.12)',
          '0 2px 8px rgba(44, 37, 32, 0.04)'
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
// CARD PRESS
// ============================================================================

/**
 * Card press choreography
 * Subtle squash on click
 */
export const CARD_PRESS_CHOREOGRAPHY: Choreography = {
  name: 'Card Press',
  description: 'Subtle squash on press',
  totalDuration: 250,
  
  phases: [
    {
      name: 'squash',
      start: 0,
      end: 80,
      properties: {
        transform: ['scale(1)', 'scale(0.98) translateY(2px)'],
        boxShadow: [
          '0 12px 32px rgba(44, 37, 32, 0.12)',
          '0 4px 16px rgba(44, 37, 32, 0.08)'
        ],
      },
      easing: EASING.ACCELERATE,
    },
    {
      name: 'release',
      start: 80,
      end: 250,
      properties: {
        transform: ['scale(0.98) translateY(2px)', 'scale(1) translateY(0)'],
        boxShadow: [
          '0 4px 16px rgba(44, 37, 32, 0.08)',
          '0 12px 32px rgba(44, 37, 32, 0.12)'
        ],
      },
      easing: EASING.SPRING_GENTLE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 100,
    properties: {
      opacity: [1, 0.95],
    },
  },
};

// ============================================================================
// PERSONA CARD
// ============================================================================

/**
 * Persona card hover choreography
 * Glow effect with persona color
 */
export const PERSONA_CARD_HOVER_CHOREOGRAPHY: Choreography = {
  name: 'Persona Card Hover',
  description: 'Glow with persona color accent',
  totalDuration: 350,
  
  phases: [
    {
      name: 'lift-and-glow',
      start: 0,
      end: 350,
      properties: {
        transform: ['translateY(0) scale(1)', 'translateY(-6px) scale(1.02)'],
        boxShadow: [
          '0 2px 8px rgba(44, 37, 32, 0.04)',
          '0 16px 40px var(--persona-glow, rgba(74, 103, 65, 0.2))'
        ],
        borderColor: [
          'rgba(44, 37, 32, 0.06)',
          'var(--persona-primary, #4a6741)'
        ],
      },
      easing: EASING.EXPO_OUT,
    },
  ],
  
  reducedMotion: {
    totalDuration: 0,
    properties: {
      borderColor: ['rgba(44, 37, 32, 0.06)', 'var(--persona-primary)'],
    },
  },
};

/**
 * Persona card selection choreography
 */
export const PERSONA_CARD_SELECT_CHOREOGRAPHY: Choreography = {
  name: 'Persona Card Select',
  description: 'Selection with ring animation',
  totalDuration: 400,
  
  phases: [
    {
      name: 'pulse',
      start: 0,
      end: 200,
      properties: {
        transform: ['scale(1)', 'scale(1.05)'],
        boxShadow: [
          '0 0 0 0 var(--persona-glow)',
          '0 0 0 8px var(--persona-glow)'
        ],
      },
      easing: EASING.SPRING,
    },
    {
      name: 'settle',
      start: 200,
      end: 400,
      properties: {
        transform: ['scale(1.05)', 'scale(1)'],
        boxShadow: [
          '0 0 0 8px var(--persona-glow)',
          '0 0 0 4px var(--persona-primary)'
        ],
      },
      easing: EASING.GENTLE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 100,
    properties: {
      boxShadow: ['0 0 0 0 transparent', '0 0 0 4px var(--persona-primary)'],
    },
  },
};

// ============================================================================
// CARD REVEAL (Scroll)
// ============================================================================

/**
 * Card reveal on scroll choreography
 */
export const CARD_REVEAL_CHOREOGRAPHY: Choreography = {
  name: 'Card Reveal',
  description: 'Entrance animation when scrolling into view',
  totalDuration: 700,
  
  phases: [
    {
      name: 'fade-up',
      start: 0,
      end: 700,
      properties: {
        transform: ['translateY(40px)', 'translateY(0)'],
        opacity: [0, 1],
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

/**
 * Staggered card reveal (use with delay)
 */
export const CARD_REVEAL_STAGGER = {
  base: CARD_REVEAL_CHOREOGRAPHY,
  staggerDelay: 100, // ms between each card
  maxDelay: 500,     // Maximum total stagger
};

// ============================================================================
// FEATURE CARD FLIP
// ============================================================================

/**
 * Feature card flip choreography (for interactive cards)
 */
export const CARD_FLIP_CHOREOGRAPHY: Choreography = {
  name: 'Card Flip',
  description: '3D flip animation for interactive cards',
  totalDuration: 600,
  
  phases: [
    {
      name: 'flip-out',
      start: 0,
      end: 300,
      properties: {
        transform: ['rotateY(0deg)', 'rotateY(90deg)'],
        opacity: [1, 0],
      },
      easing: EASING.ACCELERATE,
    },
    {
      name: 'flip-in',
      start: 300,
      end: 600,
      properties: {
        transform: ['rotateY(-90deg)', 'rotateY(0deg)'],
        opacity: [0, 1],
      },
      easing: EASING.DECELERATE,
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
// EXPANDABLE CARD
// ============================================================================

/**
 * Card expand choreography
 */
export const CARD_EXPAND_CHOREOGRAPHY: Choreography = {
  name: 'Card Expand',
  description: 'Expand card to reveal more content',
  totalDuration: 400,
  
  phases: [
    {
      name: 'expand',
      start: 0,
      end: 400,
      properties: {
        height: ['auto', 'var(--expanded-height)'],
        transform: ['scale(1)', 'scale(1.02)'],
      },
      easing: EASING.SPRING_GENTLE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 100,
    properties: {
      height: ['auto', 'var(--expanded-height)'],
    },
  },
};

/**
 * Card collapse choreography
 */
export const CARD_COLLAPSE_CHOREOGRAPHY: Choreography = {
  name: 'Card Collapse',
  description: 'Collapse card to hide content',
  totalDuration: 300,
  
  phases: [
    {
      name: 'collapse',
      start: 0,
      end: 300,
      properties: {
        height: ['var(--expanded-height)', 'var(--collapsed-height)'],
        transform: ['scale(1.02)', 'scale(1)'],
      },
      easing: EASING.GENTLE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 100,
    properties: {
      height: ['var(--expanded-height)', 'var(--collapsed-height)'],
    },
  },
};

// ============================================================================
// CARD DISMISS
// ============================================================================

/**
 * Card dismiss (swipe away) choreography
 */
export const CARD_DISMISS_CHOREOGRAPHY: Choreography = {
  name: 'Card Dismiss',
  description: 'Swipe away dismissal',
  totalDuration: 300,
  
  phases: [
    {
      name: 'swipe',
      start: 0,
      end: 300,
      properties: {
        transform: ['translateX(0) rotate(0deg)', 'translateX(100%) rotate(3deg)'],
        opacity: [1, 0],
      },
      easing: EASING.ACCELERATE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 150,
    properties: {
      opacity: [1, 0],
    },
  },
};

