/**
 * Badge Display System
 *
 * Persistent badges displayed near the avatar showing:
 * - Streak (🔥) - Daily conversation streak
 * - Seeds (🌱) - Currency balance
 * - Achievements (🏆) - Badge collection count
 * - Check-in (💚) - Proactive check-in indicator
 *
 * @module ui/moments/badges
 */

import { DURATION, EASING, prefersReducedMotion } from '../../config/animation-constants.js';
import { getHapticsService } from '../../services/haptics.service.js';
import { createLogger } from '../../utils/logger.js';
import { createTimeoutTracker } from '../../utils/tracked-timeout.js';
import { BADGE_ANIMATION } from './constants.js';
import type { BadgeState } from './types.js';

const log = createLogger('BadgeDisplay');
const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// ICONS (SVG)
// ============================================================================

const BADGE_ICONS = {
  flame: `<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 23c-3.866 0-7-3.134-7-7 0-2.31 1.065-4.385 2.742-5.742.33-.27.742-.41 1.158-.41.54 0 1.048.237 1.396.65.19.226.316.488.378.769.082.37.326.68.654.85.328.17.713.18 1.05.027a1.5 1.5 0 0 0 .728-.926c.19-.608.51-1.168.955-1.643C15.347 7.288 17 4.995 17 2c0-.414.168-.812.464-1.103S18.086.5 18.5.5c.828 0 1.5.672 1.5 1.5 0 3.584-1.342 6.852-3.565 9.344A6.97 6.97 0 0 1 19 16c0 3.866-3.134 7-7 7z"/></svg>`,
  seed: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M12 22c4-4 8-7.582 8-12a8 8 0 1 0-16 0c0 4.418 4 8 8 12z"/><path d="M12 10V2"/></svg>`,
  trophy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
};

// ============================================================================
// BADGE DISPLAY CLASS
// ============================================================================

class BadgeDisplay {
  private container: HTMLElement | null = null;
  private avatarContainer: HTMLElement | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private haptics = getHapticsService();
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
   * Initialize the badge display system.
   * Call this after the avatar is mounted.
   */
  initialize(): void {
    if (this.initialized) return;

    // Clean up orphaned elements
    document.querySelectorAll('.moments-badges').forEach((el) => el.remove());
    document.querySelectorAll('.moments-checkin-badge').forEach((el) => el.remove());

    this.injectStyles();

    // Wait for avatar container
    this.findAvatarContainer();

    this.initialized = true;
    log.debug('BadgeDisplay initialized');
  }

  private findAvatarContainer(): void {
    this.avatarContainer = document.querySelector('.avatar-container');

    if (!this.avatarContainer) {
      // Retry after a short delay
      trackedTimeout(() => {
        this.avatarContainer = document.querySelector('.avatar-container');
        if (this.avatarContainer) {
          this.createBadgeContainer();
          this.render();
        } else {
          log.warn('Avatar container not found for badge display');
        }
      }, 1000);
      return;
    }

    this.createBadgeContainer();
    this.render();
  }

  private createBadgeContainer(): void {
    if (!this.avatarContainer) return;

    this.container = document.createElement('div');
    this.container.className = 'moments-badges';
    this.avatarContainer.style.position = 'relative';
    this.avatarContainer.appendChild(this.container);
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Update streak count
   */
  updateStreak(count: number, animate = true): void {
    const oldStreak = this.state.streak;
    this.state.streak = count;
    this.render();

    if (animate && count > oldStreak && count > 0) {
      this.animateStreakIncrement();
    }
  }

  /**
   * Update seeds balance
   */
  updateSeeds(count: number, animate = true): void {
    const oldSeeds = this.state.seeds;
    this.state.seeds = count;
    this.render();

    if (animate && count > oldSeeds) {
      this.animateSeedsEarned(count - oldSeeds);
    }
  }

  /**
   * Update achievement count
   */
  updateAchievements(count: number, newBadgeIds?: string[]): void {
    this.state.achievementCount = count;

    if (newBadgeIds) {
      newBadgeIds.forEach((id) => this.state.unseenAchievements.add(id));
    }

    this.render();

    if (newBadgeIds && newBadgeIds.length > 0) {
      this.animateNewAchievement();
    }
  }

  /**
   * Mark achievements as seen
   */
  markAchievementsSeen(): void {
    this.state.unseenAchievements.clear();
    this.render();
  }

  /**
   * Set check-in pending state
   */
  setCheckinPending(pending: boolean, message?: string): void {
    this.state.hasCheckin = pending;
    this.state.checkinMessage = message;
    this.renderCheckinBadge();
  }

  /**
   * Get current state
   */
  getState(): BadgeState {
    return { ...this.state };
  }

  // ==========================================================================
  // RENDERING
  // ==========================================================================

  private render(): void {
    if (!this.container) return;

    // Only show badges with values > 0
    const badges: string[] = [];

    if (this.state.streak > 0) {
      badges.push(this.renderStreakBadge());
    }

    if (this.state.seeds > 0) {
      badges.push(this.renderSeedsBadge());
    }

    if (this.state.achievementCount > 0) {
      badges.push(this.renderAchievementsBadge());
    }

    this.container.innerHTML = badges.join('');

    // Add event listeners
    this.container.querySelector('.moments-badge--streak')?.addEventListener('click', () => {
      this.onStreakClick();
    });

    this.container.querySelector('.moments-badge--seeds')?.addEventListener('click', () => {
      this.onSeedsClick();
    });

    this.container.querySelector('.moments-badge--achievements')?.addEventListener('click', () => {
      this.onAchievementsClick();
    });
  }

  private renderStreakBadge(): string {
    return `
      <div class="moments-badge moments-badge--streak" 
           title="${this.state.streak} day streak" 
           role="button" 
           tabindex="0"
           aria-label="${this.state.streak} day streak">
        <span class="moments-badge__icon">${BADGE_ICONS.flame}</span>
        <span class="moments-badge__count">${this.state.streak}</span>
      </div>
    `;
  }

  private renderSeedsBadge(): string {
    return `
      <div class="moments-badge moments-badge--seeds" 
           title="${this.state.seeds} seeds" 
           role="button" 
           tabindex="0"
           aria-label="${this.state.seeds} seeds">
        <span class="moments-badge__icon">${BADGE_ICONS.seed}</span>
        <span class="moments-badge__count">${this.formatCount(this.state.seeds)}</span>
      </div>
    `;
  }

  private renderAchievementsBadge(): string {
    const hasNew = this.state.unseenAchievements.size > 0;
    return `
      <div class="moments-badge moments-badge--achievements ${hasNew ? 'moments-badge--new' : ''}" 
           title="${this.state.achievementCount} achievements" 
           role="button" 
           tabindex="0"
           aria-label="${this.state.achievementCount} achievements${hasNew ? ', new achievements available' : ''}">
        <span class="moments-badge__icon">${BADGE_ICONS.trophy}</span>
        <span class="moments-badge__count">${this.state.achievementCount}</span>
      </div>
    `;
  }

  private renderCheckinBadge(): void {
    // Remove existing check-in badge
    document.querySelectorAll('.moments-checkin-badge').forEach((el) => el.remove());

    if (!this.state.hasCheckin || !this.avatarContainer) return;

    const badge = document.createElement('div');
    badge.className = 'moments-checkin-badge';
    badge.setAttribute('role', 'button');
    badge.setAttribute('tabindex', '0');
    badge.setAttribute('aria-label', 'Ferni wants to check in');
    badge.innerHTML = BADGE_ICONS.heart;

    // Position at top-right of avatar
    Object.assign(badge.style, {
      position: 'absolute',
      top: '-4px',
      right: '-4px',
      width: '28px',
      height: '28px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, var(--persona-primary, #4a6741), var(--persona-secondary, #3d5a35))',
      borderRadius: 'var(--radius-full, 9999px)',
      border: '2px solid var(--color-background-primary, #0a0a0a)',
      color: 'white',
      cursor: 'pointer',
      zIndex: '20',
      animation: 'checkin-pulse 3s ease-in-out infinite',
    });

    badge.addEventListener('click', () => this.onCheckinClick());

    this.avatarContainer.appendChild(badge);

    // Animate in
    if (!prefersReducedMotion()) {
      badge.animate(
        [
          { transform: 'scale(0.5)', opacity: 0 },
          { transform: 'scale(1)', opacity: 1 },
        ],
        {
          duration: DURATION.NORMAL,
          easing: EASING.SPRING,
        }
      );
    }
  }

  // ==========================================================================
  // ANIMATIONS
  // ==========================================================================

  private animateStreakIncrement(): void {
    const streakBadge = this.container?.querySelector('.moments-badge--streak');
    if (!streakBadge || prefersReducedMotion()) return;

    this.haptics.play('success');

    streakBadge.animate(BADGE_ANIMATION.badgeUnlock.keyframes as Keyframe[], {
      duration: BADGE_ANIMATION.badgeUnlock.options.duration,
      easing: BADGE_ANIMATION.badgeUnlock.options.easing,
    });
  }

  private animateSeedsEarned(amount: number): void {
    const seedsBadge = this.container?.querySelector('.moments-badge--seeds');
    if (!seedsBadge || prefersReducedMotion()) return;

    this.haptics.play('sparkle');

    seedsBadge.animate(BADGE_ANIMATION.seedGrow.keyframes as Keyframe[], {
      duration: BADGE_ANIMATION.seedGrow.options.duration,
      easing: BADGE_ANIMATION.seedGrow.options.easing,
    });

    log.debug({ amount }, 'Seeds animation played');
  }

  private animateNewAchievement(): void {
    const achievementsBadge = this.container?.querySelector('.moments-badge--achievements');
    if (!achievementsBadge || prefersReducedMotion()) return;

    this.haptics.play('success');

    achievementsBadge.animate(BADGE_ANIMATION.badgeUnlock.keyframes as Keyframe[], {
      duration: BADGE_ANIMATION.badgeUnlock.options.duration,
      easing: BADGE_ANIMATION.badgeUnlock.options.easing,
    });
  }

  // ==========================================================================
  // CLICK HANDLERS
  // ==========================================================================

  private onStreakClick(): void {
    // Show streak details via whisper
    window.dispatchEvent(
      new CustomEvent('ferni:show-streak-details', {
        detail: { streak: this.state.streak },
      })
    );
    this.haptics.play('softTap');
  }

  private onSeedsClick(): void {
    // Show seeds details
    window.dispatchEvent(
      new CustomEvent('ferni:show-seeds-details', {
        detail: { seeds: this.state.seeds },
      })
    );
    this.haptics.play('softTap');
  }

  private onAchievementsClick(): void {
    // Open trophy room
    window.dispatchEvent(new CustomEvent('ferni:open-trophy-room'));
    this.haptics.play('softTap');
  }

  private onCheckinClick(): void {
    // Acknowledge check-in
    window.dispatchEvent(
      new CustomEvent('ferni:checkin-acknowledged', {
        detail: { message: this.state.checkinMessage },
      })
    );
    this.setCheckinPending(false);
    this.haptics.play('warmWelcome');
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private formatCount(count: number): string {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}k`;
    }
    return String(count);
  }

  // ==========================================================================
  // STYLES
  // ==========================================================================

  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.id = 'moments-badges-styles';
    this.styleElement.textContent = `
      /* Badges are included in main moments styles */
      /* This is for any badge-specific overrides */
      
      @keyframes checkin-pulse {
        0%, 100% {
          box-shadow: 0 2px 8px rgba(74, 103, 65, 0.3), 0 0 0 1px rgba(74, 103, 65, 0.2);
        }
        50% {
          box-shadow: 0 2px 12px rgba(74, 103, 65, 0.5), 0 0 0 4px rgba(74, 103, 65, 0.1);
        }
      }
      
      .moments-checkin-badge:hover {
        transform: scale(1.1);
      }
      
      .moments-checkin-badge:focus-visible {
        outline: 2px solid var(--persona-primary, #4a6741);
        outline-offset: 2px;
      }
      
      @media (prefers-reduced-motion: reduce) {
        .moments-checkin-badge {
          animation: none !important;
        }
      }
    `;
    document.head.appendChild(this.styleElement);
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  /**
   * Clean up all resources
   */
  destroy(): void {
    clearAllTimeouts();
    this.container?.remove();
    this.styleElement?.remove();
    document.querySelectorAll('.moments-checkin-badge').forEach((el) => el.remove());
    this.container = null;
    this.avatarContainer = null;
    this.styleElement = null;
    this.initialized = false;
    log.debug('BadgeDisplay destroyed');
  }
}

// ============================================================================
// SINGLETON EXPORT
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
  instance?.destroy();
  instance = null;
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
  setCheckin: (pending: boolean, message?: string) =>
    getBadgeDisplay().setCheckinPending(pending, message),
  getState: () => getBadgeDisplay().getState(),
  destroy: resetBadgeDisplay,
};

export { BadgeDisplay };
