/**
 * Active Listening - Empathetic Nodding & Presence
 *
 * Real-time visual feedback during user speech - micro-nods, leans,
 * and acknowledgment signals.
 *
 * BETTER THAN HUMAN: Real humans nod every 1-2 seconds when actively listening.
 * Good human listeners provide continuous feedback. This creates the rhythm
 * of natural conversation and makes users feel heard moment-to-moment.
 *
 * @module @ferni/eq/capabilities/active-listening
 */

import { EASING } from '../../config/animation-constants.js';
import { ferniExpressions } from '../../ui/ferni-expressions.ui.js';
import { createLogger } from '../../utils/logger.js';
import { createTimeoutTracker } from '../../utils/tracked-timeout.js';
import type { ActiveListeningState, NodIntensity } from '../types.js';
import { playMicroExpression } from './micro-expressions.js';

const log = createLogger('ActiveListening');
const { trackedTimeout } = createTimeoutTracker();

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_NOD_INTERVAL = 1200; // Minimum ms between nods (was 2000 - too robotic!)
const NOD_PROBABILITY_BASE = 0.5; // Base probability per pause (was 0.3 - too rare!)

// ============================================================================
// STATE
// ============================================================================

let avatarContainer: HTMLElement | null = null;

const activeListening: ActiveListeningState = {
  isListening: false,
  lastNodTime: 0,
  nodCount: 0,
  pauseCount: 0,
};

// Collected pause patterns for breath detection (rolling window)
const pausePatterns: number[] = [];
const MAX_PAUSE_PATTERNS = 20;

// ============================================================================
// NOD ANIMATIONS
// ============================================================================

/**
 * Perform a micro-nod - barely perceptible acknowledgment.
 * Like a good listener's tiny nods during conversation.
 */
function performMicroNod(intensity: NodIntensity = 'micro'): void {
  if (!avatarContainer) return;

  const now = Date.now();
  if (now - activeListening.lastNodTime < MIN_NOD_INTERVAL) return;

  activeListening.lastNodTime = now;
  activeListening.nodCount++;

  // Scale based on intensity
  const scales = {
    micro: { y: 1.5, rotate: 0.3, duration: 180 },
    subtle: { y: 2.5, rotate: 0.5, duration: 220 },
    visible: { y: 4, rotate: 0.8, duration: 280 },
  };
  const params = scales[intensity];

  // Micro-nod animation - composite with existing animations
  avatarContainer.animate(
    [
      { transform: 'translateY(0) rotate(0deg)' },
      { transform: `translateY(${params.y}px) rotate(${params.rotate}deg)` },
      { transform: 'translateY(0) rotate(0deg)' },
    ],
    {
      duration: params.duration,
      easing: EASING.GENTLE,
      composite: 'add',
    }
  );

  log.debug('Micro-nod performed:', intensity);
}

/**
 * Perform a listening lean - shows deeper engagement.
 */
function performListeningLean(): void {
  if (!avatarContainer) return;

  avatarContainer.animate(
    [
      { transform: 'translateY(0) scale(1, 1)' },
      { transform: 'translateY(-3px) scale(0.998, 1.002)' },
      { transform: 'translateY(-2px) scale(0.999, 1.001)' },
    ],
    {
      duration: 400,
      easing: EASING.GENTLE,
      composite: 'add',
      fill: 'forwards',
    }
  );

  // Return to neutral after a bit
  trackedTimeout(() => {
    avatarContainer?.animate(
      [{ transform: 'translateY(-2px)' }, { transform: 'translateY(0)' }],
      {
        duration: 600,
        easing: EASING.GENTLE,
        composite: 'add',
      }
    );
  }, 1500);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Handle speech pause - decide whether to nod.
 * Call this when user pauses during speech.
 *
 * @returns Collected pause patterns for breath detection
 */
export function onUserSpeechPause(pauseDuration: number): number[] {
  if (!activeListening.isListening) return pausePatterns;

  activeListening.pauseCount++;

  // Collect pause patterns for breath detection
  if (pauseDuration > 100 && pauseDuration < 2000) {
    pausePatterns.push(pauseDuration);
    if (pausePatterns.length > MAX_PAUSE_PATTERNS) {
      pausePatterns.shift();
    }
  }

  // Visual feedback based on pause duration
  if (pauseDuration >= 150 && pauseDuration < 400) {
    // Very short pause (breath pause) - occasional micro-nod
    if (Math.random() < NOD_PROBABILITY_BASE + activeListening.pauseCount * 0.08) {
      performMicroNod('micro');
    }
  } else if (pauseDuration >= 400 && pauseDuration < 800) {
    // Short pause - more likely micro-nod
    if (Math.random() < NOD_PROBABILITY_BASE + 0.2 + activeListening.pauseCount * 0.05) {
      performMicroNod('micro');
    }
  } else if (pauseDuration >= 800 && pauseDuration < 1200) {
    // Medium pause - subtle acknowledgment
    performMicroNod('subtle');
    if (Math.random() < 0.25) {
      playMicroExpression('understanding');
    }
  } else if (pauseDuration >= 1200 && pauseDuration < 2000) {
    // Longer pause - visible nod + maybe lean in
    performMicroNod('visible');
    if (Math.random() < 0.4) {
      performListeningLean();
    }
  } else if (pauseDuration >= 2000 && pauseDuration < 3500) {
    // Long pause - they're thinking, show patience
    ferniExpressions.setExpression('contemplative', 300);
    playMicroExpression('contemplation');
  } else if (pauseDuration >= 3500) {
    // Very long pause - gentle concern check
    ferniExpressions.setExpression('attentive', 400);
    playMicroExpression('warmth_pulse');
    // Trigger soft check-in after very long pauses
    if (pauseDuration > 5000) {
      document.dispatchEvent(new CustomEvent('ferni:soft-checkin'));
    }
  }

  return pausePatterns;
}

/**
 * Start active listening mode.
 */
export function startActiveListening(): void {
  activeListening.isListening = true;
  activeListening.pauseCount = 0;
  log.debug('Active listening started');

  // Telemetry: Track active listening activation
  document.dispatchEvent(
    new CustomEvent('ferni:telemetry', {
      detail: { type: 'active_listening', action: 'start' },
    })
  );
}

/**
 * Stop active listening mode.
 */
export function stopActiveListening(): void {
  activeListening.isListening = false;
  log.debug('Active listening stopped', {
    pauseCount: pausePatterns.length,
  });
}

/**
 * Get current active listening state
 */
export function getActiveListeningState(): Readonly<ActiveListeningState> {
  return { ...activeListening };
}

/**
 * Get collected pause patterns
 */
export function getPausePatterns(): readonly number[] {
  return [...pausePatterns];
}

/**
 * Clear pause patterns
 */
export function clearPausePatterns(): void {
  pausePatterns.length = 0;
}

/**
 * Set the avatar container element
 */
export function setAvatarContainer(container: HTMLElement | null): void {
  avatarContainer = container;
}

/**
 * Check if currently listening
 */
export function isListening(): boolean {
  return activeListening.isListening;
}
