/**
 * Engagement UI Component
 *
 * Displays daily ritual streaks, emotional weather, and engagement status.
 * Brand-aligned: warm, organic, zen aesthetic. No emojis.
 *
 * Design System Compliance:
 * - Uses CSS variables from tokens.css
 * - Uses DURATION/EASING from animation-constants.ts
 * - Respects prefers-reduced-motion
 * - Japanese zen aesthetic (MA spacing, organic shapes)
 */

import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';

// ============================================================================
// TYPES
// ============================================================================

export interface RitualStreakData {
  ritualId: string;
  ritualName: string;
  personaId: string;
  currentStreak: number;
  longestStreak: number;
  lastCompletedAt: string | null;
  dueToday: boolean;
}

export interface EmotionalWeatherData {
  primary: 'sunny' | 'partly-cloudy' | 'cloudy' | 'rainy' | 'stormy' | 'foggy' | 'rainbow';
  energy: 'high' | 'medium' | 'low';
  note?: string;
  recordedAt: string;
}

export interface EngagementStats {
  totalRitualDays: number;
  longestOverallStreak: number;
  currentActiveStreaks: number;
  predictionAccuracy?: number;
  teamHuddlesAttended: number;
}

export interface EngagementData {
  ritualStreaks: RitualStreakData[];
  weatherHistory: EmotionalWeatherData[];
  stats: EngagementStats;
  lastEngagementAt: string | null;
}

// ============================================================================
// WEATHER ICONS (SVG-based, no emojis)
// ============================================================================

const WEATHER_ICONS: Record<EmotionalWeatherData['primary'], string> = {
  sunny: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>`,
  'partly-cloudy': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 3v1m-4.25 2.75l-.7.7m11.95-3.45l-.7.7M5 10a3 3 0 1 1 4.83-2.37"/>
    <path d="M18 10a4 4 0 0 0-7.87-.9A5 5 0 1 0 6 18h12a4 4 0 0 0 0-8z"/>
  </svg>`,
  cloudy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 10a4 4 0 0 0-7.87-.9A5 5 0 1 0 6 18h12a4 4 0 0 0 0-8z"/>
  </svg>`,
  rainy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M16 13V21"/>
    <path d="M8 13V21"/>
    <path d="M12 15V23"/>
    <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/>
  </svg>`,
  stormy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/>
    <polyline points="13 11 9 17 15 17 11 23"/>
  </svg>`,
  foggy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/>
    <line x1="8" y1="19" x2="8" y2="19.01"/>
    <line x1="8" y1="23" x2="8" y2="23.01"/>
    <line x1="12" y1="21" x2="12" y2="21.01"/>
    <line x1="16" y1="19" x2="16" y2="19.01"/>
    <line x1="16" y1="23" x2="16" y2="23.01"/>
  </svg>`,
  rainbow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M22 17a10 10 0 0 0-20 0"/>
    <path d="M6 17a6 6 0 0 1 12 0"/>
    <path d="M10 17a2 2 0 0 1 4 0"/>
  </svg>`,
};

const WEATHER_LABELS: Record<EmotionalWeatherData['primary'], string> = {
  sunny: 'Clear skies',
  'partly-cloudy': 'Mixed weather',
  cloudy: 'Overcast',
  rainy: 'Heavy weather',
  stormy: 'Turbulent',
  foggy: 'Uncertain',
  rainbow: 'Breakthrough',
};

// ============================================================================
// ENGAGEMENT UI CLASS
// ============================================================================

export class EngagementUI {
  private container: HTMLElement | null = null;
  private panelVisible: boolean = false;

  /**
   * Initialize the engagement UI
   */
  initialize(): void {
    this.createStyles();
    this.createPanel();
  }

  /**
   * Create the engagement panel container
   */
  private createPanel(): void {
    // Create container
    this.container = document.createElement('div');
    this.container.id = 'engagement-panel';
    this.container.className = 'engagement-panel';
    this.container.setAttribute('role', 'complementary');
    this.container.setAttribute('aria-label', 'Daily engagement panel');
    this.container.setAttribute('aria-hidden', 'true');

    // Create panel content wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'engagement-panel__wrapper';

    // Header
    const header = document.createElement('header');
    header.className = 'engagement-panel__header';
    header.innerHTML = `
      <h2 class="engagement-panel__title">Daily Practice</h2>
      <button class="engagement-panel__close" aria-label="Close panel">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;

    // Content area
    const content = document.createElement('div');
    content.className = 'engagement-panel__content';
    content.id = 'engagement-content';

    // Empty state
    content.innerHTML = this.renderEmptyState();

    wrapper.appendChild(header);
    wrapper.appendChild(content);
    this.container.appendChild(wrapper);
    document.body.appendChild(this.container);

    // Bind close button
    const closeBtn = header.querySelector('.engagement-panel__close');
    closeBtn?.addEventListener('click', () => this.hide());
  }

  /**
   * Render empty state
   */
  private renderEmptyState(): string {
    return `
      <div class="engagement-empty">
        <div class="engagement-empty__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
        </div>
        <p class="engagement-empty__text">Begin a conversation to start your daily practice</p>
      </div>
    `;
  }

  /**
   * Update the panel with engagement data
   */
  update(data: EngagementData): void {
    if (!this.container) return;

    const content = this.container.querySelector('#engagement-content');
    if (!content) return;

    const sections: string[] = [];

    // Weather section (if recent)
    const latestWeather = data.weatherHistory[0];
    if (latestWeather) {
      sections.push(this.renderWeatherSection(latestWeather));
    }

    // Active streaks
    if (data.ritualStreaks.length > 0) {
      sections.push(this.renderStreaksSection(data.ritualStreaks));
    }

    // Stats
    sections.push(this.renderStatsSection(data.stats));

    content.innerHTML = sections.join('');

    // Add entrance animations
    if (!prefersReducedMotion()) {
      const cards = content.querySelectorAll('.engagement-card');
      cards.forEach((card, index) => {
        (card as HTMLElement).style.animationDelay = `${index * 80}ms`;
      });
    }
  }

  /**
   * Render weather section
   */
  private renderWeatherSection(weather: EmotionalWeatherData): string {
    const icon = WEATHER_ICONS[weather.primary];
    const label = WEATHER_LABELS[weather.primary];
    const energyClass = `energy-${weather.energy}`;

    return `
      <section class="engagement-card engagement-card--weather ${energyClass}">
        <div class="engagement-card__header">
          <span class="engagement-card__label">Today's weather</span>
        </div>
        <div class="engagement-weather">
          <div class="engagement-weather__icon" aria-hidden="true">
            ${icon}
          </div>
          <div class="engagement-weather__info">
            <span class="engagement-weather__label">${label}</span>
            <span class="engagement-weather__energy">${this.formatEnergy(weather.energy)} energy</span>
          </div>
        </div>
        ${weather.note ? `<p class="engagement-weather__note">${this.escapeHtml(weather.note)}</p>` : ''}
      </section>
    `;
  }

  /**
   * Render streaks section
   */
  private renderStreaksSection(streaks: RitualStreakData[]): string {
    const activeStreaks = streaks.filter((s) => s.currentStreak > 0);
    const dueStreaks = streaks.filter((s) => s.dueToday);

    const streakItems = activeStreaks
      .sort((a, b) => b.currentStreak - a.currentStreak)
      .slice(0, 4)
      .map((streak) => this.renderStreakItem(streak))
      .join('');

    return `
      <section class="engagement-card engagement-card--streaks">
        <div class="engagement-card__header">
          <span class="engagement-card__label">Active streaks</span>
          ${dueStreaks.length > 0 ? `<span class="engagement-badge">${dueStreaks.length} due</span>` : ''}
        </div>
        <div class="engagement-streaks">
          ${activeStreaks.length > 0 ? streakItems : '<p class="engagement-streaks__empty">No active streaks yet</p>'}
        </div>
      </section>
    `;
  }

  /**
   * Render individual streak item
   */
  private renderStreakItem(streak: RitualStreakData): string {
    const isRecord = streak.currentStreak >= streak.longestStreak && streak.currentStreak > 1;
    const personaColor = this.getPersonaColorClass(streak.personaId);

    return `
      <div class="engagement-streak ${personaColor} ${streak.dueToday ? 'engagement-streak--due' : ''}">
        <div class="engagement-streak__info">
          <span class="engagement-streak__name">${this.escapeHtml(streak.ritualName)}</span>
          <span class="engagement-streak__count">
            ${streak.currentStreak} ${streak.currentStreak === 1 ? 'day' : 'days'}
            ${isRecord ? '<span class="engagement-streak__record">Personal best</span>' : ''}
          </span>
        </div>
        <div class="engagement-streak__progress">
          ${this.renderStreakDots(streak.currentStreak, streak.longestStreak)}
        </div>
      </div>
    `;
  }

  /**
   * Render streak progress dots
   */
  private renderStreakDots(current: number, _longest: number): string {
    const displayCount = Math.min(current, 7);
    const dots = Array(displayCount)
      .fill(0)
      .map((_, i) => `<span class="engagement-streak__dot engagement-streak__dot--filled" style="animation-delay: ${i * 50}ms"></span>`)
      .join('');

    const remaining = 7 - displayCount;
    const emptyDots = Array(remaining > 0 ? remaining : 0)
      .fill(0)
      .map(() => '<span class="engagement-streak__dot"></span>')
      .join('');

    return dots + emptyDots + (current > 7 ? '<span class="engagement-streak__more">+</span>' : '');
  }

  /**
   * Render stats section
   */
  private renderStatsSection(stats: EngagementStats): string {
    return `
      <section class="engagement-card engagement-card--stats">
        <div class="engagement-card__header">
          <span class="engagement-card__label">Your journey</span>
        </div>
        <div class="engagement-stats">
          <div class="engagement-stat">
            <span class="engagement-stat__value">${stats.totalRitualDays}</span>
            <span class="engagement-stat__label">ritual days</span>
          </div>
          <div class="engagement-stat">
            <span class="engagement-stat__value">${stats.longestOverallStreak}</span>
            <span class="engagement-stat__label">longest streak</span>
          </div>
          ${stats.predictionAccuracy !== undefined ? `
          <div class="engagement-stat">
            <span class="engagement-stat__value">${stats.predictionAccuracy}%</span>
            <span class="engagement-stat__label">prediction accuracy</span>
          </div>
          ` : ''}
          <div class="engagement-stat">
            <span class="engagement-stat__value">${stats.teamHuddlesAttended}</span>
            <span class="engagement-stat__label">team huddles</span>
          </div>
        </div>
      </section>
    `;
  }

  /**
   * Show the panel
   */
  show(): void {
    if (!this.container) return;

    this.panelVisible = true;
    this.container.classList.add('engagement-panel--visible');
    this.container.setAttribute('aria-hidden', 'false');

    // Animate in
    if (!prefersReducedMotion()) {
      this.container.animate(
        [
          { transform: 'translateX(100%)', opacity: 0 },
          { transform: 'translateX(0)', opacity: 1 },
        ],
        {
          duration: DURATION.MODERATE,
          easing: EASING.EXPO_OUT,
          fill: 'forwards',
        }
      );
    }
  }

  /**
   * Hide the panel
   */
  hide(): void {
    if (!this.container) return;

    this.panelVisible = false;
    this.container.setAttribute('aria-hidden', 'true');

    // Animate out
    const animation = this.container.animate(
      [
        { transform: 'translateX(0)', opacity: 1 },
        { transform: 'translateX(100%)', opacity: 0 },
      ],
      {
        duration: DURATION.SLOW,
        easing: EASING.STANDARD,
        fill: 'forwards',
      }
    );

    animation.onfinish = () => {
      this.container?.classList.remove('engagement-panel--visible');
    };
  }

  /**
   * Toggle panel visibility
   */
  toggle(): void {
    if (this.panelVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Get persona color class
   */
  private getPersonaColorClass(personaId: string): string {
    const colorMap: Record<string, string> = {
      ferni: 'persona-ferni',
      'alex-chen': 'persona-alex',
      'maya-santos': 'persona-maya',
      'jordan-taylor': 'persona-jordan',
      'nayan-patel': 'persona-nayan',
      'peter-john': 'persona-peter',
    };
    return colorMap[personaId] || 'persona-ferni';
  }

  /**
   * Format energy level
   */
  private formatEnergy(energy: EmotionalWeatherData['energy']): string {
    const labels: Record<EmotionalWeatherData['energy'], string> = {
      high: 'High',
      medium: 'Moderate',
      low: 'Low',
    };
    return labels[energy];
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Create styles
   */
  private createStyles(): void {
    const styleId = 'engagement-ui-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* ========================================
         ENGAGEMENT PANEL
         Zen-inspired, brand-aligned design
         ======================================== */

      .engagement-panel {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: 340px;
        max-width: 90vw;
        z-index: var(--z-overlay, 1300);
        pointer-events: none;
        opacity: 0;
        transform: translateX(100%);
      }

      .engagement-panel--visible {
        pointer-events: auto;
        opacity: 1;
        transform: translateX(0);
      }

      .engagement-panel__wrapper {
        height: 100%;
        display: flex;
        flex-direction: column;
        background: var(--color-background-elevated, #fffdfb);
        border-left: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
        box-shadow: var(--shadow-xl, 0 16px 32px rgba(44, 37, 32, 0.1));
      }

      /* Header */
      .engagement-panel__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--ma-rest, 21px) var(--ma-silence, 34px);
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .engagement-panel__title {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-lg, 1.0625rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
        letter-spacing: var(--tracking-tight, -0.015em);
        margin: 0;
      }

      .engagement-panel__close {
        display: flex;
        align-items: center;
        justify-content: center;
        /* Golden ratio: 34px button / 1.618 ≈ 21px icon */
        width: 34px;
        height: 34px;
        padding: 0;
        background: var(--color-background-secondary, #f5f2ed);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
        border-radius: var(--radius-full, 9999px);
        color: var(--color-text-secondary, #5c544a);
        cursor: pointer;
        transition: all 200ms var(--ease-gentle, cubic-bezier(0.4, 0, 0.2, 1));
        /* Subtle inner shadow for depth */
        box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.5),
                    0 1px 3px rgba(44, 37, 32, 0.04);
      }

      .engagement-panel__close:hover {
        background: var(--color-background-tertiary, #ebe6df);
        color: var(--color-text-primary, #2c2520);
        border-color: var(--color-border-medium, rgba(44, 37, 32, 0.10));
        transform: scale(1.05);
        box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.6),
                    0 2px 6px rgba(44, 37, 32, 0.08);
      }

      .engagement-panel__close:active {
        transform: scale(0.95);
        box-shadow: inset 0 2px 4px rgba(44, 37, 32, 0.08);
      }

      .engagement-panel__close:focus-visible {
        outline: 2px solid var(--color-accent-primary, #2d5a3d);
        outline-offset: 2px;
      }

      .engagement-panel__close svg {
        /* Golden ratio to button: 34/1.618 ≈ 21px */
        width: 16px;
        height: 16px;
        stroke-width: 2.5;
        opacity: 0.8;
        transition: opacity 200ms ease;
      }

      .engagement-panel__close:hover svg {
        opacity: 1;
      }

      /* Content */
      .engagement-panel__content {
        flex: 1;
        overflow-y: auto;
        padding: var(--ma-rest, 21px);
        display: flex;
        flex-direction: column;
        gap: var(--ma-pause, 13px);
      }

      /* Cards */
      .engagement-card {
        background: var(--color-background-primary, #faf8f5);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
        border-radius: var(--radius-lg, 1rem);
        padding: var(--ma-rest, 21px);
        animation: engagementSlideIn 400ms var(--ease-ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1)) forwards;
        opacity: 0;
        transform: translateY(8px);
      }

      @keyframes engagementSlideIn {
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .engagement-card__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--ma-pause, 13px);
      }

      .engagement-card__label {
        font-family: var(--font-body, 'Inter', sans-serif);
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-muted, #756a5e);
        text-transform: uppercase;
        letter-spacing: var(--tracking-wider, 0.05em);
      }

      .engagement-badge {
        font-size: var(--text-2xs, 0.625rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-accent-primary, #2d5a3d);
        background: var(--color-accent-subtle, rgba(45, 90, 61, 0.05));
        padding: 2px 8px;
        border-radius: var(--radius-full, 9999px);
      }

      /* Weather */
      .engagement-weather {
        display: flex;
        align-items: center;
        gap: var(--ma-pause, 13px);
      }

      .engagement-weather__icon {
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-background-secondary, #f5f2ed);
        border-radius: var(--radius-lg, 1rem);
        color: var(--color-text-secondary, #5c544a);
      }

      .engagement-weather__icon svg {
        width: 28px;
        height: 28px;
      }

      .energy-high .engagement-weather__icon {
        color: var(--color-semantic-success, #3d7a52);
        background: var(--color-semantic-success-glow, rgba(61, 122, 82, 0.18));
      }

      .energy-low .engagement-weather__icon {
        color: var(--color-text-dimmed, #a89d90);
      }

      .engagement-weather__info {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .engagement-weather__label {
        font-family: var(--font-body, 'Inter', sans-serif);
        font-size: var(--text-base, 0.9375rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary, #2c2520);
      }

      .engagement-weather__energy {
        font-size: var(--text-sm, 0.8125rem);
        color: var(--color-text-muted, #756a5e);
      }

      .engagement-weather__note {
        margin-top: var(--ma-pause, 13px);
        padding-top: var(--ma-pause, 13px);
        border-top: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
        font-size: var(--text-sm, 0.8125rem);
        color: var(--color-text-secondary, #5c544a);
        font-style: italic;
        line-height: var(--leading-normal, 1.6);
      }

      /* Streaks */
      .engagement-streaks {
        display: flex;
        flex-direction: column;
        gap: var(--ma-breath, 8px);
      }

      .engagement-streaks__empty {
        font-size: var(--text-sm, 0.8125rem);
        color: var(--color-text-dimmed, #a89d90);
        text-align: center;
        padding: var(--ma-rest, 21px) 0;
      }

      .engagement-streak {
        display: flex;
        flex-direction: column;
        gap: var(--ma-breath, 8px);
        padding: var(--ma-breath, 8px) var(--ma-pause, 13px);
        border-radius: var(--radius-md, 0.75rem);
        background: var(--color-background-secondary, #f5f2ed);
        transition: var(--transition-all-fast, all 150ms ease);
      }

      .engagement-streak--due {
        background: var(--color-accent-subtle, rgba(45, 90, 61, 0.05));
        border-left: 3px solid var(--color-accent-primary, #2d5a3d);
      }

      .engagement-streak__info {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
      }

      .engagement-streak__name {
        font-size: var(--text-sm, 0.8125rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary, #2c2520);
      }

      .engagement-streak__count {
        font-size: var(--text-sm, 0.8125rem);
        color: var(--color-text-muted, #756a5e);
        display: flex;
        align-items: center;
        gap: var(--ma-breath, 8px);
      }

      .engagement-streak__record {
        font-size: var(--text-2xs, 0.625rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-accent-primary, #2d5a3d);
        text-transform: uppercase;
        letter-spacing: var(--tracking-wider, 0.05em);
      }

      .engagement-streak__progress {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .engagement-streak__dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--color-border-medium, rgba(44, 37, 32, 0.10));
        transition: var(--transition-all-fast, all 150ms ease);
      }

      .engagement-streak__dot--filled {
        background: var(--color-accent-primary, #2d5a3d);
        animation: engagementDotPop 300ms var(--ease-ease-out-back, cubic-bezier(0.34, 1.56, 0.64, 1)) forwards;
      }

      @keyframes engagementDotPop {
        0% { transform: scale(0); }
        100% { transform: scale(1); }
      }

      .engagement-streak__more {
        font-size: var(--text-2xs, 0.625rem);
        color: var(--color-text-muted, #756a5e);
        margin-left: 4px;
      }

      /* Persona colors */
      .persona-ferni .engagement-streak__dot--filled { background: #4a6741; }
      .persona-alex .engagement-streak__dot--filled { background: #5a6b8a; }
      .persona-maya .engagement-streak__dot--filled { background: #a67a6a; }
      .persona-jordan .engagement-streak__dot--filled { background: #c4856a; }
      .persona-nayan .engagement-streak__dot--filled { background: #9a7b5a; }
      .persona-peter .engagement-streak__dot--filled { background: #3a6b73; }

      /* Stats */
      .engagement-stats {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--ma-pause, 13px);
      }

      .engagement-stat {
        display: flex;
        flex-direction: column;
        gap: 2px;
        text-align: center;
      }

      .engagement-stat__value {
        font-family: var(--font-accent, 'Sora', sans-serif);
        font-size: var(--text-2xl, 1.5rem);
        font-weight: var(--font-weight-bold, 700);
        color: var(--color-text-primary, #2c2520);
        line-height: 1;
      }

      .engagement-stat__label {
        font-size: var(--text-2xs, 0.625rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-muted, #756a5e);
        text-transform: uppercase;
        letter-spacing: var(--tracking-wider, 0.05em);
      }

      /* Empty state */
      .engagement-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--ma-meditation, 55px) var(--ma-rest, 21px);
        text-align: center;
      }

      .engagement-empty__icon {
        width: 64px;
        height: 64px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-background-tertiary, #ebe6df);
        border-radius: 50%;
        color: var(--color-text-dimmed, #a89d90);
        margin-bottom: var(--ma-rest, 21px);
      }

      .engagement-empty__icon svg {
        width: 32px;
        height: 32px;
      }

      .engagement-empty__text {
        font-size: var(--text-sm, 0.8125rem);
        color: var(--color-text-secondary, #5c544a);
        max-width: 200px;
        line-height: var(--leading-normal, 1.6);
      }

      /* Reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .engagement-card {
          animation: none;
          opacity: 1;
          transform: none;
        }
        .engagement-streak__dot--filled {
          animation: none;
        }
      }

      /* Dark theme adjustments (Cedar Night) */
      [data-theme="midnight"] .engagement-panel__wrapper {
        background: var(--color-background-elevated, #70605a);
        border-left-color: var(--color-border-medium, rgba(215, 185, 145, 0.20));
      }

      [data-theme="midnight"] .engagement-panel__title {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .engagement-panel__close {
        background: var(--color-background-tertiary, #685852);
        border-color: var(--color-border-subtle, rgba(215, 185, 145, 0.12));
        color: var(--color-text-secondary, #e0d5c8);
        box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.05),
                    0 1px 3px rgba(0, 0, 0, 0.15);
      }

      [data-theme="midnight"] .engagement-panel__close:hover {
        background: var(--color-background-secondary, #60504a);
        border-color: var(--color-border-medium, rgba(215, 185, 145, 0.20));
        color: var(--color-text-primary, #faf6f0);
        box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.08),
                    0 2px 6px rgba(0, 0, 0, 0.2);
      }

      [data-theme="midnight"] .engagement-panel__close:active {
        box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
      }

      [data-theme="midnight"] .engagement-card {
        background: var(--color-background-secondary, #60504a);
        border-color: var(--color-border-subtle, rgba(215, 185, 145, 0.12));
      }

      [data-theme="midnight"] .engagement-card__label {
        color: var(--color-text-muted, #d0c4b4);
      }

      [data-theme="midnight"] .engagement-streak {
        background: var(--color-background-tertiary, #685852);
      }

      [data-theme="midnight"] .engagement-streak__name {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .engagement-streak__count {
        color: var(--color-text-secondary, #e0d5c8);
      }

      [data-theme="midnight"] .engagement-streak__record {
        color: var(--color-accent-primary, #d4a84a);
      }

      [data-theme="midnight"] .engagement-weather__icon {
        background: var(--color-background-tertiary, #685852);
        color: var(--color-text-secondary, #e0d5c8);
      }

      [data-theme="midnight"] .engagement-weather__label {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .engagement-weather__energy {
        color: var(--color-text-secondary, #e0d5c8);
      }

      [data-theme="midnight"] .engagement-weather__note {
        color: var(--color-text-secondary, #e0d5c8);
        border-top-color: var(--color-border-subtle, rgba(215, 185, 145, 0.12));
      }

      [data-theme="midnight"] .engagement-stat__value {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .engagement-stat__label {
        color: var(--color-text-muted, #d0c4b4);
      }

      [data-theme="midnight"] .engagement-empty__icon {
        background: var(--color-background-tertiary, #685852);
        color: var(--color-text-muted, #d0c4b4);
      }

      [data-theme="midnight"] .engagement-empty__text {
        color: var(--color-text-secondary, #e0d5c8);
      }

      [data-theme="midnight"] .engagement-badge {
        color: var(--color-accent-primary, #d4a84a);
        background: var(--color-accent-subtle, rgba(212, 168, 74, 0.08));
      }

      [data-theme="midnight"] .engagement-streaks__empty {
        color: var(--color-text-muted, #d0c4b4);
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }

    const style = document.getElementById('engagement-ui-styles');
    if (style) {
      style.remove();
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let engagementUI: EngagementUI | null = null;

export function getEngagementUI(): EngagementUI {
  if (!engagementUI) {
    engagementUI = new EngagementUI();
  }
  return engagementUI;
}

export function initializeEngagementUI(): void {
  const ui = getEngagementUI();
  ui.initialize();
}

export default EngagementUI;

