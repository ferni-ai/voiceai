/**
 * Avatar Animation Choreographies
 * Frame-by-frame specifications for the AI avatar
 */

import { Choreography, EASING, DURATION } from './index.js';

// ============================================================================
// AVATAR BREATHE (IDLE)
// ============================================================================

/**
 * Avatar breathing choreography - continuous idle state
 * Pixar principle: Everything alive breathes
 */
export const AVATAR_BREATHE_CHOREOGRAPHY: Choreography = {
  name: 'Avatar Breathe',
  description: 'Continuous breathing animation for idle state',
  totalDuration: 5000,
  
  phases: [
    {
      name: 'inhale',
      start: 0,
      end: 2000,
      properties: {
        transform: [
          'scale3d(1, 1, 1) translateY(0)',
          'scale3d(0.994, 1.012, 1) translateY(-1.5px)'
        ],
      },
      easing: EASING.SMOOTH,
    },
    {
      name: 'hold',
      start: 2000,
      end: 2500,
      properties: {
        transform: [
          'scale3d(0.994, 1.012, 1) translateY(-1.5px)',
          'scale3d(0.994, 1.012, 1) translateY(-1.5px)'
        ],
      },
      easing: 'linear',
    },
    {
      name: 'exhale',
      start: 2500,
      end: 4500,
      properties: {
        transform: [
          'scale3d(0.994, 1.012, 1) translateY(-1.5px)',
          'scale3d(1, 1, 1) translateY(0)'
        ],
      },
      easing: EASING.SMOOTH,
    },
    {
      name: 'rest',
      start: 4500,
      end: 5000,
      properties: {
        transform: [
          'scale3d(1, 1, 1) translateY(0)',
          'scale3d(1, 1, 1) translateY(0)'
        ],
      },
      easing: 'linear',
    },
  ],
  
  reducedMotion: {
    totalDuration: 0,
    properties: {},
  },
};

// ============================================================================
// AVATAR SPEAKING
// ============================================================================

/**
 * Avatar speaking state choreography
 * More active breathing with glow pulses
 */
export const AVATAR_SPEAKING_CHOREOGRAPHY: Choreography = {
  name: 'Avatar Speaking',
  description: 'Active state while AI is speaking',
  totalDuration: 3000,
  
  phases: [
    {
      name: 'pulse-up',
      start: 0,
      end: 1200,
      properties: {
        transform: [
          'scale3d(1, 1, 1) translateY(0)',
          'scale3d(0.988, 1.025, 1) translateY(-3px)'
        ],
        boxShadow: [
          '0 0 20px var(--persona-glow)',
          '0 0 40px var(--persona-glow)'
        ],
      },
      easing: EASING.SMOOTH,
    },
    {
      name: 'pulse-down',
      start: 1200,
      end: 2400,
      properties: {
        transform: [
          'scale3d(0.988, 1.025, 1) translateY(-3px)',
          'scale3d(1, 1, 1) translateY(0)'
        ],
        boxShadow: [
          '0 0 40px var(--persona-glow)',
          '0 0 20px var(--persona-glow)'
        ],
      },
      easing: EASING.SMOOTH,
    },
    {
      name: 'rest',
      start: 2400,
      end: 3000,
      properties: {
        // Slight pause before next cycle
      },
      easing: 'linear',
    },
  ],
  
  reducedMotion: {
    totalDuration: 0,
    properties: {},
  },
};

// ============================================================================
// AVATAR LISTENING
// ============================================================================

/**
 * Avatar listening state choreography
 * Attentive, slight lean-in
 */
export const AVATAR_LISTENING_CHOREOGRAPHY: Choreography = {
  name: 'Avatar Listening',
  description: 'Attentive state while user is speaking',
  totalDuration: 4000,
  
  phases: [
    {
      name: 'lean-in',
      start: 0,
      end: 1500,
      properties: {
        transform: [
          'scale3d(1, 1, 1) translateY(0) rotate(0deg)',
          'scale3d(0.993, 1.015, 1) translateY(-1.8px) rotate(-0.4deg)'
        ],
      },
      easing: EASING.GENTLE,
    },
    {
      name: 'hold',
      start: 1500,
      end: 2500,
      properties: {
        // Holding attentive position
      },
      easing: 'linear',
    },
    {
      name: 'settle',
      start: 2500,
      end: 4000,
      properties: {
        transform: [
          'scale3d(0.993, 1.015, 1) translateY(-1.8px) rotate(-0.4deg)',
          'scale3d(1, 1, 1) translateY(0) rotate(0deg)'
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
// AVATAR THINKING
// ============================================================================

/**
 * Avatar thinking choreography
 * Curious tilt while processing
 */
export const AVATAR_THINKING_CHOREOGRAPHY: Choreography = {
  name: 'Avatar Thinking',
  description: 'Processing/thinking state',
  totalDuration: 2000,
  
  phases: [
    {
      name: 'tilt',
      start: 0,
      end: 800,
      properties: {
        transform: [
          'rotate(0deg) translateX(0)',
          'rotate(3deg) translateX(2px)'
        ],
      },
      easing: EASING.SMOOTH,
    },
    {
      name: 'hold',
      start: 800,
      end: 1200,
      properties: {
        // Hold curious position
      },
      easing: 'linear',
    },
    {
      name: 'return',
      start: 1200,
      end: 2000,
      properties: {
        transform: [
          'rotate(3deg) translateX(2px)',
          'rotate(0deg) translateX(0)'
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
// AVATAR NOD (AGREEMENT)
// ============================================================================

/**
 * Avatar nod choreography
 * Agreement/acknowledgment gesture
 */
export const AVATAR_NOD_CHOREOGRAPHY: Choreography = {
  name: 'Avatar Nod',
  description: 'Agreement nod with squash & stretch',
  totalDuration: 600,
  
  phases: [
    {
      name: 'down-squash',
      start: 0,
      end: 150,
      properties: {
        transform: [
          'scale3d(1, 1, 1) translateY(0) rotate(0deg)',
          'scale3d(1.02, 0.98, 1) translateY(3px) rotate(3deg)'
        ],
      },
      easing: EASING.ACCELERATE,
    },
    {
      name: 'up-stretch',
      start: 150,
      end: 300,
      properties: {
        transform: [
          'scale3d(1.02, 0.98, 1) translateY(3px) rotate(3deg)',
          'scale3d(0.98, 1.03, 1) translateY(-5px) rotate(-4deg)'
        ],
      },
      easing: EASING.SPRING,
    },
    {
      name: 'settle-1',
      start: 300,
      end: 450,
      properties: {
        transform: [
          'scale3d(0.98, 1.03, 1) translateY(-5px) rotate(-4deg)',
          'scale3d(1.01, 0.99, 1) translateY(2px) rotate(2deg)'
        ],
      },
      easing: EASING.SMOOTH,
    },
    {
      name: 'settle-2',
      start: 450,
      end: 600,
      properties: {
        transform: [
          'scale3d(1.01, 0.99, 1) translateY(2px) rotate(2deg)',
          'scale3d(1, 1, 1) translateY(0) rotate(0deg)'
        ],
      },
      easing: EASING.GENTLE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 100,
    properties: {
      opacity: [0.9, 1],
    },
  },
};

// ============================================================================
// AVATAR BOUNCE (EXCITEMENT)
// ============================================================================

/**
 * Avatar bounce choreography
 * Luxo Jr. style excited bounce
 */
export const AVATAR_BOUNCE_CHOREOGRAPHY: Choreography = {
  name: 'Avatar Bounce',
  description: 'Excited bounce with full squash & stretch',
  totalDuration: 800,
  
  phases: [
    {
      name: 'anticipation-squash',
      start: 0,
      end: 100,
      properties: {
        transform: [
          'scale3d(1, 1, 1) translateY(0)',
          'scale3d(1.08, 0.92, 1) translateY(2px)'
        ],
      },
      easing: EASING.ANTICIPATE,
    },
    {
      name: 'launch',
      start: 100,
      end: 280,
      properties: {
        transform: [
          'scale3d(1.08, 0.92, 1) translateY(2px)',
          'scale3d(0.92, 1.1, 1) translateY(-15px)'
        ],
      },
      easing: EASING.EXPO_OUT,
    },
    {
      name: 'apex',
      start: 280,
      end: 350,
      properties: {
        transform: [
          'scale3d(0.92, 1.1, 1) translateY(-15px)',
          'scale3d(0.94, 1.08, 1) translateY(-12px)'
        ],
      },
      easing: EASING.SMOOTH,
    },
    {
      name: 'fall',
      start: 350,
      end: 500,
      properties: {
        transform: [
          'scale3d(0.94, 1.08, 1) translateY(-12px)',
          'scale3d(1.1, 0.9, 1) translateY(3px)'
        ],
      },
      easing: EASING.ACCELERATE,
    },
    {
      name: 'settle',
      start: 500,
      end: 800,
      properties: {
        transform: [
          'scale3d(1.1, 0.9, 1) translateY(3px)',
          'scale3d(1, 1, 1) translateY(0)'
        ],
      },
      easing: EASING.GENTLE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 200,
    properties: {
      opacity: [0.8, 1],
    },
  },
};

// ============================================================================
// AVATAR PULSE (ACKNOWLEDGMENT)
// ============================================================================

/**
 * Avatar pulse choreography
 * Warm acknowledgment pulse
 */
export const AVATAR_PULSE_CHOREOGRAPHY: Choreography = {
  name: 'Avatar Pulse',
  description: 'Warm heartbeat-style acknowledgment',
  totalDuration: 700,
  
  phases: [
    {
      name: 'expand-1',
      start: 0,
      end: 200,
      properties: {
        transform: ['scale3d(1, 1, 1)', 'scale3d(1.06, 1.06, 1)'],
        filter: ['brightness(1)', 'brightness(1.1)'],
      },
      easing: EASING.EXPO_OUT,
    },
    {
      name: 'contract-1',
      start: 200,
      end: 350,
      properties: {
        transform: ['scale3d(1.06, 1.06, 1)', 'scale3d(0.98, 0.98, 1)'],
        filter: ['brightness(1.1)', 'brightness(1.03)'],
      },
      easing: EASING.SMOOTH,
    },
    {
      name: 'expand-2',
      start: 350,
      end: 500,
      properties: {
        transform: ['scale3d(0.98, 0.98, 1)', 'scale3d(1.02, 1.02, 1)'],
        filter: ['brightness(1.03)', 'brightness(1.02)'],
      },
      easing: EASING.EXPO_OUT,
    },
    {
      name: 'settle',
      start: 500,
      end: 700,
      properties: {
        transform: ['scale3d(1.02, 1.02, 1)', 'scale3d(1, 1, 1)'],
        filter: ['brightness(1.02)', 'brightness(1)'],
      },
      easing: EASING.GENTLE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 100,
    properties: {
      opacity: [0.9, 1],
    },
  },
};

// ============================================================================
// AVATAR SHAKE (GENTLE DISAGREEMENT)
// ============================================================================

/**
 * Avatar shake choreography
 * Gentle "no" or uncertainty
 */
export const AVATAR_SHAKE_CHOREOGRAPHY: Choreography = {
  name: 'Avatar Shake',
  description: 'Gentle disagreement or uncertainty',
  totalDuration: 500,
  
  phases: [
    {
      name: 'left',
      start: 0,
      end: 100,
      properties: {
        transform: [
          'scale3d(1, 1, 1) translateX(0) rotate(0deg)',
          'scale3d(0.98, 1.02, 1) translateX(-4px) rotate(-2deg)'
        ],
      },
      easing: EASING.SMOOTH,
    },
    {
      name: 'right',
      start: 100,
      end: 200,
      properties: {
        transform: [
          'scale3d(0.98, 1.02, 1) translateX(-4px) rotate(-2deg)',
          'scale3d(1.02, 0.98, 1) translateX(4px) rotate(2deg)'
        ],
      },
      easing: EASING.SMOOTH,
    },
    {
      name: 'left-2',
      start: 200,
      end: 300,
      properties: {
        transform: [
          'scale3d(1.02, 0.98, 1) translateX(4px) rotate(2deg)',
          'scale3d(0.99, 1.01, 1) translateX(-2px) rotate(-1deg)'
        ],
      },
      easing: EASING.SMOOTH,
    },
    {
      name: 'settle',
      start: 300,
      end: 500,
      properties: {
        transform: [
          'scale3d(0.99, 1.01, 1) translateX(-2px) rotate(-1deg)',
          'scale3d(1, 1, 1) translateX(0) rotate(0deg)'
        ],
      },
      easing: EASING.GENTLE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 100,
    properties: {
      opacity: [0.9, 1],
    },
  },
};

// ============================================================================
// AVATAR ENTRANCE
// ============================================================================

/**
 * Avatar entrance choreography
 * First appearance animation
 */
export const AVATAR_ENTRANCE_CHOREOGRAPHY: Choreography = {
  name: 'Avatar Entrance',
  description: 'First appearance animation',
  totalDuration: 1200,
  
  phases: [
    {
      name: 'fade-scale',
      start: 0,
      end: 600,
      properties: {
        transform: ['scale(0.8)', 'scale(1.05)'],
        opacity: [0, 1],
      },
      easing: EASING.EXPO_OUT,
    },
    {
      name: 'settle',
      start: 600,
      end: 900,
      properties: {
        transform: ['scale(1.05)', 'scale(0.98)'],
      },
      easing: EASING.SMOOTH,
    },
    {
      name: 'final',
      start: 900,
      end: 1200,
      properties: {
        transform: ['scale(0.98)', 'scale(1)'],
      },
      easing: EASING.GENTLE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 300,
    properties: {
      opacity: [0, 1],
    },
  },
};

// ============================================================================
// AVATAR PERSONA TRANSITION
// ============================================================================

/**
 * Avatar persona transition choreography
 * Morphing between personas during handoff
 */
export const AVATAR_PERSONA_TRANSITION_CHOREOGRAPHY: Choreography = {
  name: 'Avatar Persona Transition',
  description: 'Morph between personas',
  totalDuration: 1000,
  
  phases: [
    {
      name: 'fade-out',
      start: 0,
      end: 400,
      properties: {
        opacity: [1, 0],
        transform: ['scale(1)', 'scale(0.95)'],
        filter: ['blur(0px)', 'blur(4px)'],
      },
      easing: EASING.SMOOTH,
    },
    {
      name: 'swap',
      start: 400,
      end: 500,
      properties: {
        // Color/persona swap happens here
      },
      easing: 'linear',
    },
    {
      name: 'fade-in',
      start: 500,
      end: 1000,
      properties: {
        opacity: [0, 1],
        transform: ['scale(1.05)', 'scale(1)'],
        filter: ['blur(4px)', 'blur(0px)'],
      },
      easing: EASING.EXPO_OUT,
    },
  ],
  
  reducedMotion: {
    totalDuration: 300,
    properties: {
      opacity: [0, 1],
    },
  },
};

