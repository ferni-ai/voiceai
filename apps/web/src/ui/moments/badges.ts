/**
 * Badge Data Manager - DEPRECATED UI RENDERING
 *
 * This module previously displayed badges below the avatar.
 * The visual display has been consolidated into the unified indicator.
 * 
 * This file now only manages badge STATE and dispatches events.
 * The actual display is handled by:
 * - unified-indicator.ui.ts - Single indicator for check-ins
 * - journey.ui.ts - Shows streak, achievements in modal
 *
 * @module ui/moments/badges
 */

import { createLogger } from '../../utils/logger.js';
import type { BadgeState } from './types.js';

const log = createLogger('BadgeData');

// ============================================================================
// BADGE DATA MANAGER (NO UI RENDERING)
// ============================================================================

class BadgeDisplay {
  private initialized = false;

  private state: BadgeState = {
    streak: 0,
    seeds: 0,
    achievementCount: 0,
    unseenAchievements: new Set(),
    hasCheckin: false,
    checkinMessage: undefined,
  };

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Initialize the badge data manager.
   * Note: No longer creates DOM elements - just manages state.
   */
  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    log.debug('Badge data manager initialized (no UI rendering)');
  }

  // ==========================================================================
  // PUBLIC API - State Updates
  // ==========================================================================

  /**
   * Update streak count.
   * Dispatches event for unified indicator / journey modal.
   */
  updateStreak(count: number, _animate = true): void {
    const oldStreak = this.state.streak;
    this.state.streak = count;

    if (count > oldStreak && count > 0) {
      // Dispatch event for any listeners
      window.dispatchEvent(
        new CustomEvent('ferni:streak-updated', {
          detail: { count, previous: oldStreak },
        })
      );
      log.debug('Streak updated', { count, previous: oldStreak });
    }
  }

  /**
   * Update seeds balance.
   * Dispatches event for any listeners.
   */
  updateSeeds(count: number, _animate = true): void {
    const oldSeeds = this.state.seeds;
    this.state.seeds = count;

    if (count !== oldSeeds) {
      window.dispatchEvent(
        new CustomEvent('ferni:seeds-updated', {
          detail: { count, previous: oldSeeds },
        })
      );
      log.debug('Seeds updated', { count, previous: oldSeeds });
    }
  }

  /**
   * Update achievement count.
   * Dispatches event for any listeners.
   */
  updateAchievements(count: number, newBadgeIds?: string[]): void {
    this.state.achievementCount = count;

    if (newBadgeIds) {
      newBadgeIds.forEach((id) => this.state.unseenAchievements.add(id));
    }

    if (newBadgeIds && newBadgeIds.length > 0) {
      window.dispatchEvent(
        new CustomEvent('ferni:achievement-earned', {
          detail: { count, newBadgeIds },
        })
      );
      log.debug('Achievements updated', { count, newBadgeIds });
    }
  }

  /**
   * Mark achievements as seen.
   */
  markAchievementsSeen(): void {
    this.state.unseenAchievements.clear();
  }

  /**
   * Set check-in pending state.
   * Dispatches event for unified indicator.
   */
  setCheckinPending(pending: boolean, message?: string): void {
    this.state.hasCheckin = pending;
    this.state.checkinMessage = message;

    if (pending) {
      window.dispatchEvent(
        new CustomEvent('ferni:checkin-available', {
          detail: { message },
        })
      );
    } else {
      window.dispatchEvent(new CustomEvent('ferni:checkin-dismissed'));
    }

    log.debug('Check-in state updated', { pending, message: message?.slice(0, 30) });
  }

  /**
   * Get current state.
   */
  getState(): BadgeState {
    return { ...this.state };
  }

  /**
   * Cleanup - no DOM to remove anymore.
   */
  destroy(): void {
    this.initialized = false;
    this.state = {
      streak: 0,
      seeds: 0,
      achievementCount: 0,
      unseenAchievements: new Set(),
      hasCheckin: false,
      checkinMessage: undefined,
    };
    log.debug('Badge data manager destroyed');
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: BadgeDisplay | null = null;

export function getBadgeDisplay(): BadgeDisplay {
  if (!instance) {
    instance = new BadgeDisplay();
  }
  return instance;
}

export function initBadgeDisplay(): void {
  getBadgeDisplay().initialize();
}

export function resetBadgeDisplay(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export const badges = {
  init: initBadgeDisplay,
  updateStreak: (count: number, animate?: boolean) => getBadgeDisplay().updateStreak(count, animate),
  updateSeeds: (count: number, animate?: boolean) => getBadgeDisplay().updateSeeds(count, animate),
  updateAchievements: (count: number, newBadgeIds?: string[]) =>
    getBadgeDisplay().updateAchievements(count, newBadgeIds),
  markSeen: () => getBadgeDisplay().markAchievementsSeen(),
  setCheckinPending: (pending: boolean, message?: string) =>
    getBadgeDisplay().setCheckinPending(pending, message),
  getState: () => getBadgeDisplay().getState(),
  destroy: resetBadgeDisplay,
};

export { BadgeDisplay };
