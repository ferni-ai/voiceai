/**
 * Seeds Toast UI
 *
 * Shows gentle whisper notifications when seeds are earned.
 * Now uses the unified whisper system for consistency.
 *
 * Features:
 * - Celebratory whisper for earning seeds
 * - Streak celebration for milestone achievements
 * - Queued with other whispers (no overlapping)
 */

import { whisper } from './whisper.ui.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('SeedsToast');

// ============================================================================
// TOAST FUNCTIONS
// ============================================================================

/**
 * Show seeds earned whisper
 */
export function showSeedsToast(amount: number, reason: string, isCelebration = false): void {
  if (isCelebration) {
    whisper.celebration(amount, reason);
  } else {
    // Use celebration variant for all seeds (feels more rewarding)
    whisper.celebration(amount, reason);
  }

  log.debug({ amount, reason, isCelebration }, 'Seeds whisper shown');
}

/**
 * Show streak milestone whisper
 */
export function showStreakToast(days: number, reward: number): void {
  showSeedsToast(reward, `${days}-day streak!`, true);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize seeds toast listeners
 */
export function initSeedsToast(): void {
  // Listen for seeds earned events
  document.addEventListener('ferni:seeds-earned', ((e: CustomEvent) => {
    const { amount, reason, type } = e.detail as {
      amount: number;
      reason: string;
      type: string;
    };

    // Determine if this is a celebration-worthy event
    const isCelebration = type === 'streak' || type === 'milestone' || amount >= 50;

    showSeedsToast(amount, reason, isCelebration);
  }) as EventListener);

  // Listen for streak milestone events
  document.addEventListener('ferni:streak-milestone', ((e: CustomEvent) => {
    const { days, reward } = e.detail as { days: number; reward: number };
    showStreakToast(days, reward);
  }) as EventListener);

  log.info('Seeds toast initialized (using whisper system)');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const seedsToast = {
  init: initSeedsToast,
  show: showSeedsToast,
  showStreak: showStreakToast,
};

export default seedsToast;
