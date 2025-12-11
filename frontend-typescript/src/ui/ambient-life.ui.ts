/**
 * Ambient Life System - Making Ferni Feel Alive When Idle
 *
 * This module adds personality and presence when Ferni is not actively in conversation.
 * The goal is to make the avatar feel like a living being waiting to connect, not a
 * static interface element.
 *
 * PHILOSOPHY:
 * ===========
 * Humans fidget, shift, glance around, and have micro-expressions even when "idle."
 * Ferni should too. This creates the feeling that there's "someone home" - a presence
 * that makes users feel welcomed before they even start talking.
 *
 * BEHAVIORS:
 * ==========
 * 1. OCCASIONAL BLINKS - Avatar "blinks" via subtle scale/brightness change
 * 2. CURIOUS GLANCES - Small rotation as if looking around
 * 3. SUBTLE STRETCHES - Tiny scale changes like settling into position
 * 4. WARMTH PULSES - Random gentle glow increases
 * 5. ANTICIPATORY PERKS - Slight lift when mouse/touch approaches
 * 6. BREATHING VARIATION - Breath rate varies slightly over time
 *
 * TIMING:
 * =======
 * - Actions happen every 3-8 seconds (randomized)
 * - Never during conversation (yields to speech animations)
 * - Reduced intensity at night (respects circadian rhythms)
 * - Pauses when tab is not visible
 *
 * @see brand/BETTER-THAN-HUMAN.md
 */

import { EASING } from '../config/animation-constants.js';
import { gsap } from '../utils/gsap-setup.js';
import { createLogger } from '../utils/logger.js';
import { ferniExpressions } from './ferni-expressions.ui.js';

const log = createLogger('AmbientLife');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Timing between ambient actions (ms)
  MIN_ACTION_INTERVAL: 4000,
  MAX_ACTION_INTERVAL: 10000,

  // Probability of each action type (must sum to ~1)
  ACTION_WEIGHTS: {
    blink: 0.3, // Most common - natural
    curiousGlance: 0.2, // Looking around
    subtleStretch: 0.15, // Settling movement
    warmthPulse: 0.15, // Emotional warmth
    microNod: 0.1, // Small acknowledgment
    anticipation: 0.1, // Slight perk up
  },

  // Animation parameters
  BLINK_DURATION: 150,
  GLANCE_DURATION: 800,
  STRETCH_DURATION: 1200,
  WARMTH_DURATION: 2000,
  NOD_DURATION: 400,

  // Night mode (reduced activity)
  NIGHT_START_HOUR: 22,
  NIGHT_END_HOUR: 6,
  NIGHT_ACTIVITY_MULTIPLIER: 0.5,
} as const;

// ============================================================================
// STATE
// ============================================================================

interface AmbientState {
  isActive: boolean;
  isConversing: boolean;
  isPaused: boolean;
  lastActionTime: number;
  actionTimer: number | null;
  avatarElement: HTMLElement | null;
  avatarContainer: HTMLElement | null;
  glowElement: HTMLElement | null;
}

const state: AmbientState = {
  isActive: false,
  isConversing: false,
  isPaused: false,
  lastActionTime: 0,
  actionTimer: null,
  avatarElement: null,
  avatarContainer: null,
  glowElement: null,
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the Ambient Life system.
 * Call this after the avatar is in the DOM.
 */
export function initAmbientLife(): void {
  if (state.isActive) return;

  state.avatarElement = document.getElementById('coachAvatar');
  state.avatarContainer = document.querySelector('.avatar-container');
  state.glowElement = document.querySelector('.soul-glow-bleed');

  if (!state.avatarElement || !state.avatarContainer) {
    log.warn('Avatar not found, retrying...');
    setTimeout(initAmbientLife, 500);
    return;
  }

  // Set up event listeners
  setupEventListeners();

  // Start the ambient life loop
  state.isActive = true;
  scheduleNextAction();

  log.info('🌿 Ambient Life initialized - Ferni is alive!');
}

/**
 * Set up event listeners for conversation state and visibility.
 */
function setupEventListeners(): void {
  // Pause during conversation
  window.addEventListener('ferni:conversation-start', () => {
    state.isConversing = true;
    log.debug('Conversation started - ambient life paused');
  });

  window.addEventListener('ferni:conversation-end', () => {
    state.isConversing = false;
    log.debug('Conversation ended - ambient life resumed');
  });

  // Also listen for speech events
  window.addEventListener('ferni:agent-speech-start', () => {
    state.isConversing = true;
  });

  window.addEventListener('ferni:agent-speech-end', () => {
    // Small delay before resuming to let conversation settle
    setTimeout(() => {
      if (!state.isConversing) return;
      state.isConversing = false;
    }, 2000);
  });

  // Pause when tab not visible
  document.addEventListener('visibilitychange', () => {
    state.isPaused = document.hidden;
    if (!document.hidden && state.isActive) {
      scheduleNextAction();
    }
  });

  // Anticipation on hover/approach
  state.avatarContainer?.addEventListener('mouseenter', handleAvatarApproach);
  state.avatarContainer?.addEventListener('touchstart', handleAvatarApproach, { passive: true });
}

// ============================================================================
// AMBIENT ACTION SCHEDULING
// ============================================================================

/**
 * Schedule the next ambient action.
 */
function scheduleNextAction(): void {
  if (!state.isActive || state.isPaused) return;

  // Clear any existing timer
  if (state.actionTimer) {
    clearTimeout(state.actionTimer);
  }

  // Calculate interval with night mode adjustment
  let interval =
    CONFIG.MIN_ACTION_INTERVAL +
    Math.random() * (CONFIG.MAX_ACTION_INTERVAL - CONFIG.MIN_ACTION_INTERVAL);

  if (isNightTime()) {
    interval *= 1 / CONFIG.NIGHT_ACTIVITY_MULTIPLIER; // Longer intervals at night
  }

  state.actionTimer = window.setTimeout(() => {
    performRandomAction();
    scheduleNextAction();
  }, interval);
}

/**
 * Perform a random ambient action based on weights.
 */
function performRandomAction(): void {
  // Skip if conversing or paused
  if (state.isConversing || state.isPaused) return;

  // Check for reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Select action based on weights
  const rand = Math.random();
  let cumulative = 0;

  for (const [action, weight] of Object.entries(CONFIG.ACTION_WEIGHTS)) {
    cumulative += weight;
    if (rand <= cumulative) {
      executeAction(action as keyof typeof CONFIG.ACTION_WEIGHTS);
      break;
    }
  }

  state.lastActionTime = Date.now();
}

/**
 * Execute a specific ambient action.
 */
function executeAction(action: keyof typeof CONFIG.ACTION_WEIGHTS): void {
  switch (action) {
    case 'blink':
      performBlink();
      break;
    case 'curiousGlance':
      performCuriousGlance();
      break;
    case 'subtleStretch':
      performSubtleStretch();
      break;
    case 'warmthPulse':
      performWarmthPulse();
      break;
    case 'microNod':
      performMicroNod();
      break;
    case 'anticipation':
      performAnticipation();
      break;
  }

  log.debug(`Ambient action: ${action}`);
}

// ============================================================================
// AMBIENT ACTIONS
// ============================================================================

/**
 * Blink - Quick brightness/scale flash like a natural blink.
 */
function performBlink(): void {
  if (!state.avatarElement) return;

  gsap
    .timeline()
    .to(state.avatarElement, {
      scaleY: 0.97,
      filter: 'brightness(0.95)',
      duration: CONFIG.BLINK_DURATION / 2000,
      ease: 'power2.in',
    })
    .to(state.avatarElement, {
      scaleY: 1,
      filter: 'brightness(1)',
      duration: CONFIG.BLINK_DURATION / 2000,
      ease: 'power2.out',
    });
}

/**
 * Curious Glance - Small rotation as if looking at something.
 */
function performCuriousGlance(): void {
  if (!state.avatarContainer) return;

  // Random direction
  const direction = Math.random() > 0.5 ? 1 : -1;
  const angle = direction * (2 + Math.random() * 3); // 2-5 degrees
  const translateX = direction * (2 + Math.random() * 4); // 2-6px

  gsap
    .timeline()
    .to(state.avatarContainer, {
      rotation: angle,
      x: translateX,
      duration: CONFIG.GLANCE_DURATION / 2000,
      ease: EASING.GENTLE,
    })
    .to(state.avatarContainer, {
      rotation: 0,
      x: 0,
      duration: CONFIG.GLANCE_DURATION / 2000,
      ease: EASING.SPRING_GENTLE,
    });
}

/**
 * Subtle Stretch - Tiny scale change like settling into position.
 */
function performSubtleStretch(): void {
  if (!state.avatarElement) return;

  // Random stretch type
  const stretchType = Math.random();

  if (stretchType < 0.5) {
    // Vertical stretch (like a sigh)
    gsap
      .timeline()
      .to(state.avatarElement, {
        scaleY: 1.03,
        scaleX: 0.98,
        duration: CONFIG.STRETCH_DURATION / 3000,
        ease: 'sine.inOut',
      })
      .to(state.avatarElement, {
        scaleY: 1,
        scaleX: 1,
        duration: CONFIG.STRETCH_DURATION / 1500,
        ease: EASING.SPRING_GENTLE,
      });
  } else {
    // Horizontal settle
    gsap
      .timeline()
      .to(state.avatarElement, {
        scaleX: 1.02,
        scaleY: 0.99,
        duration: CONFIG.STRETCH_DURATION / 3000,
        ease: 'sine.inOut',
      })
      .to(state.avatarElement, {
        scaleX: 1,
        scaleY: 1,
        duration: CONFIG.STRETCH_DURATION / 1500,
        ease: EASING.SPRING_GENTLE,
      });
  }
}

/**
 * Warmth Pulse - Gentle glow increase showing emotional presence.
 */
function performWarmthPulse(): void {
  if (!state.glowElement) return;

  // Increase glow opacity briefly
  gsap
    .timeline()
    .to(state.glowElement, {
      opacity: 0.6,
      scale: 1.1,
      duration: CONFIG.WARMTH_DURATION / 2000,
      ease: 'sine.inOut',
    })
    .to(state.glowElement, {
      opacity: 0.35,
      scale: 1,
      duration: CONFIG.WARMTH_DURATION / 2000,
      ease: 'sine.inOut',
    });

  // Also trigger a subtle expression if available
  try {
    ferniExpressions.setExpression('warm', 300);
  } catch {
    // Expression system not ready
  }
}

/**
 * Micro Nod - Small vertical movement like a gentle acknowledgment.
 */
function performMicroNod(): void {
  if (!state.avatarContainer) return;

  gsap
    .timeline()
    .to(state.avatarContainer, {
      y: 3,
      duration: CONFIG.NOD_DURATION / 3000,
      ease: 'power2.out',
    })
    .to(state.avatarContainer, {
      y: 0,
      duration: CONFIG.NOD_DURATION / 1500,
      ease: EASING.SPRING_GENTLE,
    });
}

/**
 * Anticipation - Slight lift/perk like noticing something.
 */
function performAnticipation(): void {
  if (!state.avatarContainer || !state.avatarElement) return;

  gsap
    .timeline()
    .to(state.avatarContainer, {
      y: -4,
      duration: 0.2,
      ease: 'power2.out',
    })
    .to(
      state.avatarElement,
      {
        scale: 1.03,
        duration: 0.15,
        ease: 'power2.out',
      },
      '<'
    )
    .to(state.avatarContainer, {
      y: 0,
      duration: 0.4,
      ease: EASING.SPRING_GENTLE,
    })
    .to(
      state.avatarElement,
      {
        scale: 1,
        duration: 0.3,
        ease: EASING.SPRING_GENTLE,
      },
      '<'
    );
}

// ============================================================================
// INTERACTIVE RESPONSES
// ============================================================================

/**
 * Handle when user approaches the avatar (hover/touch).
 */
function handleAvatarApproach(): void {
  if (state.isConversing) return;

  // Perk up with interest
  if (state.avatarElement && state.avatarContainer) {
    gsap
      .timeline()
      .to(state.avatarElement, {
        scale: 1.05,
        filter: 'brightness(1.05)',
        duration: 0.3,
        ease: EASING.SPRING,
      })
      .to(
        state.avatarContainer,
        {
          y: -2,
          duration: 0.2,
          ease: 'power2.out',
        },
        '<'
      );
  }

  // Show curiosity expression
  try {
    ferniExpressions.setExpression('curious', 400);
  } catch {
    // Expression system not ready
  }

  log.debug('Avatar noticed approach');
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Check if it's night time (reduced activity period).
 */
function isNightTime(): boolean {
  const hour = new Date().getHours();
  return hour >= CONFIG.NIGHT_START_HOUR || hour < CONFIG.NIGHT_END_HOUR;
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Stop and clean up the Ambient Life system.
 */
export function disposeAmbientLife(): void {
  if (state.actionTimer) {
    clearTimeout(state.actionTimer);
  }

  state.avatarContainer?.removeEventListener('mouseenter', handleAvatarApproach);

  state.isActive = false;
  state.avatarElement = null;
  state.avatarContainer = null;
  state.glowElement = null;

  log.info('Ambient Life disposed');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const ambientLife = {
  init: initAmbientLife,
  dispose: disposeAmbientLife,
  pause: () => {
    state.isPaused = true;
  },
  resume: () => {
    state.isPaused = false;
    scheduleNextAction();
  },
};

export default ambientLife;
