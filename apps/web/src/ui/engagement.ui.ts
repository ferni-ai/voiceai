/**
 * Engagement UI Component - "Daily Check-in"
 *
 * A centered floating modal for daily rituals, streaks, and emotional weather.
 * Redesigned to match the Menu/Predictions modal treatment.
 *
 * Design System Compliance:
 * - Uses CSS variables from tokens.css
 * - Uses DURATION/EASING from animation-constants.ts
 * - Uses shared components from engagement-components.ts
 * - Respects prefers-reduced-motion
 * - Centered floating modal with backdrop blur
 */

import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import {
  ICONS,
  WEATHER_COPY,
  ENERGY_COPY,
  STAGGER_DELAYS,
  getStaggerDelay,
  injectSharedStyles,
  escapeHtml,
  renderCloseButton,
  renderStreakDots,
  getStreakMilestoneMessage,
  type IconName,
} from './engagement-components.js';
import { engagementService } from '../services/engagement.service.js';
import { isDemoDataEnabled, getDemoEngagementData } from '../services/engagement-demo-data.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

const log = createLogger('EngagementUI');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

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
// ENGAGEMENT UI CLASS
// ============================================================================

export class EngagementUI {
  private container: HTMLElement | null = null;
  private panelVisible: boolean = false;
  private styleElement: HTMLStyleElement | null = null;
  private hasDataLoaded: boolean = false;

  /**
   * Initialize the engagement UI
   */
  initialize(): void {
    // HMR protection - avoid duplicate panels
    if (this.container) return;
    
    // Clean up any orphaned elements from HMR
    const existingPanel = document.getElementById('engagement-panel');
    if (existingPanel) existingPanel.remove();
    
    // Inject shared design system styles
    injectSharedStyles();
    this.createStyles();
    this.createPanel();
  }

  /**
   * Create the engagement panel container - CENTERED FLOATING MODAL
   */
  private createPanel(): void {
    this.container = document.createElement('div');
    this.container.id = 'engagement-panel';
    this.container.className = 'engagement-panel';
    this.container.setAttribute('role', 'dialog');
    this.container.setAttribute('aria-modal', 'true');
    this.container.setAttribute('aria-label', 'Daily check-in');
    this.container.setAttribute('aria-hidden', 'true');

    this.container.innerHTML = `
      <div class="engagement-panel__backdrop"></div>
      <div class="engagement-panel__card">
        <header class="engagement-panel__header">
          <h2 class="engagement-panel__title">Daily Check-in</h2>
          ${renderCloseButton('Close panel')}
        </header>
        <div class="engagement-panel__content" id="engagement-content">
          ${this.renderEmptyState()}
        </div>
      </div>
    `;

    document.body.appendChild(this.container);

    // Bind events
    const backdrop = this.container.querySelector('.engagement-panel__backdrop');
    backdrop?.addEventListener('click', () => this.hide());
    
    const closeBtn = this.container.querySelector('.engagement-close-btn');
    closeBtn?.addEventListener('click', () => this.hide());
    
    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.panelVisible) {
        this.hide();
      }
    });
  }

  /**
   * Render empty state - welcoming, not clinical
   */
  private renderEmptyState(): string {
    return `
      <div class="engagement-empty">
        <div class="engagement-empty__icon">
          ${ICONS.heart}
        </div>
        <h3 class="engagement-empty__title">Start Your Journey</h3>
        <p class="engagement-empty__message">
          Daily practices help you build consistency and self-awareness. 
          Start a conversation with Ferni to set up your first ritual.
        </p>
        <button class="engagement-empty__cta" onclick="document.querySelector('.engagement-panel')?.classList.remove('engagement-panel--visible')">
          Talk to Ferni
        </button>
      </div>
    `;
  }

  /**
   * Update the panel with engagement data
   */
  update(data: EngagementData): void {
    if (!this.container) return;

    // Mark data as loaded when receiving data (e.g., from LiveKit)
    this.hasDataLoaded = true;

    const content = this.container.querySelector('#engagement-content');
    if (!content) return;

    const sections: string[] = [];

    // Emotional Weather - most recent
    const latestWeather = data.weatherHistory[0];
    if (latestWeather) {
      sections.push(this.renderWeatherSection(latestWeather));
    }

    // Weather Trend - visualization of last 7 days
    if (data.weatherHistory.length > 1) {
      sections.push(this.renderWeatherTrend(data.weatherHistory.slice(0, 7)));
    }

    // Active streaks - the heart of daily practice
    if (data.ritualStreaks.length > 0) {
      sections.push(this.renderStreaksSection(data.ritualStreaks));
    }

    // Summary stats
    sections.push(this.renderStatsSection(data.stats));

    content.innerHTML = sections.join('');

    // Staggered entrance animations
    if (!prefersReducedMotion()) {
      const cards = content.querySelectorAll('.engagement-card');
      cards.forEach((card, index) => {
        const delay = getStaggerDelay(index, STAGGER_DELAYS.CARD);
        (card as HTMLElement).style.animationDelay = `${delay}ms`;
      });
    }
  }

  /**
   * Render weather trend visualization
   */
  private renderWeatherTrend(history: EmotionalWeatherData[]): string {
    // Map weather to numeric values for the chart
    const weatherValues: Record<string, number> = {
      'sunny': 5,
      'rainbow': 5,
      'partly-cloudy': 4,
      'cloudy': 3,
      'foggy': 2,
      'rainy': 2,
      'stormy': 1,
    };

    // Reverse to show oldest to newest (left to right)
    const reversed = [...history].reverse();

    const dots = reversed.map((day, index) => {
      const value = weatherValues[day.primary] || 3;
      const date = new Date(day.recordedAt);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      const bottom = ((value - 1) / 4) * 60; // Scale to 60px height
      const iconKey = day.primary as IconName;
      const icon = ICONS[iconKey] || ICONS.cloudy;
      
      return `
        <div class="weather-trend__point" style="--index: ${index}; --bottom: ${bottom}px" title="${dayName}: ${WEATHER_COPY[day.primary]?.label || day.primary}">
          <span class="weather-trend__icon">${icon}</span>
          <span class="weather-trend__day">${dayName}</span>
        </div>
      `;
    }).join('');

    // Create trend line path
    const pathPoints = reversed.map((day, index) => {
      const value = weatherValues[day.primary] || 3;
      const x = (index / Math.max(reversed.length - 1, 1)) * 100;
      const y = 100 - ((value - 1) / 4) * 100;
      return `${x},${y}`;
    }).join(' ');

    return `
      <section class="engagement-card engagement-card--trend">
        <div class="engagement-section-header">
          <span class="engagement-section-label">Your Week</span>
          <span class="engagement-trend-hint">Emotional weather trend</span>
        </div>
        <div class="weather-trend">
          <svg class="weather-trend__line" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline 
              points="${pathPoints}" 
              fill="none" 
              stroke="var(--persona-primary, var(--color-accent-primary))" 
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              opacity="0.3"
            />
          </svg>
          <div class="weather-trend__points">
            ${dots}
          </div>
        </div>
      </section>
    `;
  }

  /**
   * Render emotional weather section
   */
  private renderWeatherSection(weather: EmotionalWeatherData): string {
    const iconKey = weather.primary as IconName;
    const icon = ICONS[iconKey] || ICONS.cloudy;
    const copy = WEATHER_COPY[weather.primary];
    const energyCopy = ENERGY_COPY[weather.energy];
    const energyClass = `energy-${weather.energy}`;

    return `
      <section class="engagement-card engagement-card--weather ${energyClass}">
        <div class="engagement-section-header">
          <span class="engagement-section-label">How you're feeling</span>
        </div>
        <div class="engagement-weather">
          <div class="engagement-weather__icon" aria-hidden="true">
            ${icon}
          </div>
          <div class="engagement-weather__info">
            <span class="engagement-weather__label">${escapeHtml(copy.label)}</span>
            <span class="engagement-weather__energy">${escapeHtml(energyCopy.label)} energy</span>
          </div>
        </div>
        <p class="engagement-weather__encouragement">${escapeHtml(copy.encouragement)}</p>
        ${weather.note ? `<p class="engagement-weather__note">"${escapeHtml(weather.note)}"</p>` : ''}
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

    const dueLabel = dueStreaks.length > 0
      ? `<span class="engagement-badge">${dueStreaks.length} ready for you</span>`
      : '';

    return `
      <section class="engagement-card engagement-card--streaks">
        <div class="engagement-section-header">
          <span class="engagement-section-label">Your Rituals</span>
          ${dueLabel}
        </div>
        <div class="engagement-streaks">
          ${activeStreaks.length > 0 ? streakItems : this.renderNoStreaksMessage()}
        </div>
      </section>
    `;
  }

  /**
   * Render no streaks message - encouraging
   */
  private renderNoStreaksMessage(): string {
    return `
      <p class="engagement-streaks__empty">
        Small daily rituals lead to big transformations.<br/>
        <span class="engagement-streaks__cta">Ask Ferni to help you start one.</span>
      </p>
    `;
  }

  /**
   * Render individual streak item
   */
  private renderStreakItem(streak: RitualStreakData): string {
    const isPersonalBest = streak.currentStreak >= streak.longestStreak && streak.currentStreak > 1;
    const milestoneMessage = getStreakMilestoneMessage(streak.currentStreak);
    const isDue = streak.dueToday;

    return `
      <div class="engagement-streak ${isDue ? 'engagement-streak--due' : ''}" data-persona="${escapeHtml(streak.personaId)}">
        <div class="engagement-streak__header">
          <span class="engagement-streak__name">${escapeHtml(streak.ritualName)}</span>
          ${isPersonalBest ? '<span class="engagement-streak__best">Personal best!</span>' : ''}
        </div>
        <div class="engagement-streak__body">
          <span class="engagement-streak__count">
            ${streak.currentStreak} ${streak.currentStreak === 1 ? 'day' : 'days'}
          </span>
          ${renderStreakDots(streak.currentStreak, 7, streak.personaId)}
        </div>
        ${milestoneMessage ? `<p class="engagement-streak__milestone">${escapeHtml(milestoneMessage)}</p>` : ''}
      </div>
    `;
  }

  /**
   * Render stats section
   */
  private renderStatsSection(stats: EngagementStats): string {
    const statsItems: { value: number | string; label: string }[] = [
      { value: stats.totalRitualDays, label: 'Total days' },
      { value: stats.longestOverallStreak, label: 'Best streak' },
      { value: stats.currentActiveStreaks, label: 'Active rituals' },
    ];

    const statsHtml = statsItems
      .map(stat => `
        <div class="engagement-stat">
          <span class="engagement-stat__value">${stat.value}</span>
          <span class="engagement-stat__label">${stat.label}</span>
        </div>
      `)
      .join('');

    return `
      <section class="engagement-card engagement-card--stats">
        <div class="engagement-section-header">
          <span class="engagement-section-label">Your Progress</span>
        </div>
        <div class="engagement-stats">
          ${statsHtml}
        </div>
      </section>
    `;
  }

  /**
   * Show the panel with smooth animation.
   * Fetches data from API if not already loaded.
   */
  show(): void {
    if (!this.container) return;

    this.panelVisible = true;
    this.container.classList.add('engagement-panel--visible');
    this.container.setAttribute('aria-hidden', 'false');

    // Fetch data if not already loaded
    if (!this.hasDataLoaded) {
      void this.loadData();
    }
  }

  /**
   * Load engagement data from API or demo data.
   */
  private async loadData(): Promise<void> {
    log.debug('Loading engagement data...');

    // Try to get cached data from engagement service
    const cachedData = engagementService.getCachedData();
    if (cachedData) {
      log.debug('Using cached engagement data');
      this.update(cachedData);
      this.hasDataLoaded = true;
      return;
    }

    // Try to fetch from API
    const userId = localStorage.getItem('ferni_user_id');
    if (userId) {
      const data = await engagementService.fetchEngagementData(userId);
      if (data) {
        log.debug('Loaded engagement data from API');
        this.update(data);
        this.hasDataLoaded = true;
        return;
      }
    }

    // Fall back to demo data if enabled
    if (isDemoDataEnabled()) {
      log.debug('Loading demo engagement data');
      const demoData = getDemoEngagementData();
      this.update(demoData);
      this.hasDataLoaded = true;
      return;
    }

    // Leave as empty state
    log.debug('No engagement data available, showing empty state');
  }

  /**
   * Hide the panel with smooth animation
   */
  hide(): void {
    if (!this.container) return;

    this.panelVisible = false;
    this.container.setAttribute('aria-hidden', 'true');
    
    // Wait for animation before hiding
    trackedTimeout(() => {
      this.container?.classList.remove('engagement-panel--visible');
    }, prefersReducedMotion() ? 0 : DURATION.NORMAL);
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
   * Check if panel is visible
   */
  isVisible(): boolean {
    return this.panelVisible;
  }

  /**
   * Create component-specific styles - CENTERED FLOATING MODAL
   */
  private createStyles(): void {
    const styleId = 'engagement-ui-styles';
    if (document.getElementById(styleId)) return;

    this.styleElement = document.createElement('style');
    this.styleElement.id = styleId;
    this.styleElement.textContent = `
      /* ========================================
         ENGAGEMENT PANEL - CENTERED FLOATING MODAL
         Matches Menu/Predictions treatment
         ======================================== */

      .engagement-panel {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal, 1400);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--ma-silence, 34px);
        opacity: 0;
        visibility: hidden;
        transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD},
                    visibility ${DURATION.NORMAL}ms ${EASING.STANDARD};
      }

      .engagement-panel--visible {
        opacity: 1;
        visibility: visible;
      }

      /* Backdrop */
      .engagement-panel__backdrop {
        position: absolute;
        inset: 0;
        background: var(--backdrop-heavy);
        backdrop-filter: blur(var(--glass-blur-subtle, 8px));
      }

      /* Card */
      .engagement-panel__card {
        position: relative;
        width: 100%;
        max-width: 420px;
        max-height: 80vh;
        background: var(--color-background-elevated, #fffdfb);
        border-radius: var(--radius-2xl, 1.5rem);
        box-shadow: var(--shadow-2xl);
        border: 1px solid var(--color-border-subtle);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transform: translateY(20px) scale(0.95);
        opacity: 0;
        transition: transform ${DURATION.MODERATE}ms ${EASING.SPRING},
                    opacity ${DURATION.MODERATE}ms ${EASING.STANDARD};
      }

      .engagement-panel--visible .engagement-panel__card {
        transform: translateY(0) scale(1);
        opacity: 1;
      }

      /* Header */
      .engagement-panel__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-5, 20px) var(--space-6, 24px);
        border-bottom: 1px solid var(--color-border-subtle);
        flex-shrink: 0;
      }

      .engagement-panel__title {
        font-family: var(--font-display);
        font-size: var(--text-xl, 1.25rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0;
      }

      /* Content */
      .engagement-panel__content {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-5, 20px);
        display: flex;
        flex-direction: column;
        gap: var(--space-4, 16px);
      }

      /* Section Header */
      .engagement-section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--space-3, 12px);
      }

      .engagement-section-label {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: var(--tracking-wider, 0.05em);
      }

      .engagement-badge {
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-accent-text);
        background: var(--persona-tint, var(--color-accent-subtle));
        padding: var(--space-1, 4px) var(--space-2, 8px);
        border-radius: var(--radius-full, 9999px);
      }

      /* Cards */
      .engagement-card {
        background: var(--color-background-secondary);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-xl, 1.25rem);
        padding: var(--space-4, 16px);
        animation: engagementCardEnter ${DURATION.MODERATE}ms ${EASING.SPRING} forwards;
        opacity: 0;
        transform: translateY(8px);
      }

      @keyframes engagementCardEnter {
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* Weather Section */
      .engagement-weather {
        display: flex;
        align-items: center;
        gap: var(--space-4, 16px);
      }

      .engagement-weather__icon {
        width: 56px;
        height: 56px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-background-tertiary);
        border-radius: var(--radius-xl, 1.25rem);
        color: var(--color-text-secondary);
      }

      .engagement-weather__icon svg {
        width: 32px;
        height: 32px;
      }

      /* Energy colors */
      .energy-high .engagement-weather__icon {
        color: var(--color-semantic-success);
        background: var(--color-semantic-success-glow);
      }

      .energy-medium .engagement-weather__icon {
        color: var(--color-accent-text);
        background: var(--persona-tint, var(--color-accent-subtle));
      }

      .energy-low .engagement-weather__icon {
        color: var(--color-text-dimmed);
        background: var(--color-background-tertiary);
      }

      .engagement-weather__info {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .engagement-weather__label {
        font-family: var(--font-body);
        font-size: var(--text-base);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary);
      }

      .engagement-weather__energy {
        font-size: var(--text-sm);
        color: var(--color-text-muted);
      }

      .engagement-weather__encouragement {
        margin: var(--space-3, 12px) 0 0 0;
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        font-style: italic;
        line-height: var(--leading-relaxed);
      }

      .engagement-weather__note {
        margin-top: var(--space-3, 12px);
        padding-top: var(--space-3, 12px);
        border-top: 1px solid var(--color-border-subtle);
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
      }

      /* Streaks */
      .engagement-streaks {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
      }

      .engagement-streaks__empty {
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        text-align: center;
        padding: var(--space-4, 16px) 0;
        line-height: var(--leading-relaxed);
      }

      .engagement-streaks__cta {
        color: var(--color-accent-text);
        font-weight: var(--font-weight-medium, 500);
      }

      .engagement-streak {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
        padding: var(--space-3, 12px);
        border-radius: var(--radius-lg, 1rem);
        background: var(--color-background-elevated);
        border: 1px solid var(--color-border-subtle);
      }

      .engagement-streak--due {
        background: var(--persona-tint, var(--color-accent-subtle));
        border-left: 3px solid var(--persona-primary, var(--color-accent-primary));
      }

      .engagement-streak__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .engagement-streak__name {
        font-size: var(--text-sm);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary);
      }

      .engagement-streak__best {
        font-size: var(--text-2xs, 0.625rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-semantic-success);
        text-transform: uppercase;
        letter-spacing: var(--tracking-wider);
      }

      .engagement-streak__body {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .engagement-streak__count {
        font-size: var(--text-sm);
        color: var(--color-text-muted);
      }

      .engagement-streak__milestone {
        font-size: var(--text-xs);
        color: var(--color-text-secondary);
        font-style: italic;
        margin: 0;
        padding-top: var(--space-2, 8px);
        border-top: 1px solid var(--color-border-subtle);
      }

      /* Weather Trend */
      .engagement-card--trend {
        background: var(--color-background-secondary);
      }

      .engagement-trend-hint {
        font-size: var(--text-2xs, 0.625rem);
        color: var(--color-text-dimmed);
        text-transform: none;
        letter-spacing: normal;
      }

      .weather-trend {
        position: relative;
        height: 90px;
        margin-top: var(--space-2, 8px);
      }

      .weather-trend__line {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 60px;
        top: 10px;
      }

      .weather-trend__points {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        height: 100%;
        padding: 0 var(--space-1, 4px);
      }

      .weather-trend__point {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--space-1, 4px);
        position: relative;
        animation: weatherPointFadeIn ${DURATION.MODERATE}ms ${EASING.SPRING} forwards;
        animation-delay: calc(var(--index) * 60ms);
        opacity: 0;
        transform: translateY(8px);
        margin-bottom: var(--bottom, 0);
      }

      @keyframes weatherPointFadeIn {
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .weather-trend__icon {
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-background-elevated);
        border-radius: var(--radius-full);
        box-shadow: var(--shadow-sm);
        color: var(--color-accent-text);
        transition: transform ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .weather-trend__icon svg {
        width: 14px;
        height: 14px;
      }

      .weather-trend__point:hover .weather-trend__icon {
        transform: scale(1.15);
      }

      .weather-trend__day {
        font-size: var(--text-2xs, 0.625rem);
        color: var(--color-text-dimmed);
        font-weight: var(--font-weight-medium, 500);
      }

      /* Stats */
      .engagement-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--space-3, 12px);
      }

      .engagement-stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        padding: var(--space-3, 12px);
        background: var(--color-background-elevated);
        border-radius: var(--radius-lg, 1rem);
      }

      .engagement-stat__value {
        font-family: var(--font-display);
        font-size: var(--text-2xl, 1.5rem);
        font-weight: var(--font-weight-bold, 700);
        color: var(--color-text-primary);
        line-height: 1;
      }

      .engagement-stat__label {
        font-size: var(--text-2xs, 0.625rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: var(--tracking-wide);
        text-align: center;
      }

      /* Empty State */
      .engagement-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: var(--space-8, 32px) var(--space-4, 16px);
      }

      .engagement-empty__icon {
        width: 64px;
        height: 64px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--persona-tint, var(--color-accent-subtle));
        border-radius: var(--radius-full);
        color: var(--color-accent-text);
        margin-bottom: var(--space-4, 16px);
      }

      .engagement-empty__icon svg {
        width: 32px;
        height: 32px;
      }

      .engagement-empty__title {
        font-family: var(--font-display);
        font-size: var(--text-lg);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0 0 var(--space-2, 8px) 0;
      }

      .engagement-empty__message {
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        line-height: var(--leading-relaxed);
        max-width: 280px;
        margin: 0 0 var(--space-5, 20px) 0;
      }

      .engagement-empty__cta {
        background: var(--persona-primary, var(--color-accent-primary));
        color: white;
        border: none;
        padding: var(--space-3, 12px) var(--space-6, 24px);
        border-radius: var(--radius-full);
        font-family: var(--font-body);
        font-size: var(--text-sm);
        font-weight: var(--font-weight-medium, 500);
        cursor: pointer;
        transition: transform ${DURATION.FAST}ms ${EASING.SPRING},
                    background ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .engagement-empty__cta:hover {
        transform: scale(1.05);
        background: var(--persona-secondary);
      }

      .engagement-empty__cta:active {
        transform: scale(0.98);
      }

      /* Dark Theme */
      [data-theme="midnight"] .engagement-panel__backdrop {
        background: var(--backdrop-heavy);
      }

      [data-theme="midnight"] .engagement-panel__card {
        background: var(--color-background-elevated);
        border-color: var(--color-border-medium);
      }

      [data-theme="midnight"] .engagement-card {
        background: var(--color-background-tertiary);
        border-color: var(--color-border-subtle);
      }

      [data-theme="midnight"] .engagement-streak {
        background: var(--color-background-secondary);
      }

      [data-theme="midnight"] .engagement-stat {
        background: var(--color-background-secondary);
      }

      /* Dark Theme Text - WCAG AA Compliant */
      [data-theme="midnight"] .engagement-card__title,
      [data-theme="midnight"] .engagement-streaks__title,
      [data-theme="midnight"] .engagement-streak__title,
      [data-theme="midnight"] .engagement-stat__value {
        color: var(--color-text-primary);
      }

      [data-theme="midnight"] .engagement-card__value,
      [data-theme="midnight"] .engagement-card__description,
      [data-theme="midnight"] .engagement-weather__description,
      [data-theme="midnight"] .engagement-streaks__content,
      [data-theme="midnight"] .engagement-streaks__empty,
      [data-theme="midnight"] .engagement-streak__milestone,
      [data-theme="midnight"] .engagement-empty__message {
        color: var(--color-text-secondary);
      }

      [data-theme="midnight"] .engagement-card__label,
      [data-theme="midnight"] .engagement-weather__energy,
      [data-theme="midnight"] .engagement-streak__count,
      [data-theme="midnight"] .engagement-stat__label {
        color: var(--color-text-muted);
      }

      /* Responsive */
      @media (max-width: 480px) {
        .engagement-panel {
          padding: var(--space-4, 16px);
        }

        .engagement-panel__card {
          max-height: 90vh;
          border-radius: var(--radius-xl, 1.25rem);
        }

        .engagement-stats {
          grid-template-columns: repeat(3, 1fr);
        }
      }

      /* Reduced Motion */
      @media (prefers-reduced-motion: reduce) {
        .engagement-panel,
        .engagement-panel__card,
        .engagement-card {
          animation: none !important;
          transition: opacity ${DURATION.FAST}ms linear !important;
          transform: none !important;
        }
      }
    `;

    document.head.appendChild(this.styleElement);
  }

  /**
   * Cleanup - properly dispose all resources
   */
  destroy(): void {
    // FIX: Clear all tracked timeouts to prevent memory leaks
    clearAllTimeouts();

    if (this.container) {
      this.container.remove();
      this.container = null;
    }

    if (this.styleElement) {
      this.styleElement.remove();
      this.styleElement = null;
    }

    // Reset state
    this.panelVisible = false;
    this.hasDataLoaded = false;
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
