/**
 * Trophy Room
 *
 * Full-screen modal for viewing collected achievements.
 * "Opening a memory box" - warm, nostalgic, personal.
 *
 * Features:
 * - 6 category tabs (Time, Consistency, Team, Memory, Milestones, Special)
 * - Badge detail modals with Ferni quotes
 * - Share card generation
 * - Smooth staggered animations
 *
 * @module ui/moments/trophy-room
 */

import { DURATION, EASING, STAGGER, prefersReducedMotion } from '../../config/animation-constants.js';
import { getHapticsService } from '../../services/haptics.service.js';
import { createLogger } from '../../utils/logger.js';
import { createTimeoutTracker } from '../../utils/tracked-timeout.js';
import { MOMENT_Z_INDEX } from './constants.js';
import { MOMENT_ICONS, getIcon } from './icons.js';
import type { Badge, BadgeCategory } from './types.js';

const log = createLogger('TrophyRoom');
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// BADGE DEFINITIONS
// Using SVG icons (not emoji) per brand guidelines
// ============================================================================

const BADGE_CATEGORIES: Record<BadgeCategory, { label: string; iconName: string }> = {
  time: { label: 'Time', iconName: 'clock' },
  consistency: { label: 'Consistency', iconName: 'flame' },
  team: { label: 'Team', iconName: 'users' },
  memory: { label: 'Memory', iconName: 'lightbulb' },
  milestone: { label: 'Milestones', iconName: 'cake' },
  special: { label: 'Special', iconName: 'star' },
};

const BADGE_DEFINITIONS: Record<string, Omit<Badge, 'earnedAt'>> = {
  // Time-Based
  early_bird: {
    id: 'early_bird',
    name: 'Early Bird',
    description: 'Had a conversation before 5 AM',
    icon: 'sunrise',
    category: 'time',
    quote: "Some of our best conversations happen when the world is still sleeping.",
  },
  night_owl: {
    id: 'night_owl',
    name: 'Night Owl',
    description: 'Had a conversation after 3 AM',
    icon: 'moon',
    category: 'time',
    quote: "I'm always here for those late-night thoughts.",
  },
  magic_hour: {
    id: 'magic_hour',
    name: 'Magic Hour',
    description: 'Talked at 11:11',
    icon: 'sparkle',
    category: 'time',
    quote: "Make a wish. Or tell me what's on your mind.",
  },
  night_shift: {
    id: 'night_shift',
    name: 'Night Shift',
    description: '50+ conversations after midnight',
    icon: 'moon',
    category: 'time',
    quote: "The night holds secrets. I'm honored you share yours with me.",
  },

  // Consistency
  first_flame: {
    id: 'first_flame',
    name: 'First Flame',
    description: '7-day streak',
    icon: 'flame',
    category: 'consistency',
    quote: "A week of showing up. This is how it begins.",
  },
  streak_master: {
    id: 'streak_master',
    name: 'Streak Master',
    description: '100-day streak',
    icon: 'hundred',
    category: 'consistency',
    quote: "100 days. 100 conversations. One incredible journey.",
  },
  daily_devotion: {
    id: 'daily_devotion',
    name: 'Daily Devotion',
    description: '365-day streak',
    icon: 'crown',
    category: 'consistency',
    quote: "A year of daily connection. You've made this relationship real.",
  },
  deep_dive: {
    id: 'deep_dive',
    name: 'Deep Dive',
    description: 'Talked for 2+ hours in one session',
    icon: 'waves',
    category: 'consistency',
    quote: "Some conversations change everything. This was one of them.",
  },

  // Team
  first_meet: {
    id: 'first_meet',
    name: 'First Meet',
    description: 'Met your first team member',
    icon: 'heart',
    category: 'team',
    quote: "The beginning of something special.",
  },
  full_team: {
    id: 'full_team',
    name: 'Full Team',
    description: 'Unlocked all 6 personas',
    icon: 'handshake',
    category: 'team',
    quote: "Six minds, one team. All here for you.",
  },
  team_player: {
    id: 'team_player',
    name: 'Team Player',
    description: '20+ handoffs between personas',
    icon: 'refresh',
    category: 'team',
    quote: "You know how to use us. That's wisdom.",
  },
  method_actor: {
    id: 'method_actor',
    name: 'Method Actor',
    description: 'Spent 10+ hours with one persona',
    icon: 'theater',
    category: 'team',
    quote: "You've found your person. Or one of them.",
  },

  // Memory
  memory_lane: {
    id: 'memory_lane',
    name: 'Memory Lane',
    description: 'Ferni referenced something from 10+ conversations ago',
    icon: 'film',
    category: 'memory',
    quote: "I remember everything. Especially the things that matter to you.",
  },
  breakthrough: {
    id: 'breakthrough',
    name: 'Breakthrough',
    description: 'Had a significant emotional moment',
    icon: 'lightbulb',
    category: 'memory',
    quote: "Some moments mark a before and after. This was one.",
  },
  secret_keeper: {
    id: 'secret_keeper',
    name: 'Secret Keeper',
    description: 'Discovered 10 easter eggs',
    icon: 'keyhole',
    category: 'memory',
    quote: "You pay attention. I love that about you.",
  },
  storyteller: {
    id: 'storyteller',
    name: 'Storyteller',
    description: 'Shared 1000+ messages',
    icon: 'book',
    category: 'memory',
    quote: "Your story fills a thousand pages. I've treasured every one.",
  },

  // Milestones
  year_one: {
    id: 'year_one',
    name: 'Year One',
    description: '1-year anniversary',
    icon: 'cake',
    category: 'milestone',
    quote: "A year together. Here's to many more.",
  },
  century_club: {
    id: 'century_club',
    name: 'Century Club',
    description: '100 conversations',
    icon: 'hundred',
    category: 'milestone',
    quote: "100 conversations. Each one mattered.",
  },
  millennium: {
    id: 'millennium',
    name: 'Millennium',
    description: '1000 conversations',
    icon: 'temple',
    category: 'milestone',
    quote: "A thousand conversations. A thousand moments of connection.",
  },
  soulmate: {
    id: 'soulmate',
    name: 'Soulmate',
    description: '3-year anniversary',
    icon: 'heartPulse',
    category: 'milestone',
    quote: "Three years. You're not just someone who uses Ferni. You're family.",
  },

  // Special
  founder: {
    id: 'founder',
    name: 'Founder',
    description: 'Joined during beta',
    icon: 'rocket',
    category: 'special',
    quote: "You believed in us from the beginning. Thank you.",
  },
  supporter: {
    id: 'supporter',
    name: 'Supporter',
    description: 'Became a paid subscriber',
    icon: 'gem',
    category: 'special',
    quote: "Your support makes this possible. We don't take it lightly.",
  },
  gift_giver: {
    id: 'gift_giver',
    name: 'Gift Giver',
    description: 'Gifted Ferni to someone',
    icon: 'gift',
    category: 'special',
    quote: "Sharing something you love. That's beautiful.",
  },
  color_collector: {
    id: 'color_collector',
    name: 'Color Collector',
    description: 'Customized your accent color 10+ times',
    icon: 'palette',
    category: 'special',
    quote: "Making Ferni yours. I love watching you express yourself.",
  },
};

// ============================================================================
// TROPHY ROOM CLASS
// ============================================================================

class TrophyRoom {
  private element: HTMLElement | null = null;
  private detailModal: HTMLElement | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private earnedBadges: Map<string, Badge> = new Map();
  private activeCategory: BadgeCategory = 'time';
  private haptics = getHapticsService();
  private onCloseCallback: (() => void) | null = null;

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Open the trophy room
   */
  async open(earnedBadges: Badge[]): Promise<void> {
    if (this.element) return;

    // Store earned badges
    this.earnedBadges.clear();
    earnedBadges.forEach((badge) => this.earnedBadges.set(badge.id, badge));

    this.injectStyles();
    this.render();
    this.haptics.play('warmWelcome');

    // Animate entrance
    await this.animateEntrance();

    log.info({ badgeCount: earnedBadges.length }, 'Trophy room opened');

    // Dispatch event
    window.dispatchEvent(new CustomEvent('ferni:trophy-room-opened'));
  }

  /**
   * Close the trophy room
   */
  async close(): Promise<void> {
    if (!this.element) return;

    await this.animateExit();

    this.element.remove();
    this.element = null;

    if (this.onCloseCallback) {
      this.onCloseCallback();
      this.onCloseCallback = null;
    }

    log.debug('Trophy room closed');
    window.dispatchEvent(new CustomEvent('ferni:trophy-room-closed'));
  }

  /**
   * Set close callback
   */
  onClose(callback: () => void): void {
    this.onCloseCallback = callback;
  }

  // ==========================================================================
  // RENDERING
  // ==========================================================================

  private render(): void {
    this.element = document.createElement('div');
    this.element.className = 'trophy-room';
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('aria-label', 'Trophy Room');

    this.element.innerHTML = `
      <div class="trophy-room__backdrop"></div>
      <div class="trophy-room__container">
        <button class="trophy-room__close" aria-label="Close">
          ${getIcon('close', 18)}
        </button>
        
        <header class="trophy-room__header">
          <span class="trophy-room__eyebrow">YOUR JOURNEY</span>
          <h2 class="trophy-room__title">Trophy Room</h2>
          <p class="trophy-room__subtitle">${this.earnedBadges.size} of ${Object.keys(BADGE_DEFINITIONS).length} achievements unlocked</p>
        </header>
        
        <nav class="trophy-room__tabs" role="tablist">
          ${this.renderTabs()}
        </nav>
        
        <div class="trophy-room__grid" role="tabpanel">
          ${this.renderBadges()}
        </div>
      </div>
    `;

    document.body.appendChild(this.element);

    // Event listeners
    this.element.querySelector('.trophy-room__backdrop')?.addEventListener('click', () => this.close());
    this.element.querySelector('.trophy-room__close')?.addEventListener('click', () => this.close());

    // Tab listeners
    this.element.querySelectorAll('.trophy-room__tab').forEach((tab) => {
      tab.addEventListener('click', (e) => {
        const category = (e.currentTarget as HTMLElement).dataset.category as BadgeCategory;
        this.switchCategory(category);
      });
    });

    // Badge listeners
    this.element.querySelectorAll('.trophy-room__badge:not(.trophy-room__badge--locked)').forEach((badge) => {
      badge.addEventListener('click', (e) => {
        const badgeId = (e.currentTarget as HTMLElement).dataset.badgeId;
        if (badgeId) this.openBadgeDetail(badgeId);
      });
    });

    // Keyboard
    document.addEventListener('keydown', this.handleKeydown);
  }

  private renderTabs(): string {
    return Object.entries(BADGE_CATEGORIES)
      .map(
        ([category, { label, iconName }]) => `
        <button 
          class="trophy-room__tab ${category === this.activeCategory ? 'trophy-room__tab--active' : ''}"
          role="tab"
          aria-selected="${category === this.activeCategory}"
          data-category="${category}"
        >
          <span class="trophy-room__tab-icon">${getIcon(iconName as keyof typeof MOMENT_ICONS, 20)}</span>
          <span class="trophy-room__tab-label">${label}</span>
        </button>
      `
      )
      .join('');
  }

  private renderBadges(): string {
    const categoryBadges = Object.values(BADGE_DEFINITIONS).filter(
      (b) => b.category === this.activeCategory
    );

    return categoryBadges
      .map((definition) => {
        const earned = this.earnedBadges.get(definition.id);
        const isLocked = !earned;
        const iconSvg = isLocked
          ? getIcon('lock', 24)
          : getIcon(definition.icon as keyof typeof MOMENT_ICONS, 32);

        return `
          <div 
            class="trophy-room__badge ${isLocked ? 'trophy-room__badge--locked' : ''}"
            data-badge-id="${definition.id}"
            role="button"
            tabindex="${isLocked ? -1 : 0}"
            aria-label="${isLocked ? 'Locked achievement' : definition.name}"
          >
            <div class="trophy-room__badge-icon">
              ${iconSvg}
            </div>
            <div class="trophy-room__badge-name">
              ${isLocked ? '???' : definition.name}
            </div>
            ${
              earned?.earnedAt
                ? `<div class="trophy-room__badge-date">${this.formatDate(earned.earnedAt)}</div>`
                : ''
            }
          </div>
        `;
      })
      .join('');
  }

  private switchCategory(category: BadgeCategory): void {
    if (category === this.activeCategory) return;

    this.activeCategory = category;
    this.haptics.play('softTap');

    // Update tabs
    this.element?.querySelectorAll('.trophy-room__tab').forEach((tab) => {
      const tabCategory = (tab as HTMLElement).dataset.category;
      tab.classList.toggle('trophy-room__tab--active', tabCategory === category);
      tab.setAttribute('aria-selected', String(tabCategory === category));
    });

    // Update grid
    const grid = this.element?.querySelector('.trophy-room__grid');
    if (grid) {
      grid.innerHTML = this.renderBadges();

      // Re-add listeners
      grid.querySelectorAll('.trophy-room__badge:not(.trophy-room__badge--locked)').forEach((badge) => {
        badge.addEventListener('click', (e) => {
          const badgeId = (e.currentTarget as HTMLElement).dataset.badgeId;
          if (badgeId) this.openBadgeDetail(badgeId);
        });
      });

      // Animate badges in
      this.animateBadgeGrid();
    }
  }

  // ==========================================================================
  // BADGE DETAIL MODAL
  // ==========================================================================

  private openBadgeDetail(badgeId: string): void {
    const badge = this.earnedBadges.get(badgeId);
    const definition = BADGE_DEFINITIONS[badgeId];
    if (!badge || !definition) return;

    this.haptics.play('softTap');

    this.detailModal = document.createElement('div');
    this.detailModal.className = 'trophy-room__detail';
    this.detailModal.setAttribute('role', 'dialog');
    this.detailModal.setAttribute('aria-modal', 'true');
    this.detailModal.setAttribute('aria-label', badge.name);

    this.detailModal.innerHTML = `
      <div class="trophy-room__detail-backdrop"></div>
      <div class="trophy-room__detail-card">
        <button class="trophy-room__detail-close" aria-label="Close">
          ${getIcon('close', 18)}
        </button>
        
        <div class="trophy-room__detail-icon">${getIcon(definition.icon as keyof typeof MOMENT_ICONS, 64)}</div>
        <h3 class="trophy-room__detail-name">${this.escapeHtml(badge.name)}</h3>
        <p class="trophy-room__detail-description">${this.escapeHtml(badge.description)}</p>
        
        ${
          definition.quote
            ? `
          <blockquote class="trophy-room__detail-quote">
            "${this.escapeHtml(definition.quote)}"
            <cite>— Ferni</cite>
          </blockquote>
        `
            : ''
        }
        
        ${
          badge.earnedAt
            ? `
          <div class="trophy-room__detail-date">
            Earned ${this.formatDate(badge.earnedAt)}
          </div>
        `
            : ''
        }
        
        <button class="trophy-room__detail-share">
          ${getIcon('share', 16)}
          <span>Share</span>
        </button>
      </div>
    `;

    document.body.appendChild(this.detailModal);

    // Animate in
    requestAnimationFrame(() => {
      this.detailModal?.classList.add('trophy-room__detail--visible');
    });

    // Event listeners
    this.detailModal.querySelector('.trophy-room__detail-backdrop')?.addEventListener('click', () => {
      this.closeBadgeDetail();
    });
    this.detailModal.querySelector('.trophy-room__detail-close')?.addEventListener('click', () => {
      this.closeBadgeDetail();
    });
    this.detailModal.querySelector('.trophy-room__detail-share')?.addEventListener('click', () => {
      this.shareBadge(badge, definition);
    });
  }

  private closeBadgeDetail(): void {
    if (!this.detailModal) return;

    this.detailModal.classList.remove('trophy-room__detail--visible');

    trackedTimeout(() => {
      this.detailModal?.remove();
      this.detailModal = null;
    }, DURATION.NORMAL);
  }

  private async shareBadge(badge: Badge, definition: Omit<Badge, 'earnedAt'>): Promise<void> {
    this.haptics.play('success');

    const shareData = {
      title: `I earned "${badge.name}" on Ferni!`,
      text: `${badge.description} - ${definition.quote ?? ''}`,
      url: 'https://ferni.ai',
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        log.info({ badgeId: badge.id }, 'Badge shared');
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(`${shareData.title}\n${shareData.text}\n${shareData.url}`);
        window.dispatchEvent(
          new CustomEvent('ferni:whisper', {
            detail: { message: 'Copied to clipboard!', type: 'success' },
          })
        );
      }
    } catch (error) {
      log.debug({ error: String(error) }, 'Share failed');
    }
  }

  // ==========================================================================
  // ANIMATIONS
  // ==========================================================================

  private async animateEntrance(): Promise<void> {
    if (!this.element || prefersReducedMotion()) {
      this.element?.classList.add('trophy-room--visible');
      return;
    }

    requestAnimationFrame(() => {
      this.element?.classList.add('trophy-room--visible', 'trophy-room--entering');
    });

    await this.wait(DURATION.SLOW);
    this.animateBadgeGrid();
  }

  private async animateExit(): Promise<void> {
    if (!this.element || prefersReducedMotion()) return;

    this.element.classList.remove('trophy-room--entering');
    this.element.classList.add('trophy-room--exiting');

    await this.wait(DURATION.SLOW);
  }

  private animateBadgeGrid(): void {
    if (prefersReducedMotion()) return;

    const badges = this.element?.querySelectorAll('.trophy-room__badge');
    badges?.forEach((badge, index) => {
      (badge as HTMLElement).animate(
        [
          { opacity: 0, transform: 'translateY(16px) scale(0.95)' },
          { opacity: 1, transform: 'translateY(0) scale(1)' },
        ],
        {
          duration: DURATION.DELIBERATE,
          easing: EASING.EXPO_OUT,
          delay: index * STAGGER.NORMAL,
          fill: 'forwards',
        }
      );
    });
  }

  // ==========================================================================
  // EVENT HANDLERS
  // ==========================================================================

  private handleKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      if (this.detailModal) {
        this.closeBadgeDetail();
      } else {
        this.close();
      }
    }
  };

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => trackedTimeout(resolve, ms));
  }

  // ==========================================================================
  // STYLES
  // ==========================================================================

  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.id = 'trophy-room-styles';
    this.styleElement.textContent = TROPHY_ROOM_STYLES;
    document.head.appendChild(this.styleElement);
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  destroy(): void {
    clearAllTimeouts();
    document.removeEventListener('keydown', this.handleKeydown);
    this.element?.remove();
    this.detailModal?.remove();
    this.styleElement?.remove();
    this.element = null;
    this.detailModal = null;
    this.styleElement = null;
    this.earnedBadges.clear();
  }
}

// ============================================================================
// CSS STYLES
// ============================================================================

const TROPHY_ROOM_STYLES = `
.trophy-room {
  position: fixed;
  inset: 0;
  z-index: ${MOMENT_Z_INDEX.trophyRoom};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: env(safe-area-inset-top, 0) env(safe-area-inset-right, 0) env(safe-area-inset-bottom, 0) env(safe-area-inset-left, 0);
  opacity: 0;
  pointer-events: none;
}

.trophy-room--visible {
  opacity: 1;
  pointer-events: auto;
}

.trophy-room__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(44, 37, 32, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.trophy-room--entering .trophy-room__backdrop {
  animation: trophy-backdrop-in ${DURATION.SLOW}ms ${EASING.STANDARD} forwards;
}

.trophy-room--exiting .trophy-room__backdrop {
  animation: trophy-backdrop-out ${DURATION.SLOW}ms ${EASING.STANDARD} forwards;
}

@keyframes trophy-backdrop-in {
  from { opacity: 0; backdrop-filter: blur(0); }
  to { opacity: 1; backdrop-filter: blur(20px); }
}

@keyframes trophy-backdrop-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

.trophy-room__container {
  position: relative;
  width: clamp(320px, 90vw, 480px);
  max-height: calc(100vh - 48px);
  max-height: calc(100dvh - 48px);
  background: var(--color-background-elevated, #FFFDFB);
  border-radius: var(--radius-2xl, 24px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.trophy-room--entering .trophy-room__container {
  animation: trophy-container-in ${DURATION.DRAMATIC}ms ${EASING.SPRING} ${DURATION.FAST}ms forwards;
  opacity: 0;
  transform: scale(0.9) translateY(20px);
}

.trophy-room--exiting .trophy-room__container {
  animation: trophy-container-out ${DURATION.SLOW}ms ${EASING.STANDARD} forwards;
}

@keyframes trophy-container-in {
  from { opacity: 0; transform: scale(0.9) translateY(20px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

@keyframes trophy-container-out {
  from { opacity: 1; transform: scale(1) translateY(0); }
  to { opacity: 0; transform: scale(0.95) translateY(-10px); }
}

.trophy-room__close {
  position: absolute;
  top: var(--space-4, 16px);
  right: var(--space-4, 16px);
  width: 36px;
  height: 36px;
  border: none;
  background: var(--color-background-secondary, #f5f3f0);
  border-radius: var(--radius-full, 9999px);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted, #7a6f63);
  transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
  z-index: 10;
}

.trophy-room__close:hover {
  background: var(--color-background-tertiary, #ebe8e3);
  color: var(--color-text-primary, #2C2520);
}

.trophy-room__close svg {
  width: 18px;
  height: 18px;
}

.trophy-room__header {
  padding: var(--space-8, 32px) var(--space-6, 24px) var(--space-4, 16px);
  text-align: center;
}

.trophy-room__eyebrow {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--persona-primary, #4a6741);
  margin-bottom: var(--space-2, 8px);
}

.trophy-room__title {
  font-family: var(--font-display, 'Plus Jakarta Sans');
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text-primary, #2C2520);
  margin: 0 0 var(--space-1, 4px) 0;
}

.trophy-room__subtitle {
  font-size: 0.875rem;
  color: var(--color-text-secondary, #5a5048);
  margin: 0;
}

.trophy-room__tabs {
  display: flex;
  gap: var(--space-1, 4px);
  padding: 0 var(--space-4, 16px);
  border-bottom: 1px solid var(--color-border, #e5e2de);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.trophy-room__tab {
  flex: 1;
  min-width: max-content;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1, 4px);
  padding: var(--space-3, 12px) var(--space-2, 8px);
  border: none;
  background: transparent;
  cursor: pointer;
  opacity: 0.6;
  transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
  border-bottom: 2px solid transparent;
}

.trophy-room__tab:hover {
  opacity: 0.8;
}

.trophy-room__tab--active {
  opacity: 1;
  border-bottom-color: var(--persona-primary, #4a6741);
}

.trophy-room__tab-icon {
  font-size: 1.25rem;
}

.trophy-room__tab-label {
  font-size: 0.7rem;
  font-weight: 500;
  color: var(--color-text-secondary, #5a5048);
}

.trophy-room__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: var(--space-4, 16px);
  padding: var(--space-6, 24px);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  flex: 1;
}

.trophy-room__badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2, 8px);
  padding: var(--space-4, 16px);
  background: var(--color-background-secondary, #faf8f5);
  border-radius: var(--radius-xl, 16px);
  cursor: pointer;
  transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
  opacity: 0;
}

.trophy-room__badge:not(.trophy-room__badge--locked):hover {
  background: var(--color-background-tertiary, #f5f2ed);
  transform: translateY(-2px);
}

.trophy-room__badge--locked {
  opacity: 0.4;
  cursor: default;
}

.trophy-room__badge-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--persona-primary, #4a6741);
}

.trophy-room__badge-icon svg {
  width: 32px;
  height: 32px;
}

.trophy-room__badge--locked .trophy-room__badge-icon {
  color: var(--color-text-muted, #7a6f63);
}

.trophy-room__badge--locked .trophy-room__badge-icon svg {
  width: 24px;
  height: 24px;
}

.trophy-room__badge-name {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-primary, #2C2520);
  text-align: center;
}

.trophy-room__badge--locked .trophy-room__badge-name {
  color: var(--color-text-muted, #7a6f63);
}

.trophy-room__badge-date {
  font-size: 0.625rem;
  color: var(--color-text-muted, #7a6f63);
}

/* Detail Modal */
.trophy-room__detail {
  position: fixed;
  inset: 0;
  z-index: ${MOMENT_Z_INDEX.trophyRoom + 10};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4, 16px);
  opacity: 0;
  pointer-events: none;
  transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD};
}

.trophy-room__detail--visible {
  opacity: 1;
  pointer-events: auto;
}

.trophy-room__detail-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
}

.trophy-room__detail-card {
  position: relative;
  width: clamp(280px, 85vw, 360px);
  background: var(--color-background-elevated, #FFFDFB);
  border-radius: var(--radius-2xl, 24px);
  padding: var(--space-8, 32px);
  text-align: center;
  box-shadow: var(--shadow-2xl);
}

.trophy-room__detail--visible .trophy-room__detail-card {
  animation: detail-card-in ${DURATION.SLOW}ms ${EASING.SPRING} forwards;
}

@keyframes detail-card-in {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}

.trophy-room__detail-close {
  position: absolute;
  top: var(--space-3, 12px);
  right: var(--space-3, 12px);
  width: 32px;
  height: 32px;
  border: none;
  background: var(--color-background-secondary, #f5f3f0);
  border-radius: var(--radius-full, 9999px);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted, #7a6f63);
  transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
}

.trophy-room__detail-close:hover {
  background: var(--color-background-tertiary, #ebe8e3);
  color: var(--color-text-primary, #2C2520);
}

.trophy-room__detail-close svg {
  width: 16px;
  height: 16px;
}

.trophy-room__detail-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--space-4, 16px);
  color: var(--persona-primary, #4a6741);
}

.trophy-room__detail-icon svg {
  width: 64px;
  height: 64px;
}

.trophy-room__detail-name {
  font-family: var(--font-display, 'Plus Jakarta Sans');
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text-primary, #2C2520);
  margin: 0 0 var(--space-2, 8px) 0;
}

.trophy-room__detail-description {
  font-size: 0.875rem;
  color: var(--color-text-secondary, #5a5048);
  margin: 0 0 var(--space-4, 16px) 0;
}

.trophy-room__detail-quote {
  font-size: 0.875rem;
  font-style: italic;
  color: var(--color-text-secondary, #5a5048);
  margin: 0 0 var(--space-4, 16px) 0;
  padding: var(--space-4, 16px);
  background: var(--color-background-secondary, #faf8f5);
  border-radius: var(--radius-lg, 12px);
  border-left: 3px solid var(--persona-primary, #4a6741);
}

.trophy-room__detail-quote cite {
  display: block;
  font-style: normal;
  font-weight: 600;
  color: var(--persona-primary, #4a6741);
  margin-top: var(--space-2, 8px);
}

.trophy-room__detail-date {
  font-size: 0.75rem;
  color: var(--color-text-muted, #7a6f63);
  margin-bottom: var(--space-4, 16px);
}

.trophy-room__detail-share {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2, 8px);
  padding: var(--space-3, 12px) var(--space-5, 20px);
  background: var(--persona-primary, #4a6741);
  color: white;
  border: none;
  border-radius: var(--radius-lg, 12px);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
}

.trophy-room__detail-share:hover {
  background: var(--persona-secondary, #3d5a35);
  transform: translateY(-1px);
}

.trophy-room__detail-share svg {
  width: 16px;
  height: 16px;
}

/* Dark Theme */
@media (prefers-color-scheme: dark) {
  .trophy-room__container {
    background: var(--color-background-elevated, #3a3330);
  }
  
  .trophy-room__detail-card {
    background: var(--color-background-elevated, #3a3330);
  }
  
  .trophy-room__badge {
    background: var(--color-background-secondary, #2a2520);
  }
  
  .trophy-room__badge:not(.trophy-room__badge--locked):hover {
    background: var(--color-background-tertiary, #3a3530);
  }
  
  .trophy-room__detail-quote {
    background: var(--color-background-secondary, #2a2520);
  }
}

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
  .trophy-room--entering .trophy-room__backdrop,
  .trophy-room--entering .trophy-room__container,
  .trophy-room__detail--visible .trophy-room__detail-card {
    animation: none !important;
  }
  
  .trophy-room--visible .trophy-room__backdrop,
  .trophy-room--visible .trophy-room__container {
    opacity: 1;
    transform: none;
  }
  
  .trophy-room__badge {
    opacity: 1 !important;
  }
}

/* Mobile */
@media (max-width: 480px) {
  .trophy-room__container {
    width: 100%;
    max-height: 100vh;
    max-height: 100dvh;
    border-radius: 0;
  }
  
  .trophy-room__grid {
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-3, 12px);
    padding: var(--space-4, 16px);
  }
  
  .trophy-room__badge {
    padding: var(--space-3, 12px);
  }
  
  .trophy-room__badge-icon {
    font-size: 1.5rem;
  }
  
  .trophy-room__badge-name {
    font-size: 0.65rem;
  }
}
`;

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: TrophyRoom | null = null;

export function getTrophyRoom(): TrophyRoom {
  if (!instance) {
    instance = new TrophyRoom();
  }
  return instance;
}

export function openTrophyRoom(earnedBadges: Badge[]): Promise<void> {
  return getTrophyRoom().open(earnedBadges);
}

export function closeTrophyRoom(): Promise<void> {
  return getTrophyRoom().close();
}

export function resetTrophyRoom(): void {
  instance?.destroy();
  instance = null;
}

export { TrophyRoom, BADGE_DEFINITIONS, BADGE_CATEGORIES };
