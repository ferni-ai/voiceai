/**
 * 🎵 Music Dashboard UI - "Musical You"
 *
 * A coaching-focused dashboard showing music game insights.
 * Feels like insights from a coach who knows you, not a spreadsheet.
 *
 * DESIGN PRINCIPLES:
 *   - Personality-first presentation
 *   - Warm, coaching language throughout
 *   - Celebrate achievements, encourage growth
 *   - Beautiful visualizations that feel human
 */

import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { t } from '../i18n/index.js';

const log = createLogger('MusicDashboard');

// ============================================================================
// TYPES (matching backend MusicInsights)
// ============================================================================

interface PersonalitySummary {
  label: string;
  description: string;
  traits: Array<{
    trait: string;
    displayName: string;
    confidence: number;
    explanation: string;
  }>;
  coachingQuote: string;
}

interface AffinityDisplay {
  category: string;
  displayName: string;
  accuracy: number;
  avgTimeSeconds: number;
  affinityScore: number;
  coachingNote: string;
}

interface MilestoneDisplay {
  type: string;
  displayName: string;
  achievedAt: string;
  icon: string;
  description: string;
  celebrated: boolean;
}

interface MemorableMoment {
  type: string;
  title: string;
  value: string;
  icon: string;
  coachingNote: string;
}

interface JourneyStats {
  totalGames: number;
  totalRounds: number;
  totalMinutes: number;
  favoriteGame: string | null;
  favoriteGameDisplayName: string | null;
  gamesThisWeek: number;
  currentStreak: number;
  bestStreak: number;
  averageScore: number;
}

interface PersonaPlayStats {
  personaId: string;
  displayName: string;
  gamesPlayed: number;
  lastPlayed: string | null;
}

interface MusicInsights {
  hasData: boolean;
  gamesNeededForFullInsights: number;
  personality: PersonalitySummary | null;
  strengths: AffinityDisplay[];
  growthAreas: AffinityDisplay[];
  milestones: MilestoneDisplay[];
  nextMilestone: {
    type: string;
    displayName: string;
    description: string;
    progress: number;
  } | null;
  memorableMoments: MemorableMoment[];
  journeyStats: JourneyStats;
  personaStats: PersonaPlayStats[];
  coachingMessage: string;
  generatedAt: string;
}

export interface MusicDashboardUICallbacks {
  onClose?: () => void;
  onPlayGame?: (gameType: string) => void;
}

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  flame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  trending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
};

// ============================================================================
// MUSIC DASHBOARD UI CLASS
// ============================================================================

class MusicDashboardUI {
  private panel: HTMLElement | null = null;
  private wrapper: HTMLElement | null = null;
  private callbacks: MusicDashboardUICallbacks = {};
  private styleElement: HTMLStyleElement | null = null;
  private isVisible = false;

  initialize(): void {
    if (this.panel) return;

    // HMR protection
    document.querySelectorAll('.music-dashboard').forEach(el => el.remove());

    this.injectStyles();
    this.createPanel();
  }

  setCallbacks(callbacks: MusicDashboardUICallbacks): void {
    this.callbacks = callbacks;
  }

  async show(): Promise<void> {
    this.initialize();
    if (!this.panel || !this.wrapper) return;

    this.showLoading();
    
    try {
      const response = await fetch('/api/games/insights?userId=dev-user');
      const result = await response.json();
      
      if (result.success && result.insights) {
        this.renderContent(result.insights);
        
        if (!prefersReducedMotion()) {
          this.animateIn();
        }
      } else {
        this.showError('Unable to load your music insights');
      }
    } catch (error) {
      log.error('Failed to fetch music insights', error);
      this.showError('Unable to load your music insights');
    }
  }

  showLoading(): void {
    this.initialize();
    if (!this.panel || !this.wrapper) return;

    this.wrapper.innerHTML = `
      <header class="music-dashboard__header">
        <div class="music-dashboard__header-content">
          <span class="music-dashboard__icon">${ICONS.music}</span>
          <h2 class="music-dashboard__title">${t('musicDashboard.title')}</h2>
        </div>
        <button class="music-dashboard__close" aria-label="Close">${ICONS.close}</button>
      </header>
      <div class="music-dashboard__loading">
        <div class="music-dashboard__loading-spinner"></div>
        <p>${t('musicDashboard.loading')}</p>
      </div>
    `;

    this.wrapper.querySelector('.music-dashboard__close')?.addEventListener('click', () => this.hide());
    this.panel.classList.add('music-dashboard--visible');
    this.isVisible = true;
  }

  showError(message: string): void {
    if (!this.wrapper) return;

    this.wrapper.innerHTML = `
      <header class="music-dashboard__header">
        <div class="music-dashboard__header-content">
          <span class="music-dashboard__icon">${ICONS.music}</span>
          <h2 class="music-dashboard__title">${t('musicDashboard.title')}</h2>
        </div>
        <button class="music-dashboard__close" aria-label="Close">${ICONS.close}</button>
      </header>
      <div class="music-dashboard__error">
        <div class="music-dashboard__error-icon">${ICONS.music}</div>
        <p class="music-dashboard__error-title">${message}</p>
        <p class="music-dashboard__error-hint">${t('musicDashboard.error.hint')}</p>
        <button class="music-dashboard__cta">${t('musicDashboard.buttons.startPlaying')}</button>
      </div>
    `;

    this.wrapper.querySelector('.music-dashboard__close')?.addEventListener('click', () => this.hide());
    this.wrapper.querySelector('.music-dashboard__cta')?.addEventListener('click', () => {
      this.hide();
      this.callbacks.onPlayGame?.('name-that-tune');
    });
  }

  hide(): void {
    if (!this.panel) return;

    this.panel.classList.remove('music-dashboard--visible');
    this.isVisible = false;
    this.callbacks.onClose?.();
  }

  isOpen(): boolean {
    return this.isVisible;
  }

  private renderContent(insights: MusicInsights): void {
    if (!this.wrapper) return;

    // Handle no data case
    if (!insights.hasData) {
      this.renderEmptyState(insights);
      return;
    }

    this.wrapper.innerHTML = `
      <header class="music-dashboard__header">
        <div class="music-dashboard__header-content">
          <span class="music-dashboard__icon">${ICONS.music}</span>
          <h2 class="music-dashboard__title">${t('musicDashboard.title')}</h2>
        </div>
        <button class="music-dashboard__close" aria-label="Close">${ICONS.close}</button>
      </header>

      <div class="music-dashboard__scroll">
        ${this.renderPersonality(insights.personality)}
        ${this.renderCoachingMessage(insights.coachingMessage)}
        ${this.renderJourneyStats(insights.journeyStats)}
        ${this.renderStrengths(insights.strengths)}
        ${this.renderGrowthAreas(insights.growthAreas)}
        ${this.renderMilestones(insights.milestones, insights.nextMilestone)}
        ${this.renderMemorableMoments(insights.memorableMoments)}
        ${this.renderPersonaStats(insights.personaStats)}
      </div>
    `;

    // Bind events
    this.wrapper.querySelector('.music-dashboard__close')?.addEventListener('click', () => this.hide());
  }

  private renderEmptyState(insights: MusicInsights): void {
    if (!this.wrapper) return;

    this.wrapper.innerHTML = `
      <header class="music-dashboard__header">
        <div class="music-dashboard__header-content">
          <span class="music-dashboard__icon">${ICONS.music}</span>
          <h2 class="music-dashboard__title">${t('musicDashboard.title')}</h2>
        </div>
        <button class="music-dashboard__close" aria-label="Close">${ICONS.close}</button>
      </header>

      <div class="music-dashboard__empty">
        <div class="music-dashboard__empty-icon">${ICONS.music}</div>
        <h3>${t('musicDashboard.empty.title')}</h3>
        <p>${insights.coachingMessage}</p>
        <p class="music-dashboard__empty-hint">
          ${t('musicDashboard.empty.hint', { count: insights.gamesNeededForFullInsights })}
        </p>
        <button class="music-dashboard__cta">${t('musicDashboard.buttons.playGame')}</button>
      </div>
    `;

    this.wrapper.querySelector('.music-dashboard__close')?.addEventListener('click', () => this.hide());
    this.wrapper.querySelector('.music-dashboard__cta')?.addEventListener('click', () => {
      this.hide();
      this.callbacks.onPlayGame?.('name-that-tune');
    });
  }

  private renderPersonality(personality: PersonalitySummary | null): string {
    if (!personality) return '';

    const traitsHtml = personality.traits
      .filter(t => t.confidence >= 0.5)
      .slice(0, 3)
      .map(t => `
        <div class="music-dashboard__trait">
          <span class="music-dashboard__trait-name">${t.displayName}</span>
          <div class="music-dashboard__trait-bar">
            <div class="music-dashboard__trait-fill" style="width: ${Math.round(t.confidence * 100)}%"></div>
          </div>
          <span class="music-dashboard__trait-explanation">${t.explanation}</span>
        </div>
      `).join('');

    return `
      <section class="music-dashboard__section music-dashboard__personality">
        <div class="music-dashboard__personality-header">
          <span class="music-dashboard__personality-icon">${ICONS.star}</span>
          <div>
            <h3 class="music-dashboard__personality-label">${personality.label}</h3>
            <p class="music-dashboard__personality-desc">${personality.description}</p>
          </div>
        </div>
        ${traitsHtml ? `<div class="music-dashboard__traits">${traitsHtml}</div>` : ''}
        <blockquote class="music-dashboard__quote">${personality.coachingQuote}</blockquote>
      </section>
    `;
  }

  private renderCoachingMessage(message: string): string {
    return `
      <section class="music-dashboard__section music-dashboard__coaching">
        <p class="music-dashboard__coaching-message">${message}</p>
      </section>
    `;
  }

  private renderJourneyStats(stats: JourneyStats): string {
    return `
      <section class="music-dashboard__section">
        <h3 class="music-dashboard__section-title">
          <span class="music-dashboard__section-icon">${ICONS.trending}</span>
          ${t('musicDashboard.sections.journey')}
        </h3>
        <div class="music-dashboard__stats-grid">
          <div class="music-dashboard__stat">
            <span class="music-dashboard__stat-value">${stats.totalGames}</span>
            <span class="music-dashboard__stat-label">${t('musicDashboard.stats.gamesPlayed')}</span>
          </div>
          <div class="music-dashboard__stat">
            <span class="music-dashboard__stat-value">${stats.bestStreak}</span>
            <span class="music-dashboard__stat-label">${t('musicDashboard.stats.bestStreak')}</span>
          </div>
          <div class="music-dashboard__stat">
            <span class="music-dashboard__stat-value">${stats.totalMinutes}</span>
            <span class="music-dashboard__stat-label">${t('musicDashboard.stats.minutes')}</span>
          </div>
          <div class="music-dashboard__stat">
            <span class="music-dashboard__stat-value">${stats.gamesThisWeek}</span>
            <span class="music-dashboard__stat-label">${t('musicDashboard.stats.thisWeek')}</span>
          </div>
        </div>
        ${stats.favoriteGameDisplayName ? `
          <p class="music-dashboard__favorite">
            ${t('musicDashboard.favorite.label')} <strong>${stats.favoriteGameDisplayName}</strong>
          </p>
        ` : ''}
      </section>
    `;
  }

  private renderStrengths(strengths: AffinityDisplay[]): string {
    if (strengths.length === 0) return '';

    const strengthsHtml = strengths.slice(0, 4).map(s => `
      <div class="music-dashboard__affinity music-dashboard__affinity--strength">
        <div class="music-dashboard__affinity-header">
          <span class="music-dashboard__affinity-name">${s.displayName}</span>
          <span class="music-dashboard__affinity-score">${s.accuracy}%</span>
        </div>
        <div class="music-dashboard__affinity-bar">
          <div class="music-dashboard__affinity-fill" style="width: ${s.affinityScore}%"></div>
        </div>
        <span class="music-dashboard__affinity-note">${s.coachingNote}</span>
      </div>
    `).join('');

    return `
      <section class="music-dashboard__section">
        <h3 class="music-dashboard__section-title">
          <span class="music-dashboard__section-icon">${ICONS.zap}</span>
          ${t('musicDashboard.sections.strengths')}
        </h3>
        <div class="music-dashboard__affinities">${strengthsHtml}</div>
      </section>
    `;
  }

  private renderGrowthAreas(areas: AffinityDisplay[]): string {
    if (areas.length === 0) return '';

    const areasHtml = areas.slice(0, 3).map(a => `
      <div class="music-dashboard__affinity music-dashboard__affinity--growth">
        <div class="music-dashboard__affinity-header">
          <span class="music-dashboard__affinity-name">${a.displayName}</span>
          <span class="music-dashboard__affinity-score">${a.accuracy}%</span>
        </div>
        <div class="music-dashboard__affinity-bar">
          <div class="music-dashboard__affinity-fill" style="width: ${a.affinityScore}%"></div>
        </div>
        <span class="music-dashboard__affinity-note">${a.coachingNote}</span>
      </div>
    `).join('');

    return `
      <section class="music-dashboard__section">
        <h3 class="music-dashboard__section-title">
          <span class="music-dashboard__section-icon">${ICONS.target}</span>
          ${t('musicDashboard.sections.growth')}
        </h3>
        <div class="music-dashboard__affinities">${areasHtml}</div>
      </section>
    `;
  }

  private renderMilestones(milestones: MilestoneDisplay[], nextMilestone: MusicInsights['nextMilestone']): string {
    const milestonesHtml = milestones.slice(0, 5).map(m => `
      <div class="music-dashboard__milestone">
        <span class="music-dashboard__milestone-icon">${m.icon}</span>
        <div class="music-dashboard__milestone-content">
          <span class="music-dashboard__milestone-name">${m.displayName}</span>
          <span class="music-dashboard__milestone-desc">${m.description}</span>
        </div>
      </div>
    `).join('');

    const nextHtml = nextMilestone ? `
      <div class="music-dashboard__next-milestone">
        <span class="music-dashboard__next-label">${t('musicDashboard.milestone.nextLabel')}</span>
        <span class="music-dashboard__next-name">${nextMilestone.displayName}</span>
        <div class="music-dashboard__next-bar">
          <div class="music-dashboard__next-fill" style="width: ${Math.round(nextMilestone.progress)}%"></div>
        </div>
        <span class="music-dashboard__next-desc">${nextMilestone.description}</span>
      </div>
    ` : '';

    return `
      <section class="music-dashboard__section">
        <h3 class="music-dashboard__section-title">
          <span class="music-dashboard__section-icon">${ICONS.trophy}</span>
          ${t('musicDashboard.sections.milestones')}
        </h3>
        ${nextHtml}
        ${milestonesHtml ? `<div class="music-dashboard__milestones">${milestonesHtml}</div>` : ''}
      </section>
    `;
  }

  private renderMemorableMoments(moments: MemorableMoment[]): string {
    if (moments.length === 0) return '';

    const momentsHtml = moments.map(m => `
      <div class="music-dashboard__moment">
        <span class="music-dashboard__moment-icon">${m.icon}</span>
        <div class="music-dashboard__moment-content">
          <span class="music-dashboard__moment-title">${m.title}</span>
          <span class="music-dashboard__moment-value">${m.value}</span>
          <span class="music-dashboard__moment-note">${m.coachingNote}</span>
        </div>
      </div>
    `).join('');

    return `
      <section class="music-dashboard__section">
        <h3 class="music-dashboard__section-title">
          <span class="music-dashboard__section-icon">${ICONS.heart}</span>
          ${t('musicDashboard.sections.moments')}
        </h3>
        <div class="music-dashboard__moments">${momentsHtml}</div>
      </section>
    `;
  }

  private renderPersonaStats(stats: PersonaPlayStats[]): string {
    if (stats.length === 0) return '';

    const statsHtml = stats.slice(0, 5).map(s => `
      <div class="music-dashboard__persona-stat">
        <span class="music-dashboard__persona-name">${s.displayName}</span>
        <span class="music-dashboard__persona-games">${s.gamesPlayed} games</span>
      </div>
    `).join('');

    return `
      <section class="music-dashboard__section">
        <h3 class="music-dashboard__section-title">
          <span class="music-dashboard__section-icon">${ICONS.user}</span>
          ${t('musicDashboard.sections.personaStats')}
        </h3>
        <div class="music-dashboard__persona-stats">${statsHtml}</div>
      </section>
    `;
  }

  private animateIn(): void {
    // Stagger animate sections
    const sections = this.wrapper?.querySelectorAll('.music-dashboard__section');
    sections?.forEach((section, i) => {
      const el = section as HTMLElement;
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
      
      setTimeout(() => {
        el.style.transition = `opacity ${DURATION.SLOW}ms ${EASING.STANDARD}, transform ${DURATION.SLOW}ms ${EASING.STANDARD}`;
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      }, 100 + i * 80);
    });
  }

  private createPanel(): void {
    this.panel = document.createElement('div');
    this.panel.className = 'music-dashboard';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Musical You Dashboard');

    // Backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'music-dashboard__backdrop';
    backdrop.addEventListener('click', () => this.hide());
    this.panel.appendChild(backdrop);

    // Wrapper
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'music-dashboard__card';
    this.panel.appendChild(this.wrapper);

    document.body.appendChild(this.panel);
  }

  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = `
      .music-dashboard {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        visibility: hidden;
        transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD},
                    visibility ${DURATION.SLOW}ms ${EASING.STANDARD};
      }

      .music-dashboard--visible {
        opacity: 1;
        visibility: visible;
      }

      .music-dashboard__backdrop {
        position: absolute;
        inset: 0;
        background: rgba(44, 37, 32, 0.5);
        backdrop-filter: blur(var(--glass-blur-medium, 16px));
        -webkit-backdrop-filter: blur(var(--glass-blur-medium, 16px));
      }

      .music-dashboard__card {
        position: relative;
        width: 90%;
        max-width: 520px;
        max-height: 85vh;
        background: var(--color-background-elevated, #fffdfb);
        border-radius: var(--radius-2xl, 20px);
        box-shadow: var(--shadow-2xl, 0 25px 50px -12px rgba(0, 0, 0, 0.25));
        overflow: hidden;
        display: flex;
        flex-direction: column;
        transform: scale(0.95);
        transition: transform ${DURATION.SLOW}ms ${EASING.SPRING};
      }

      .music-dashboard--visible .music-dashboard__card {
        transform: scale(1);
      }

      .music-dashboard__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-4, 16px) var(--space-5, 20px);
        border-bottom: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08));
        background: var(--color-background-subtle, #f5f2ed);
      }

      .music-dashboard__header-content {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
      }

      .music-dashboard__icon {
        width: 28px;
        height: 28px;
        color: var(--color-text-secondary);
      }

      .music-dashboard__title {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--color-text-primary, #2c2520);
        margin: 0;
      }

      .music-dashboard__close {
        width: 36px;
        height: 36px;
        border: none;
        background: transparent;
        border-radius: var(--radius-full, 50%);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-text-secondary, #5c5248);
        transition: background ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .music-dashboard__close:hover {
        background: var(--color-background-hover, rgba(0, 0, 0, 0.05));
      }

      .music-dashboard__close svg {
        width: 20px;
        height: 20px;
      }

      .music-dashboard__scroll {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-4, 16px) var(--space-5, 20px) var(--space-6, 24px);
      }

      .music-dashboard__section {
        margin-bottom: var(--space-5, 20px);
      }

      .music-dashboard__section:last-child {
        margin-bottom: 0;
      }

      .music-dashboard__section-title {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--color-text-secondary, #5c5248);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin: 0 0 var(--space-3, 12px) 0;
      }

      .music-dashboard__section-icon {
        width: 18px;
        height: 18px;
        color: var(--color-text-secondary);
      }

      /* Personality Section */
      .music-dashboard__personality {
        background: linear-gradient(135deg, 
          var(--persona-tint, rgba(74, 103, 65, 0.08)),
          var(--color-background-subtle, #f5f2ed)
        );
        border-radius: var(--radius-xl, 16px);
        padding: var(--space-4, 16px);
      }

      .music-dashboard__personality-header {
        display: flex;
        align-items: flex-start;
        gap: var(--space-3, 12px);
        margin-bottom: var(--space-3, 12px);
      }

      .music-dashboard__personality-icon {
        width: 32px;
        height: 32px;
        color: var(--color-text-secondary);
        flex-shrink: 0;
      }

      .music-dashboard__personality-label {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--color-text-primary, #2c2520);
        margin: 0 0 var(--space-1, 4px) 0;
      }

      .music-dashboard__personality-desc {
        font-size: 0.9rem;
        color: var(--color-text-secondary, #5c5248);
        margin: 0;
        line-height: 1.5;
      }

      .music-dashboard__traits {
        display: flex;
        flex-direction: column;
        gap: var(--space-3, 12px);
        margin-bottom: var(--space-3, 12px);
      }

      .music-dashboard__trait {
        display: flex;
        flex-direction: column;
        gap: var(--space-1, 4px);
      }

      .music-dashboard__trait-name {
        font-weight: 600;
        font-size: 0.85rem;
        color: var(--color-text-primary, #2c2520);
      }

      .music-dashboard__trait-bar {
        height: 6px;
        background: var(--color-background-elevated, #fffdfb);
        border-radius: 3px;
        overflow: hidden;
      }

      .music-dashboard__trait-fill {
        height: 100%;
        background: var(--persona-primary, #4a6741);
        border-radius: 3px;
        transition: width ${DURATION.SLOW}ms ${EASING.STANDARD};
      }

      .music-dashboard__trait-explanation {
        font-size: 0.8rem;
        color: var(--color-text-muted, #7a6f63);
      }

      .music-dashboard__quote {
        font-style: italic;
        font-size: 0.9rem;
        color: var(--color-text-secondary, #5c5248);
        border-left: 3px solid var(--persona-primary, #4a6741);
        padding-left: var(--space-3, 12px);
        margin: 0;
      }

      /* Coaching Message */
      .music-dashboard__coaching {
        background: var(--color-background-subtle, #f5f2ed);
        border-radius: var(--radius-lg, 12px);
        padding: var(--space-3, 12px) var(--space-4, 16px);
      }

      .music-dashboard__coaching-message {
        font-size: 0.95rem;
        color: var(--color-text-primary, #2c2520);
        line-height: 1.6;
        margin: 0;
      }

      /* Stats Grid */
      .music-dashboard__stats-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--space-3, 12px);
      }

      .music-dashboard__stat {
        text-align: center;
        padding: var(--space-3, 12px) var(--space-2, 8px);
        background: var(--color-background-subtle, #f5f2ed);
        border-radius: var(--radius-lg, 12px);
      }

      .music-dashboard__stat-value {
        display: block;
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--color-text-secondary);
      }

      .music-dashboard__stat-label {
        display: block;
        font-size: 0.7rem;
        color: var(--color-text-muted, #7a6f63);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .music-dashboard__favorite {
        font-size: 0.85rem;
        color: var(--color-text-secondary, #5c5248);
        margin: var(--space-3, 12px) 0 0 0;
        text-align: center;
      }

      /* Affinities */
      .music-dashboard__affinities {
        display: flex;
        flex-direction: column;
        gap: var(--space-3, 12px);
      }

      .music-dashboard__affinity {
        background: var(--color-background-subtle, #f5f2ed);
        border-radius: var(--radius-lg, 12px);
        padding: var(--space-3, 12px);
      }

      .music-dashboard__affinity-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-2, 8px);
      }

      .music-dashboard__affinity-name {
        font-weight: 600;
        font-size: 0.9rem;
        color: var(--color-text-primary, #2c2520);
      }

      .music-dashboard__affinity-score {
        font-weight: 700;
        font-size: 0.9rem;
        color: var(--color-text-secondary);
      }

      .music-dashboard__affinity--growth .music-dashboard__affinity-score {
        color: var(--color-semantic-warning, #a67c35);
      }

      .music-dashboard__affinity-bar {
        height: 6px;
        background: var(--color-background-elevated, #fffdfb);
        border-radius: 3px;
        overflow: hidden;
        margin-bottom: var(--space-2, 8px);
      }

      .music-dashboard__affinity-fill {
        height: 100%;
        background: var(--persona-primary, #4a6741);
        border-radius: 3px;
      }

      .music-dashboard__affinity--growth .music-dashboard__affinity-fill {
        background: var(--color-semantic-warning, #a67c35);
      }

      .music-dashboard__affinity-note {
        font-size: 0.8rem;
        color: var(--color-text-muted, #7a6f63);
      }

      /* Milestones */
      .music-dashboard__next-milestone {
        background: linear-gradient(135deg, 
          var(--persona-tint, rgba(74, 103, 65, 0.08)),
          transparent
        );
        border: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08));
        border-radius: var(--radius-lg, 12px);
        padding: var(--space-3, 12px);
        margin-bottom: var(--space-3, 12px);
      }

      .music-dashboard__next-label {
        font-size: 0.7rem;
        font-weight: 600;
        color: var(--color-text-muted, #7a6f63);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .music-dashboard__next-name {
        display: block;
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 1.1rem;
        font-weight: 700;
        color: var(--color-text-primary, #2c2520);
        margin: var(--space-1, 4px) 0;
      }

      .music-dashboard__next-bar {
        height: 8px;
        background: var(--color-background-elevated, #fffdfb);
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: var(--space-1, 4px);
      }

      .music-dashboard__next-fill {
        height: 100%;
        background: var(--persona-primary, #4a6741);
        border-radius: 4px;
        transition: width ${DURATION.SLOW}ms ${EASING.STANDARD};
      }

      .music-dashboard__next-desc {
        font-size: 0.8rem;
        color: var(--color-text-muted, #7a6f63);
      }

      .music-dashboard__milestones {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
      }

      .music-dashboard__milestone {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--space-2, 8px) var(--space-3, 12px);
        background: var(--color-background-subtle, #f5f2ed);
        border-radius: var(--radius-md, 8px);
      }

      .music-dashboard__milestone-icon {
        font-size: 1.25rem;
      }

      .music-dashboard__milestone-content {
        flex: 1;
      }

      .music-dashboard__milestone-name {
        display: block;
        font-weight: 600;
        font-size: 0.85rem;
        color: var(--color-text-primary, #2c2520);
      }

      .music-dashboard__milestone-desc {
        font-size: 0.75rem;
        color: var(--color-text-muted, #7a6f63);
      }

      /* Memorable Moments */
      .music-dashboard__moments {
        display: flex;
        flex-direction: column;
        gap: var(--space-3, 12px);
      }

      .music-dashboard__moment {
        display: flex;
        align-items: flex-start;
        gap: var(--space-3, 12px);
        padding: var(--space-3, 12px);
        background: var(--color-background-subtle, #f5f2ed);
        border-radius: var(--radius-lg, 12px);
      }

      .music-dashboard__moment-icon {
        font-size: 1.5rem;
        flex-shrink: 0;
      }

      .music-dashboard__moment-content {
        flex: 1;
      }

      .music-dashboard__moment-title {
        display: block;
        font-weight: 600;
        font-size: 0.85rem;
        color: var(--color-text-secondary, #5c5248);
        margin-bottom: var(--space-1, 4px);
      }

      .music-dashboard__moment-value {
        display: block;
        font-size: 0.9rem;
        color: var(--color-text-primary, #2c2520);
        font-weight: 500;
        margin-bottom: var(--space-1, 4px);
      }

      .music-dashboard__moment-note {
        font-size: 0.8rem;
        color: var(--color-text-muted, #7a6f63);
        font-style: italic;
      }

      /* Persona Stats */
      .music-dashboard__persona-stats {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
      }

      .music-dashboard__persona-stat {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--space-2, 8px) var(--space-3, 12px);
        background: var(--color-background-subtle, #f5f2ed);
        border-radius: var(--radius-md, 8px);
      }

      .music-dashboard__persona-name {
        font-weight: 600;
        font-size: 0.9rem;
        color: var(--color-text-primary, #2c2520);
      }

      .music-dashboard__persona-games {
        font-size: 0.85rem;
        color: var(--color-text-muted, #7a6f63);
      }

      /* Empty & Loading States */
      .music-dashboard__empty,
      .music-dashboard__loading,
      .music-dashboard__error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--space-8, 48px) var(--space-4, 16px);
        text-align: center;
      }

      .music-dashboard__empty-icon,
      .music-dashboard__error-icon {
        width: 64px;
        height: 64px;
        color: var(--color-text-secondary);
        margin-bottom: var(--space-4, 16px);
        opacity: 0.5;
      }

      .music-dashboard__empty h3 {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--color-text-primary, #2c2520);
        margin: 0 0 var(--space-2, 8px) 0;
      }

      .music-dashboard__empty p,
      .music-dashboard__error-title {
        font-size: 0.95rem;
        color: var(--color-text-secondary, #5c5248);
        margin: 0 0 var(--space-2, 8px) 0;
        line-height: 1.5;
      }

      .music-dashboard__empty-hint,
      .music-dashboard__error-hint {
        font-size: 0.85rem;
        color: var(--color-text-muted, #7a6f63);
        margin-bottom: var(--space-4, 16px);
      }

      .music-dashboard__cta {
        padding: var(--space-3, 12px) var(--space-5, 20px);
        background: var(--persona-primary, #4a6741);
        color: white;
        font-weight: 600;
        font-size: 0.9rem;
        border: none;
        border-radius: var(--radius-full, 50px);
        cursor: pointer;
        transition: transform ${DURATION.FAST}ms ${EASING.STANDARD},
                    box-shadow ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .music-dashboard__cta:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(74, 103, 65, 0.3);
      }

      .music-dashboard__loading-spinner {
        width: 40px;
        height: 40px;
        border: 3px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08));
        border-top-color: var(--color-text-secondary);
        border-radius: 50%;
        animation: music-dashboard-spin 1s linear infinite;
        margin-bottom: var(--space-4, 16px);
      }

      @keyframes music-dashboard-spin {
        to { transform: rotate(360deg); }
      }

      /* Dark theme */
      @media (prefers-color-scheme: dark) {
        .music-dashboard__card {
          background: var(--color-background-elevated, #3a3530);
        }

        .music-dashboard__header {
          background: var(--color-background-subtle, #2c2825);
          border-bottom-color: var(--color-border-subtle, rgba(255, 255, 255, 0.08));
        }

        .music-dashboard__trait-bar,
        .music-dashboard__affinity-bar,
        .music-dashboard__next-bar {
          background: var(--color-background-subtle, #2c2825);
        }
      }

      /* Mobile */
      @media (max-width: 480px) {
        .music-dashboard__card {
          width: 100%;
          max-width: none;
          max-height: 100vh;
          border-radius: var(--radius-xl, 16px) var(--radius-xl, 16px) 0 0;
          margin-top: auto;
        }

        .music-dashboard__stats-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
    `;

    document.head.appendChild(this.styleElement);
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const musicDashboard = new MusicDashboardUI();

/**
 * Show the music dashboard
 */
export function showMusicDashboard(): void {
  musicDashboard.show();
}

/**
 * Initialize the music dashboard (call once at app startup)
 */
export function initMusicDashboardUI(): void {
  // Dashboard is lazy-initialized, nothing to do here
}
