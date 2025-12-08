/**
 * Celebration Moment Choreographies
 * Frame-by-frame specifications for win celebrations and milestones
 */

import { Choreography, EASING, DURATION } from './index.js';

// ============================================================================
// SMALL WIN CELEBRATION
// ============================================================================

/**
 * Small win celebration choreography
 * Subtle but satisfying acknowledgment
 */
export const SMALL_WIN_CHOREOGRAPHY: Choreography = {
  name: 'Small Win Celebration',
  description: 'Subtle celebration for daily wins',
  totalDuration: 800,
  
  phases: [
    {
      name: 'anticipation',
      start: 0,
      end: 100,
      properties: {
        transform: ['scale(1)', 'scale(0.95)'],
      },
      easing: EASING.ANTICIPATE,
    },
    {
      name: 'burst',
      start: 100,
      end: 400,
      properties: {
        transform: ['scale(0.95)', 'scale(1.1)'],
        boxShadow: [
          '0 0 0 0 rgba(61, 122, 82, 0)',
          '0 0 40px 10px rgba(61, 122, 82, 0.3)'
        ],
      },
      easing: EASING.SPRING,
    },
    {
      name: 'settle',
      start: 400,
      end: 800,
      properties: {
        transform: ['scale(1.1)', 'scale(1)'],
        boxShadow: [
          '0 0 40px 10px rgba(61, 122, 82, 0.3)',
          '0 0 0 0 rgba(61, 122, 82, 0)'
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
// BIG WIN CELEBRATION
// ============================================================================

/**
 * Big win celebration choreography
 * Major milestone with full celebration
 */
export const BIG_WIN_CHOREOGRAPHY: Choreography = {
  name: 'Big Win Celebration',
  description: 'Major celebration for milestones',
  totalDuration: 1200,
  
  phases: [
    {
      name: 'anticipation',
      start: 0,
      end: 150,
      properties: {
        transform: ['scale(1)', 'scale(0.9)'],
      },
      easing: EASING.ANTICIPATE,
    },
    {
      name: 'explosion',
      start: 150,
      end: 500,
      properties: {
        transform: ['scale(0.9)', 'scale(1.2)'],
        boxShadow: [
          '0 0 0 0 rgba(196, 162, 101, 0)',
          '0 0 60px 20px rgba(196, 162, 101, 0.5)'
        ],
      },
      easing: EASING.SPRING,
    },
    {
      name: 'bounce',
      start: 500,
      end: 800,
      properties: {
        transform: ['scale(1.2)', 'scale(0.95)'],
      },
      easing: EASING.OVERSHOOT,
    },
    {
      name: 'settle',
      start: 800,
      end: 1200,
      properties: {
        transform: ['scale(0.95)', 'scale(1)'],
        boxShadow: [
          '0 0 60px 20px rgba(196, 162, 101, 0.5)',
          '0 0 0 0 rgba(196, 162, 101, 0)'
        ],
      },
      easing: EASING.GENTLE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 300,
    properties: {
      opacity: [0.7, 1],
    },
  },
};

// ============================================================================
// STREAK CELEBRATION
// ============================================================================

/**
 * Streak milestone celebration
 * Special animation for consistency achievements
 */
export const STREAK_CHOREOGRAPHY: Choreography = {
  name: 'Streak Celebration',
  description: 'Celebration for consistency milestones',
  totalDuration: 1000,
  
  phases: [
    {
      name: 'pulse-1',
      start: 0,
      end: 200,
      properties: {
        transform: ['scale(1)', 'scale(1.1)'],
        opacity: [1, 0.9],
      },
      easing: EASING.EXPO_OUT,
    },
    {
      name: 'pulse-2',
      start: 200,
      end: 400,
      properties: {
        transform: ['scale(1.1)', 'scale(1.05)'],
        opacity: [0.9, 1],
      },
      easing: EASING.SMOOTH,
    },
    {
      name: 'pulse-3',
      start: 400,
      end: 600,
      properties: {
        transform: ['scale(1.05)', 'scale(1.15)'],
        opacity: [1, 0.95],
      },
      easing: EASING.EXPO_OUT,
    },
    {
      name: 'settle',
      start: 600,
      end: 1000,
      properties: {
        transform: ['scale(1.15)', 'scale(1)'],
        opacity: [0.95, 1],
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
// SPARKLE BURST
// ============================================================================

/**
 * Sparkle particle burst choreography
 * Companion animation for celebrations
 */
export const SPARKLE_BURST_CHOREOGRAPHY: Choreography = {
  name: 'Sparkle Burst',
  description: 'Particle burst for celebration accents',
  totalDuration: 700,
  
  phases: [
    {
      name: 'appear',
      start: 0,
      end: 100,
      properties: {
        transform: ['scale(0) rotate(0deg)', 'scale(1) rotate(180deg)'],
        opacity: [0, 1],
      },
      easing: EASING.SPRING,
    },
    {
      name: 'float',
      start: 100,
      end: 500,
      properties: {
        transform: ['scale(1) rotate(180deg)', 'scale(1.2) rotate(360deg)'],
        opacity: [1, 0.8],
      },
      easing: EASING.SMOOTH,
    },
    {
      name: 'fade',
      start: 500,
      end: 700,
      properties: {
        transform: ['scale(1.2)', 'scale(0.5)'],
        opacity: [0.8, 0],
      },
      easing: EASING.DECELERATE,
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
// CONFETTI SINGLE
// ============================================================================

/**
 * Single confetti piece choreography
 * Used in array for full confetti effect
 */
export const CONFETTI_PIECE_CHOREOGRAPHY: Choreography = {
  name: 'Confetti Piece',
  description: 'Single confetti piece animation',
  totalDuration: 3000,
  
  phases: [
    {
      name: 'launch',
      start: 0,
      end: 500,
      properties: {
        transform: [
          'translateY(0) translateX(0) rotate(0deg)',
          'translateY(-100px) translateX(var(--confetti-x)) rotate(180deg)'
        ],
        opacity: [0, 1],
      },
      easing: EASING.EXPO_OUT,
    },
    {
      name: 'fall',
      start: 500,
      end: 2500,
      properties: {
        transform: [
          'translateY(-100px) translateX(var(--confetti-x)) rotate(180deg)',
          'translateY(200px) translateX(var(--confetti-x2)) rotate(720deg)'
        ],
        opacity: [1, 0.8],
      },
      easing: EASING.SMOOTH,
    },
    {
      name: 'fade-out',
      start: 2500,
      end: 3000,
      properties: {
        opacity: [0.8, 0],
      },
      easing: EASING.GENTLE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 500,
    properties: {
      opacity: [0, 1],
    },
  },
};

// ============================================================================
// RELATIONSHIP STAGE UP
// ============================================================================

/**
 * Relationship stage upgrade choreography
 * Special milestone animation
 */
export const RELATIONSHIP_STAGE_UP_CHOREOGRAPHY: Choreography = {
  name: 'Relationship Stage Up',
  description: 'Celebration for relationship milestones',
  totalDuration: 1500,
  
  phases: [
    {
      name: 'glow-build',
      start: 0,
      end: 500,
      properties: {
        boxShadow: [
          '0 0 0 0 rgba(74, 103, 65, 0)',
          '0 0 60px 30px rgba(74, 103, 65, 0.4)'
        ],
        transform: ['scale(1)', 'scale(1.05)'],
      },
      easing: EASING.SMOOTH,
    },
    {
      name: 'flash',
      start: 500,
      end: 700,
      properties: {
        filter: ['brightness(1)', 'brightness(1.3)'],
        transform: ['scale(1.05)', 'scale(1.15)'],
      },
      easing: EASING.EXPO_OUT,
    },
    {
      name: 'settle',
      start: 700,
      end: 1500,
      properties: {
        boxShadow: [
          '0 0 60px 30px rgba(74, 103, 65, 0.4)',
          '0 0 20px 5px rgba(74, 103, 65, 0.2)'
        ],
        filter: ['brightness(1.3)', 'brightness(1)'],
        transform: ['scale(1.15)', 'scale(1)'],
      },
      easing: EASING.GENTLE,
    },
  ],
  
  reducedMotion: {
    totalDuration: 300,
    properties: {
      opacity: [0.7, 1],
    },
  },
};

// ============================================================================
// COURAGE MOMENT
// ============================================================================

/**
 * Courage moment celebration
 * Acknowledging when user did something brave
 */
export const COURAGE_MOMENT_CHOREOGRAPHY: Choreography = {
  name: 'Courage Moment',
  description: 'Celebration for brave actions',
  totalDuration: 900,
  
  phases: [
    {
      name: 'heart-swell',
      start: 0,
      end: 300,
      properties: {
        transform: ['scale(1)', 'scale(1.15)'],
        boxShadow: [
          '0 0 0 0 rgba(196, 133, 106, 0)',
          '0 0 30px 10px rgba(196, 133, 106, 0.3)'
        ],
      },
      easing: EASING.SPRING_GENTLE,
    },
    {
      name: 'pulse',
      start: 300,
      end: 600,
      properties: {
        transform: ['scale(1.15)', 'scale(1.08)'],
      },
      easing: EASING.SMOOTH,
    },
    {
      name: 'settle',
      start: 600,
      end: 900,
      properties: {
        transform: ['scale(1.08)', 'scale(1)'],
        boxShadow: [
          '0 0 30px 10px rgba(196, 133, 106, 0.3)',
          '0 0 0 0 rgba(196, 133, 106, 0)'
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
// THINKING OF YOU
// ============================================================================

/**
 * "Thinking of you" notification choreography
 * Gentle, warm notification entrance
 */
export const THINKING_OF_YOU_CHOREOGRAPHY: Choreography = {
  name: 'Thinking of You',
  description: 'Gentle notification for proactive outreach',
  totalDuration: 800,
  
  phases: [
    {
      name: 'fade-in',
      start: 0,
      end: 400,
      properties: {
        transform: ['translateY(20px) scale(0.95)', 'translateY(0) scale(1)'],
        opacity: [0, 1],
      },
      easing: EASING.EXPO_OUT,
    },
    {
      name: 'glow',
      start: 400,
      end: 800,
      properties: {
        boxShadow: [
          '0 4px 20px rgba(74, 103, 65, 0.1)',
          '0 8px 30px rgba(74, 103, 65, 0.2)'
        ],
      },
      easing: EASING.SMOOTH,
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
// NUMBER COUNT UP
// ============================================================================

/**
 * Number count up choreography
 * For displaying milestone numbers
 */
export const NUMBER_COUNT_UP_CONFIG = {
  name: 'Number Count Up',
  description: 'Animated number counting',
  duration: 1500,
  easing: EASING.EXPO_OUT,
  
  // Not a standard choreography - custom implementation
  countUp: (element: HTMLElement, start: number, end: number) => {
    const duration = 1500;
    const startTime = performance.now();
    
    const tick = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Eased progress
      const eased = 1 - Math.pow(1 - progress, 3);
      
      const current = Math.round(start + (end - start) * eased);
      element.textContent = current.toLocaleString();
      
      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    };
    
    requestAnimationFrame(tick);
  },
};

