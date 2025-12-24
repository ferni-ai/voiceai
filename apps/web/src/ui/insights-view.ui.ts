/**
 * Insights View - "What I'm Noticing"
 *
 * A relationship-focused view that shows Ferni's superhuman insights
 * about the user's journey. This replaces the clinical "Daily Check-in"
 * with something that embodies our "Better than Human" promise.
 *
 * Design Philosophy:
 * - Relationship moment, not data dashboard
 * - Ferni's voice, not enterprise software
 * - Insights humans can't provide, delivered with warmth
 * - Story-focused, not metric-focused
 *
 * @module ui/insights-view
 */

import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import {
  ICONS,
  WEATHER_COPY,
  ENERGY_COPY,
  injectSharedStyles,
  escapeHtml,
  renderCloseButton,
} from './engagement-components.js';
import { createLogger } from '../utils/logger.js';
import { teaserPreview } from './teaser-preview.ui.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

const log = createLogger('InsightsView');
const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

export interface InsightData {
  /** Current emotional state */
  presence?: {
    weather: 'sunny' | 'partly-cloudy' | 'cloudy' | 'rainy' | 'stormy' | 'foggy' | 'rainbow';
    energy: 'high' | 'medium' | 'low';
    note?: string;
  };

  /** Ferni's observations - the superhuman part */
  noticing?: Array<{
    type: 'pattern' | 'growth' | 'concern' | 'celebration' | 'memory';
    insight: string;
    evidence?: string;
    personaId?: string;
  }>;

  /** Current life chapter */
  chapter?: {
    title: string;
    type: 'struggle' | 'growth' | 'triumph' | 'transition' | 'discovery';
    duration?: string;
    arcSummary?: string;
  };

  /** Things Ferni is holding for them */
  holding?: {
    commitments?: Array<{ text: string; daysAgo: number }>;
    dreams?: Array<{ dream: string; status: 'active' | 'dormant' }>;
    upcomingDates?: Array<{ name: string; daysUntil: number }>;
  };

  /** Gentle growth markers (not streak numbers) */
  growth?: {
    message: string;
    details?: string;
  };

  /** Relationship with Ferni */
  relationship?: {
    daysTogether: number;
    conversations: number;
    milestone?: string;
  };
}

// ============================================================================
// HUMANIZED COPY
// ============================================================================

const CHAPTER_COPY: Record<string, { icon: string; verb: string; encouragement: string }> = {
  struggle: {
    icon: '⛰️',
    verb: 'navigating',
    encouragement: "This is hard, and you're doing it anyway.",
  },
  growth: {
    icon: '🌱',
    verb: 'growing through',
    encouragement: 'Something beautiful is taking shape.',
  },
  triumph: {
    icon: '✨',
    verb: 'celebrating',
    encouragement: 'You did it. Take a moment to feel this.',
  },
  transition: {
    icon: '🌊',
    verb: 'moving through',
    encouragement: 'Change is hard. You have what you need.',
  },
  discovery: {
    icon: '💡',
    verb: 'discovering',
    encouragement: 'New understanding is emerging.',
  },
};

const INSIGHT_ICONS: Record<string, string> = {
  pattern: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4"/><path d="M12 18v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="m16.24 16.24 2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="m16.24 7.76 2.83-2.83"/></svg>`,
  growth: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/></svg>`,
  concern: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  celebration: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>`,
  memory: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
};

// ============================================================================
// INSIGHTS VIEW CLASS
// ============================================================================

export class InsightsView {
  private container: HTMLElement | null = null;
  private visible: boolean = false;
  private styleElement: HTMLStyleElement | null = null;
  private data: InsightData | null = null;

  initialize(): void {
    if (this.container) return;

    // HMR protection
    const existing = document.getElementById('insights-view');
    if (existing) existing.remove();

    injectSharedStyles();
    this.createStyles();
    this.createView();
  }

  private createView(): void {
    this.container = document.createElement('div');
    this.container.id = 'insights-view';
    this.container.className = 'insights-view';
    this.container.setAttribute('role', 'dialog');
    this.container.setAttribute('aria-modal', 'true');
    this.container.setAttribute('aria-label', 'What Ferni is noticing');
    this.container.setAttribute('aria-hidden', 'true');

    this.container.innerHTML = this.renderView();
    document.body.appendChild(this.container);

    this.bindEvents();
  }

  private renderView(): string {
    return `
      <div class="insights-view__backdrop"></div>
      <div class="insights-view__card">
        <header class="insights-view__header">
          <div class="insights-view__header-content">
            <span class="insights-view__eyebrow">For you</span>
            <h2 class="insights-view__title">What I'm Noticing</h2>
          </div>
          ${renderCloseButton('Close')}
        </header>
        <div class="insights-view__content" id="insights-content">
          ${this.renderContent()}
        </div>
      </div>
    `;
  }

  private renderContent(): string {
    if (!this.data) {
      return this.renderEmptyState();
    }

    const sections: string[] = [];

    // 1. Presence - Where they are right now
    if (this.data.presence) {
      sections.push(this.renderPresence(this.data.presence));
    }

    // 2. What I'm Noticing - The superhuman insights
    if (this.data.noticing && this.data.noticing.length > 0) {
      sections.push(this.renderNoticing(this.data.noticing));
    }

    // 3. Your Story - Life chapter awareness
    if (this.data.chapter) {
      sections.push(this.renderChapter(this.data.chapter));
    }

    // 4. Holding For You - Commitments & dreams
    if (this.data.holding) {
      sections.push(this.renderHolding(this.data.holding));
    }

    // 5. Growth - Gentle progress markers
    if (this.data.growth) {
      sections.push(this.renderGrowth(this.data.growth));
    }

    // 6. Journey Together - Relationship milestone
    if (this.data.relationship?.milestone) {
      sections.push(this.renderMilestone(this.data.relationship));
    }

    return sections.length > 0 ? sections.join('') : this.renderEmptyState();
  }

  // ============================================================================
  // SECTION RENDERERS
  // ============================================================================

  private renderPresence(presence: NonNullable<InsightData['presence']>): string {
    const weatherCopy = WEATHER_COPY[presence.weather];
    const energyCopy = ENERGY_COPY[presence.energy];
    const iconKey = presence.weather as keyof typeof ICONS;
    const icon = ICONS[iconKey] || ICONS.cloudy;

    return `
      <section class="insights-section insights-section--presence">
        <div class="insights-presence">
          <div class="insights-presence__icon energy-${presence.energy}">
            ${icon}
          </div>
          <div class="insights-presence__content">
            <span class="insights-presence__label">${escapeHtml(weatherCopy.label)}</span>
            <span class="insights-presence__energy">${escapeHtml(energyCopy.label)} energy</span>
          </div>
        </div>
        <p class="insights-presence__message">${escapeHtml(weatherCopy.encouragement)}</p>
        ${presence.note ? `<p class="insights-presence__note">"${escapeHtml(presence.note)}"</p>` : ''}
      </section>
    `;
  }

  private renderNoticing(insights: NonNullable<InsightData['noticing']>): string {
    const items = insights
      .slice(0, 3)
      .map(
        (insight, index) => `
        <div class="insights-notice" style="animation-delay: ${index * 100}ms">
          <div class="insights-notice__icon insights-notice__icon--${insight.type}">
            ${INSIGHT_ICONS[insight.type] || INSIGHT_ICONS.pattern}
          </div>
          <div class="insights-notice__content">
            <p class="insights-notice__text">${escapeHtml(insight.insight)}</p>
            ${insight.evidence ? `<span class="insights-notice__evidence">${escapeHtml(insight.evidence)}</span>` : ''}
          </div>
        </div>
      `
      )
      .join('');

    return `
      <section class="insights-section insights-section--noticing">
        <h3 class="insights-section__title">
          <span class="insights-section__icon">${INSIGHT_ICONS.pattern}</span>
          Patterns I'm Seeing
        </h3>
        <div class="insights-notices">
          ${items}
        </div>
      </section>
    `;
  }

  private renderChapter(chapter: NonNullable<InsightData['chapter']>): string {
    const copy = CHAPTER_COPY[chapter.type] || CHAPTER_COPY.growth;

    return `
      <section class="insights-section insights-section--chapter">
        <h3 class="insights-section__title">Your Current Chapter</h3>
        <div class="insights-chapter">
          <div class="insights-chapter__header">
            <span class="insights-chapter__badge">${copy.verb}</span>
            ${chapter.duration ? `<span class="insights-chapter__duration">${escapeHtml(chapter.duration)}</span>` : ''}
          </div>
          <h4 class="insights-chapter__title">${escapeHtml(chapter.title)}</h4>
          <p class="insights-chapter__encouragement">${escapeHtml(copy.encouragement)}</p>
          ${chapter.arcSummary ? `<p class="insights-chapter__arc">${escapeHtml(chapter.arcSummary)}</p>` : ''}
        </div>
      </section>
    `;
  }

  private renderHolding(holding: NonNullable<InsightData['holding']>): string {
    const items: string[] = [];

    // Commitments
    if (holding.commitments && holding.commitments.length > 0) {
      for (const c of holding.commitments.slice(0, 2)) {
        items.push(`
          <div class="insights-holding__item">
            <span class="insights-holding__bullet">◆</span>
            <span class="insights-holding__text">${escapeHtml(c.text)}</span>
            <span class="insights-holding__time">${c.daysAgo === 0 ? 'today' : c.daysAgo === 1 ? 'yesterday' : `${c.daysAgo} days ago`}</span>
          </div>
        `);
      }
    }

    // Dreams
    if (holding.dreams && holding.dreams.length > 0) {
      for (const d of holding.dreams.slice(0, 2)) {
        items.push(`
          <div class="insights-holding__item insights-holding__item--dream">
            <span class="insights-holding__bullet">✦</span>
            <span class="insights-holding__text">${escapeHtml(d.dream)}</span>
            ${d.status === 'dormant' ? '<span class="insights-holding__tag">been a while</span>' : ''}
          </div>
        `);
      }
    }

    // Upcoming dates
    if (holding.upcomingDates && holding.upcomingDates.length > 0) {
      for (const ud of holding.upcomingDates.slice(0, 2)) {
        items.push(`
          <div class="insights-holding__item insights-holding__item--date">
            <span class="insights-holding__bullet">○</span>
            <span class="insights-holding__text">${escapeHtml(ud.name)}</span>
            <span class="insights-holding__time">${ud.daysUntil === 0 ? 'today' : ud.daysUntil === 1 ? 'tomorrow' : `in ${ud.daysUntil} days`}</span>
          </div>
        `);
      }
    }

    if (items.length === 0) return '';

    return `
      <section class="insights-section insights-section--holding">
        <h3 class="insights-section__title">
          <span class="insights-section__icon">${INSIGHT_ICONS.memory}</span>
          What I'm Holding For You
        </h3>
        <p class="insights-holding__intro">Things you've shared that I haven't forgotten.</p>
        <div class="insights-holding__list">
          ${items.join('')}
        </div>
      </section>
    `;
  }

  private renderGrowth(growth: NonNullable<InsightData['growth']>): string {
    return `
      <section class="insights-section insights-section--growth">
        <div class="insights-growth">
          <div class="insights-growth__icon">${INSIGHT_ICONS.growth}</div>
          <div class="insights-growth__content">
            <p class="insights-growth__message">${escapeHtml(growth.message)}</p>
            ${growth.details ? `<span class="insights-growth__details">${escapeHtml(growth.details)}</span>` : ''}
          </div>
        </div>
      </section>
    `;
  }

  private renderMilestone(relationship: NonNullable<InsightData['relationship']>): string {
    return `
      <section class="insights-section insights-section--milestone">
        <div class="insights-milestone">
          <span class="insights-milestone__badge">Journey Together</span>
          <p class="insights-milestone__text">${escapeHtml(relationship.milestone || '')}</p>
          <div class="insights-milestone__stats">
            <span>${relationship.daysTogether} days</span>
            <span>•</span>
            <span>${relationship.conversations} conversations</span>
          </div>
        </div>
      </section>
    `;
  }

  private renderEmptyState(): string {
    // Use teaser preview system to show what insights WILL look like
    // This creates anticipation instead of disappointment
    return teaserPreview.patterns();
  }

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  update(data: InsightData): void {
    this.data = data;

    if (!this.container) return;

    const content = this.container.querySelector('#insights-content');
    if (!content) return;

    content.innerHTML = this.renderContent();

    // Staggered animations
    if (!prefersReducedMotion()) {
      const sections = content.querySelectorAll('.insights-section');
      sections.forEach((section, i) => {
        (section as HTMLElement).style.animationDelay = `${i * 80}ms`;
      });
    }
  }

  show(): void {
    if (!this.container) return;

    this.visible = true;
    this.container.classList.add('insights-view--visible');
    this.container.setAttribute('aria-hidden', 'false');

    // Fetch data if empty
    if (!this.data) {
      void this.loadData();
    }
  }

  hide(): void {
    if (!this.container) return;

    this.visible = false;
    this.container.setAttribute('aria-hidden', 'true');

    trackedTimeout(() => {
      this.container?.classList.remove('insights-view--visible');
    }, prefersReducedMotion() ? 0 : DURATION.NORMAL);
  }

  toggle(): void {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  isVisible(): boolean {
    return this.visible;
  }

  private async loadData(): Promise<void> {
    try {
      const userId = localStorage.getItem('ferni_user_id');
      if (!userId) {
        log.debug('No user ID, showing empty state');
        return;
      }

      const response = await fetch(`/api/insights/${userId}`);
      if (response.ok) {
        const data = await response.json();
        this.update(data);
      }
    } catch (error) {
      log.warn('Failed to load insights', error);
    }
  }

  // ============================================================================
  // EVENTS
  // ============================================================================

  private bindEvents(): void {
    if (!this.container) return;

    const backdrop = this.container.querySelector('.insights-view__backdrop');
    backdrop?.addEventListener('click', () => this.hide());

    const closeBtn = this.container.querySelector('.engagement-close-btn');
    closeBtn?.addEventListener('click', () => this.hide());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.visible) {
        this.hide();
      }
    });
  }

  // ============================================================================
  // STYLES
  // ============================================================================

  private createStyles(): void {
    const styleId = 'insights-view-styles';
    if (document.getElementById(styleId)) return;

    this.styleElement = document.createElement('style');
    this.styleElement.id = styleId;
    this.styleElement.textContent = `
      /* ========================================
         INSIGHTS VIEW - "What I'm Noticing"
         A relationship moment, not a dashboard
         ======================================== */

      .insights-view {
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

      .insights-view--visible {
        opacity: 1;
        visibility: visible;
      }

      /* Backdrop - Warm, contemplative */
      .insights-view__backdrop {
        position: absolute;
        inset: 0;
        background: var(--backdrop-heavy);
        backdrop-filter: blur(var(--glass-blur-subtle, 12px));
      }

      /* Card - Floating, centered */
      .insights-view__card {
        position: relative;
        width: 100%;
        max-width: clamp(320px, 90vw, 440px);
        max-height: 85vh;
        background: var(--color-background-elevated, #fffdfb);
        border-radius: var(--radius-2xl, 1.5rem);
        box-shadow: var(--shadow-2xl);
        border: 1px solid var(--color-border-subtle);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transform: translateY(20px) scale(0.96);
        opacity: 0;
        transition: transform ${DURATION.MODERATE}ms ${EASING.SPRING},
                    opacity ${DURATION.MODERATE}ms ${EASING.STANDARD};
      }

      .insights-view--visible .insights-view__card {
        transform: translateY(0) scale(1);
        opacity: 1;
      }

      /* Header - Warm, personal */
      .insights-view__header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        padding: var(--space-5, 20px) var(--space-6, 24px);
        border-bottom: 1px solid var(--color-border-subtle);
        flex-shrink: 0;
      }

      .insights-view__header-content {
        display: flex;
        flex-direction: column;
        gap: var(--space-1, 4px);
      }

      .insights-view__eyebrow {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--persona-primary, var(--color-accent-primary));
        text-transform: uppercase;
        letter-spacing: var(--tracking-wider, 0.1em);
      }

      .insights-view__title {
        font-family: var(--font-display);
        font-size: var(--text-xl, 1.25rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0;
        line-height: 1.2;
      }

      /* Content */
      .insights-view__content {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-4, 16px) var(--space-5, 20px);
        display: flex;
        flex-direction: column;
        gap: var(--space-4, 16px);
      }

      /* Section Base */
      .insights-section {
        opacity: 0;
        transform: translateY(10px);
        animation: insightsSectionEnter ${DURATION.MODERATE}ms ${EASING.SPRING} forwards;
      }

      @keyframes insightsSectionEnter {
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .insights-section__title {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: var(--tracking-wider, 0.05em);
        margin: 0 0 var(--space-3, 12px) 0;
      }

      .insights-section__icon {
        width: 14px;
        height: 14px;
        color: var(--color-text-dimmed);
      }

      .insights-section__icon svg {
        width: 100%;
        height: 100%;
      }

      /* ========================================
         PRESENCE SECTION
         ======================================== */

      .insights-section--presence {
        background: var(--color-background-secondary);
        border-radius: var(--radius-xl, 1.25rem);
        padding: var(--space-4, 16px);
        border: 1px solid var(--color-border-subtle);
      }

      .insights-presence {
        display: flex;
        align-items: center;
        gap: var(--space-4, 16px);
      }

      .insights-presence__icon {
        width: 52px;
        height: 52px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-background-tertiary);
        border-radius: var(--radius-xl, 1.25rem);
        color: var(--color-text-secondary);
        transition: all ${DURATION.SLOW}ms ${EASING.GENTLE};
      }

      .insights-presence__icon svg {
        width: 28px;
        height: 28px;
      }

      .insights-presence__icon.energy-high {
        color: var(--color-semantic-success);
        background: var(--color-semantic-success-glow);
      }

      .insights-presence__icon.energy-medium {
        color: var(--persona-primary, var(--color-accent-primary));
        background: var(--persona-tint, var(--color-accent-subtle));
      }

      .insights-presence__icon.energy-low {
        color: var(--color-text-dimmed);
        background: var(--color-background-tertiary);
      }

      .insights-presence__content {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .insights-presence__label {
        font-family: var(--font-body);
        font-size: var(--text-base);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary);
      }

      .insights-presence__energy {
        font-size: var(--text-sm);
        color: var(--color-text-muted);
      }

      .insights-presence__message {
        margin: var(--space-3, 12px) 0 0 0;
        font-size: var(--text-sm);
        font-style: italic;
        color: var(--color-text-secondary);
        line-height: var(--leading-relaxed);
      }

      .insights-presence__note {
        margin: var(--space-3, 12px) 0 0 0;
        padding-top: var(--space-3, 12px);
        border-top: 1px solid var(--color-border-subtle);
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
      }

      /* ========================================
         NOTICING SECTION - The superhuman part
         ======================================== */

      .insights-notices {
        display: flex;
        flex-direction: column;
        gap: var(--space-3, 12px);
      }

      .insights-notice {
        display: flex;
        gap: var(--space-3, 12px);
        padding: var(--space-3, 12px);
        background: var(--color-background-secondary);
        border-radius: var(--radius-lg, 1rem);
        border: 1px solid var(--color-border-subtle);
        opacity: 0;
        transform: translateX(-8px);
        animation: insightsNoticeEnter ${DURATION.MODERATE}ms ${EASING.SPRING} forwards;
      }

      @keyframes insightsNoticeEnter {
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      .insights-notice__icon {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        background: var(--color-background-tertiary);
        border-radius: var(--radius-md, 0.5rem);
        color: var(--color-text-muted);
      }

      .insights-notice__icon svg {
        width: 16px;
        height: 16px;
      }

      .insights-notice__icon--pattern { color: var(--persona-primary, var(--color-accent-primary)); }
      .insights-notice__icon--growth { color: var(--color-semantic-success); }
      .insights-notice__icon--concern { color: var(--color-semantic-warning); }
      .insights-notice__icon--celebration { color: var(--color-semantic-success); }
      .insights-notice__icon--memory { color: var(--persona-primary, var(--color-accent-primary)); }

      .insights-notice__content {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
        min-width: 0;
      }

      .insights-notice__text {
        font-size: var(--text-sm);
        color: var(--color-text-primary);
        line-height: var(--leading-relaxed);
        margin: 0;
      }

      .insights-notice__evidence {
        font-size: var(--text-xs);
        color: var(--color-text-dimmed);
        font-style: italic;
      }

      /* ========================================
         CHAPTER SECTION - Life story awareness
         ======================================== */

      .insights-chapter {
        background: linear-gradient(135deg, 
          var(--persona-tint, var(--color-accent-subtle)) 0%,
          var(--color-background-secondary) 100%
        );
        border-radius: var(--radius-xl, 1.25rem);
        padding: var(--space-4, 16px);
        border: 1px solid var(--color-border-subtle);
      }

      .insights-chapter__header {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        margin-bottom: var(--space-2, 8px);
      }

      .insights-chapter__badge {
        font-size: var(--text-xs);
        font-weight: var(--font-weight-medium, 500);
        color: var(--persona-primary, var(--color-accent-primary));
        background: var(--color-background-elevated);
        padding: 2px var(--space-2, 8px);
        border-radius: var(--radius-full);
        text-transform: capitalize;
      }

      .insights-chapter__duration {
        font-size: var(--text-xs);
        color: var(--color-text-dimmed);
      }

      .insights-chapter__title {
        font-family: var(--font-display);
        font-size: var(--text-lg);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0 0 var(--space-2, 8px) 0;
      }

      .insights-chapter__encouragement {
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        font-style: italic;
        margin: 0;
        line-height: var(--leading-relaxed);
      }

      .insights-chapter__arc {
        margin: var(--space-3, 12px) 0 0 0;
        padding-top: var(--space-3, 12px);
        border-top: 1px solid var(--color-border-subtle);
        font-size: var(--text-xs);
        color: var(--color-text-muted);
      }

      /* ========================================
         HOLDING SECTION - Things I remember
         ======================================== */

      .insights-holding__intro {
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        margin: 0 0 var(--space-3, 12px) 0;
        font-style: italic;
      }

      .insights-holding__list {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
      }

      .insights-holding__item {
        display: flex;
        align-items: flex-start;
        gap: var(--space-2, 8px);
        padding: var(--space-2, 8px) var(--space-3, 12px);
        background: var(--color-background-secondary);
        border-radius: var(--radius-md, 0.5rem);
        font-size: var(--text-sm);
      }

      .insights-holding__bullet {
        color: var(--persona-primary, var(--color-accent-primary));
        font-weight: var(--font-weight-bold, 700);
        flex-shrink: 0;
      }

      .insights-holding__item--dream .insights-holding__bullet {
        color: var(--color-semantic-warning);
      }

      .insights-holding__item--date .insights-holding__bullet {
        color: var(--color-text-dimmed);
      }

      .insights-holding__text {
        flex: 1;
        color: var(--color-text-primary);
      }

      .insights-holding__time {
        font-size: var(--text-xs);
        color: var(--color-text-dimmed);
        flex-shrink: 0;
      }

      .insights-holding__tag {
        font-size: var(--text-2xs, 0.625rem);
        color: var(--color-semantic-warning);
        background: var(--color-semantic-warning-glow);
        padding: 1px 6px;
        border-radius: var(--radius-full);
        flex-shrink: 0;
      }

      /* ========================================
         GROWTH SECTION - Gentle progress
         ======================================== */

      .insights-growth {
        display: flex;
        gap: var(--space-3, 12px);
        padding: var(--space-4, 16px);
        background: var(--color-semantic-success-glow);
        border-radius: var(--radius-xl, 1.25rem);
        border: 1px solid var(--color-semantic-success);
        border-opacity: 0.2;
      }

      .insights-growth__icon {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: var(--color-semantic-success);
      }

      .insights-growth__icon svg {
        width: 20px;
        height: 20px;
      }

      .insights-growth__content {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .insights-growth__message {
        font-size: var(--text-sm);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary);
        margin: 0;
        line-height: var(--leading-relaxed);
      }

      .insights-growth__details {
        font-size: var(--text-xs);
        color: var(--color-text-secondary);
      }

      /* ========================================
         MILESTONE SECTION - Journey together
         ======================================== */

      .insights-milestone {
        text-align: center;
        padding: var(--space-4, 16px);
        background: linear-gradient(135deg, 
          var(--color-background-secondary) 0%,
          var(--persona-tint, var(--color-accent-subtle)) 100%
        );
        border-radius: var(--radius-xl, 1.25rem);
        border: 1px solid var(--color-border-subtle);
      }

      .insights-milestone__badge {
        display: inline-block;
        font-size: var(--text-2xs, 0.625rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--persona-primary, var(--color-accent-primary));
        text-transform: uppercase;
        letter-spacing: var(--tracking-wider, 0.1em);
        margin-bottom: var(--space-2, 8px);
      }

      .insights-milestone__text {
        font-family: var(--font-display);
        font-size: var(--text-base);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary);
        margin: 0 0 var(--space-3, 12px) 0;
        line-height: var(--leading-relaxed);
      }

      .insights-milestone__stats {
        display: flex;
        justify-content: center;
        gap: var(--space-2, 8px);
        font-size: var(--text-xs);
        color: var(--color-text-muted);
      }

      /* ========================================
         EMPTY STATE
         ======================================== */

      .insights-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: var(--space-8, 32px) var(--space-4, 16px);
      }

      .insights-empty__icon {
        width: 64px;
        height: 64px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--persona-tint, var(--color-accent-subtle));
        border-radius: var(--radius-full);
        color: var(--persona-primary, var(--color-accent-primary));
        margin-bottom: var(--space-4, 16px);
      }

      .insights-empty__icon svg {
        width: 32px;
        height: 32px;
      }

      .insights-empty__title {
        font-family: var(--font-display);
        font-size: var(--text-lg);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0 0 var(--space-2, 8px) 0;
      }

      .insights-empty__message {
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        line-height: var(--leading-relaxed);
        max-width: min(280px, 100%);
        margin: 0 0 var(--space-5, 20px) 0;
      }

      .insights-empty__cta {
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

      .insights-empty__cta:hover {
        transform: scale(1.05);
        background: var(--persona-secondary);
      }

      .insights-empty__cta:active {
        transform: scale(0.98);
      }

      /* ========================================
         DARK THEME
         ======================================== */

      [data-theme="midnight"] .insights-view__backdrop {
        background: var(--backdrop-heavy);
      }

      [data-theme="midnight"] .insights-view__card {
        background: var(--color-background-elevated);
        border-color: var(--color-border-medium);
      }

      [data-theme="midnight"] .insights-section--presence,
      [data-theme="midnight"] .insights-notice,
      [data-theme="midnight"] .insights-holding__item {
        background: var(--color-background-tertiary);
        border-color: var(--color-border-subtle);
      }

      /* ========================================
         RESPONSIVE
         ======================================== */

      @media (max-width: 480px) {
        .insights-view {
          padding: var(--space-4, 16px);
        }

        .insights-view__card {
          max-height: 90vh;
          border-radius: var(--radius-xl, 1.25rem);
        }
      }

      /* ========================================
         REDUCED MOTION
         ======================================== */

      @media (prefers-reduced-motion: reduce) {
        .insights-view,
        .insights-view__card,
        .insights-section,
        .insights-notice {
          animation: none !important;
          transition: opacity ${DURATION.FAST}ms linear !important;
          transform: none !important;
        }

        .insights-view--visible .insights-view__card {
          transform: none !important;
        }
      }
    `;

    document.head.appendChild(this.styleElement);
  }

  destroy(): void {
    clearAllTimeouts();

    if (this.container) {
      this.container.remove();
      this.container = null;
    }

    if (this.styleElement) {
      this.styleElement.remove();
      this.styleElement = null;
    }

    this.visible = false;
    this.data = null;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let insightsView: InsightsView | null = null;

export function getInsightsView(): InsightsView {
  if (!insightsView) {
    insightsView = new InsightsView();
  }
  return insightsView;
}

export function initializeInsightsView(): void {
  const view = getInsightsView();
  view.initialize();
}

export default InsightsView;

