/**
 * CEO Coaching Dashboard UI
 *
 * A brand-aligned dashboard for visualizing CEO personal assistant data:
 * - Energy trends over time
 * - Win streaks and celebrations
 * - Blocker/decision status
 * - Gratitude feed
 * - Priorities overview
 *
 * DESIGN PRINCIPLES:
 *   - Clean, executive-friendly visualization
 *   - Warm colors aligned with Ferni brand
 *   - Golden ratio proportions for visual harmony
 *   - Accessible color contrast throughout
 *
 * SECURITY NOTE:
 *   All user-generated content is escaped via escapeHtml() before DOM insertion.
 *   This follows the same pattern as analytics-dashboard.ui.ts.
 */

import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { playMicroExpression } from './better-than-human.ui.js';

// ============================================================================
// TYPES
// ============================================================================

const { trackedTimeout } = createTimeoutTracker();

export interface CEOEnergyEntry {
  date: string;
  level: number; // 1-10
  note?: string;
}

export interface CEOWin {
  id: string;
  text: string;
  date: string;
  category?: string;
}

export interface CEOBlocker {
  id: string;
  text: string;
  status: 'active' | 'resolved';
  createdAt: string;
  resolvedAt?: string;
}

export interface CEODecision {
  id: string;
  description: string;
  status: 'pending' | 'made' | 'deferred';
  createdAt: string;
}

export interface CEOPriority {
  id: string;
  text: string;
  order: number;
  status: 'active' | 'completed';
}

export interface CEOGratitude {
  id: string;
  text: string;
  date: string;
}

export interface CEOCoachingDashboardData {
  // Overview stats
  totalWins: number;
  currentWinStreak: number;
  avgEnergyThisWeek: number;
  avgEnergyLastWeek: number;
  activeBlockers: number;
  pendingDecisions: number;

  // Trends (last 14 days)
  energyTrends: CEOEnergyEntry[];

  // Recent items
  recentWins: CEOWin[];
  blockers: CEOBlocker[];
  decisions: CEODecision[];
  priorities: CEOPriority[];
  gratitude: CEOGratitude[];

  // Insights
  bestEnergyDay: string | null; // Day of week
  topWinCategory: string | null;
  staleBlockers: number; // Blockers older than 14 days
  staleDecisions: number; // Decisions older than 14 days
}

export interface CEOCoachingDashboardUICallbacks {
  onClose?: () => void;
  onLogWin?: () => void;
  onLogEnergy?: () => void;
}

// ============================================================================
// ENERGY LEVEL COLORS
// ============================================================================

function getEnergyColor(level: number): string {
  if (level >= 8) return 'var(--color-semantic-success)';
  if (level >= 6) return 'var(--color-accent-primary)';
  if (level >= 4) return 'var(--color-semantic-warning)';
  return 'var(--color-semantic-error)';
}

function getEnergyEmoji(level: number): string {
  if (level >= 8) return '🔥';
  if (level >= 6) return '⚡';
  if (level >= 4) return '😐';
  return '😴';
}

// ============================================================================
// CEO COACHING DASHBOARD UI CLASS
// ============================================================================

class CEOCoachingDashboardUI {
  private panel: HTMLElement | null = null;
  private wrapper: HTMLElement | null = null;
  private callbacks: CEOCoachingDashboardUICallbacks = {};
  private styleElement: HTMLStyleElement | null = null;
  private isVisible = false;

  /**
   * Initialize the dashboard
   */
  initialize(): void {
    if (this.panel) return;

    // HMR protection - clean up orphaned elements
    document.querySelectorAll('.ceo-dashboard').forEach((el) => el.remove());

    this.injectStyles();
    this.createPanel();
  }

  /**
   * Set callbacks
   */
  setCallbacks(callbacks: CEOCoachingDashboardUICallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Show with data
   */
  show(data: CEOCoachingDashboardData): void {
    this.initialize();
    if (!this.panel || !this.wrapper) return;

    this.renderContent(data);
    this.panel.classList.add('ceo-dashboard--visible');
    this.isVisible = true;

    // Trigger Ferni EQ based on achievements
    this.triggerProgressEQ(data);

    // Animate charts
    if (!prefersReducedMotion()) {
      this.animateCharts();
    }
  }

  /**
   * Trigger Ferni's emotional response based on progress data.
   */
  private triggerProgressEQ(data: CEOCoachingDashboardData): void {
    // Priority 1: Win streak (5+ wins this week) → pride
    if (data.currentWinStreak >= 5) {
      trackedTimeout(() => playMicroExpression('pride_flash'), 300);
      return;
    }

    // Priority 2: High energy average (7+) → delight
    if (data.avgEnergyThisWeek >= 7) {
      trackedTimeout(() => playMicroExpression('delight_flash'), 300);
      return;
    }

    // Priority 3: Energy trending up → warmth
    if (data.avgEnergyThisWeek > data.avgEnergyLastWeek && data.avgEnergyLastWeek > 0) {
      trackedTimeout(() => playMicroExpression('warmth_pulse'), 300);
      return;
    }

    // Priority 4: Low energy or stale blockers → concern (supportive)
    if (data.avgEnergyThisWeek < 4 || data.staleBlockers > 2) {
      trackedTimeout(() => playMicroExpression('concern_show'), 400);
      return;
    }

    // Default: acknowledgment for viewing progress
    if (data.totalWins > 0) {
      trackedTimeout(() => playMicroExpression('understanding'), 400);
    }
  }

  /**
   * Show loading state
   */
  showLoading(): void {
    this.initialize();
    if (!this.panel || !this.wrapper) return;

    this.wrapper.textContent = ''; // Clear safely

    // Build header
    const header = document.createElement('header');
    header.className = 'ceo-dashboard__header';

    const title = document.createElement('h2');
    title.className = 'ceo-dashboard__title';
    title.textContent = 'CEO Dashboard';
    header.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'ceo-dashboard__actions';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'ceo-dashboard__close';
    closeBtn.setAttribute('aria-label', 'Close dashboard');
    closeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>`;
    closeBtn.addEventListener('click', () => this.hide());
    actions.appendChild(closeBtn);
    header.appendChild(actions);

    // Build loading content
    const loading = document.createElement('div');
    loading.className = 'ceo-dashboard__loading';

    const spinner = document.createElement('div');
    spinner.className = 'ceo-dashboard__loading-spinner';
    loading.appendChild(spinner);

    const loadingText = document.createElement('p');
    loadingText.className = 'ceo-dashboard__loading-text';
    loadingText.textContent = 'Loading your progress...';
    loading.appendChild(loadingText);

    this.wrapper.appendChild(header);
    this.wrapper.appendChild(loading);

    this.panel.classList.add('ceo-dashboard--visible');
    this.isVisible = true;
  }

  /**
   * Hide
   */
  hide(): void {
    if (!this.panel) return;

    this.panel.classList.remove('ceo-dashboard--visible');
    this.isVisible = false;
    this.callbacks.onClose?.();
  }

  /**
   * Toggle
   */
  toggle(data?: CEOCoachingDashboardData): void {
    if (this.isVisible) {
      this.hide();
    } else if (data) {
      this.show(data);
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private createPanel(): void {
    this.panel = document.createElement('div');
    this.panel.className = 'ceo-dashboard';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'CEO Coaching Dashboard');

    this.wrapper = document.createElement('div');
    this.wrapper.className = 'ceo-dashboard__wrapper';
    this.panel.appendChild(this.wrapper);

    // Close on backdrop
    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) this.hide();
    });

    document.body.appendChild(this.panel);
  }

  private renderContent(data: CEOCoachingDashboardData): void {
    if (!this.wrapper) return;

    // Clear wrapper safely
    this.wrapper.textContent = '';

    const energyTrend = data.avgEnergyThisWeek > data.avgEnergyLastWeek ? '📈'
      : data.avgEnergyThisWeek < data.avgEnergyLastWeek ? '📉' : '➡️';

    // Build all sections using DOM methods for security
    this.wrapper.appendChild(this.buildHeader());
    this.wrapper.appendChild(this.buildOverview(data, energyTrend));
    this.wrapper.appendChild(this.buildCharts(data));
    this.wrapper.appendChild(this.buildTwoColumn(data));

    if (data.staleBlockers > 0 || data.staleDecisions > 0) {
      this.wrapper.appendChild(this.buildAlerts(data));
    }

    this.wrapper.appendChild(this.buildInsights(data));
  }

  private buildHeader(): HTMLElement {
    const header = document.createElement('header');
    header.className = 'ceo-dashboard__header';

    const title = document.createElement('h2');
    title.className = 'ceo-dashboard__title';
    title.textContent = 'CEO Dashboard';
    header.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'ceo-dashboard__actions';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'ceo-dashboard__close';
    closeBtn.setAttribute('aria-label', 'Close dashboard');
    closeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>`;
    closeBtn.addEventListener('click', () => this.hide());
    actions.appendChild(closeBtn);
    header.appendChild(actions);

    return header;
  }

  private buildOverview(data: CEOCoachingDashboardData, energyTrend: string): HTMLElement {
    const overview = document.createElement('div');
    overview.className = 'ceo-dashboard__overview';

    overview.appendChild(this.buildOverviewCard('🏆', 'Wins', data.totalWins.toString(),
      data.currentWinStreak > 0 ? `${data.currentWinStreak} streak` : ''));
    overview.appendChild(this.buildOverviewCard(getEnergyEmoji(data.avgEnergyThisWeek), 'Energy',
      data.avgEnergyThisWeek.toFixed(1), energyTrend));
    overview.appendChild(this.buildOverviewCard('🚧', 'Blockers', data.activeBlockers.toString(),
      data.staleBlockers > 0 ? `${data.staleBlockers} stale` : ''));
    overview.appendChild(this.buildOverviewCard('🤔', 'Decisions', data.pendingDecisions.toString(),
      data.staleDecisions > 0 ? `${data.staleDecisions} stale` : ''));

    return overview;
  }

  private buildOverviewCard(emoji: string, label: string, value: string, subtext: string): HTMLElement {
    const card = document.createElement('div');
    card.className = 'ceo-dashboard__card';

    const emojiEl = document.createElement('div');
    emojiEl.className = 'ceo-dashboard__card-emoji';
    emojiEl.textContent = emoji;
    card.appendChild(emojiEl);

    const valueEl = document.createElement('div');
    valueEl.className = 'ceo-dashboard__card-value';
    valueEl.textContent = value;
    card.appendChild(valueEl);

    const labelEl = document.createElement('div');
    labelEl.className = 'ceo-dashboard__card-label';
    labelEl.textContent = label;
    card.appendChild(labelEl);

    if (subtext) {
      const subtextEl = document.createElement('div');
      subtextEl.className = 'ceo-dashboard__card-subtext';
      subtextEl.textContent = subtext;
      card.appendChild(subtextEl);
    }

    return card;
  }

  private buildCharts(data: CEOCoachingDashboardData): HTMLElement {
    const charts = document.createElement('div');
    charts.className = 'ceo-dashboard__charts';

    // Energy chart section
    const energySection = document.createElement('section');
    energySection.className = 'ceo-dashboard__chart-section';
    const energyTitle = document.createElement('h3');
    energyTitle.textContent = 'Energy This Week';
    energySection.appendChild(energyTitle);
    energySection.appendChild(this.buildEnergyChart(data.energyTrends));
    charts.appendChild(energySection);

    // Wins section
    const winsSection = document.createElement('section');
    winsSection.className = 'ceo-dashboard__chart-section';
    const winsTitle = document.createElement('h3');
    winsTitle.textContent = 'Recent Wins';
    winsSection.appendChild(winsTitle);
    winsSection.appendChild(this.buildWinsList(data.recentWins));
    charts.appendChild(winsSection);

    return charts;
  }

  private buildEnergyChart(trends: CEOEnergyEntry[]): HTMLElement {
    if (trends.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ceo-dashboard__chart-empty';

      const icon = document.createElement('div');
      icon.className = 'ceo-dashboard__empty-icon';
      icon.textContent = '⚡';
      empty.appendChild(icon);

      const title = document.createElement('p');
      title.className = 'ceo-dashboard__empty-title';
      title.textContent = 'No energy data yet';
      empty.appendChild(title);

      const hint = document.createElement('p');
      hint.className = 'ceo-dashboard__empty-hint';
      hint.textContent = 'Say "My energy is 7 today" to start tracking';
      empty.appendChild(hint);

      return empty;
    }

    const chart = document.createElement('div');
    chart.className = 'ceo-dashboard__energy-chart';

    const recent = trends.slice(-14);
    const maxValue = 10;

    recent.forEach((t, i) => {
      const height = (t.level / maxValue) * 100;
      const color = getEnergyColor(t.level);
      const day = new Date(t.date).toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1);

      const bar = document.createElement('div');
      bar.className = 'ceo-dashboard__energy-bar';
      bar.style.setProperty('--bar-height', `${height}%`);
      bar.style.setProperty('--bar-color', color);
      bar.style.setProperty('--bar-delay', `${i * 30}ms`);
      bar.title = `${t.level}/10 on ${t.date}`;

      const fill = document.createElement('div');
      fill.className = 'ceo-dashboard__energy-bar-fill';
      bar.appendChild(fill);

      const label = document.createElement('span');
      label.className = 'ceo-dashboard__energy-bar-label';
      label.textContent = day;
      bar.appendChild(label);

      chart.appendChild(bar);
    });

    return chart;
  }

  private buildWinsList(wins: CEOWin[]): HTMLElement {
    if (wins.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ceo-dashboard__chart-empty';

      const icon = document.createElement('div');
      icon.className = 'ceo-dashboard__empty-icon';
      icon.textContent = '🏆';
      empty.appendChild(icon);

      const title = document.createElement('p');
      title.className = 'ceo-dashboard__empty-title';
      title.textContent = 'No wins yet';
      empty.appendChild(title);

      const hint = document.createElement('p');
      hint.className = 'ceo-dashboard__empty-hint';
      hint.textContent = 'Say "I just shipped v2!" to log a win';
      empty.appendChild(hint);

      return empty;
    }

    const list = document.createElement('ul');
    list.className = 'ceo-dashboard__wins-list';

    wins.slice(0, 5).forEach((w) => {
      const item = document.createElement('li');
      item.className = 'ceo-dashboard__win-item';

      const iconEl = document.createElement('span');
      iconEl.className = 'ceo-dashboard__win-icon';
      iconEl.textContent = '✓';
      item.appendChild(iconEl);

      const textEl = document.createElement('span');
      textEl.className = 'ceo-dashboard__win-text';
      textEl.textContent = w.text; // Safe: textContent escapes HTML
      item.appendChild(textEl);

      const dateEl = document.createElement('span');
      dateEl.className = 'ceo-dashboard__win-date';
      dateEl.textContent = this.formatDate(w.date);
      item.appendChild(dateEl);

      list.appendChild(item);
    });

    return list;
  }

  private buildTwoColumn(data: CEOCoachingDashboardData): HTMLElement {
    const twoColumn = document.createElement('div');
    twoColumn.className = 'ceo-dashboard__two-column';

    // Priorities section
    const prioritiesSection = document.createElement('section');
    prioritiesSection.className = 'ceo-dashboard__section';
    const prioritiesTitle = document.createElement('h3');
    prioritiesTitle.textContent = '🎯 Top Priorities';
    prioritiesSection.appendChild(prioritiesTitle);
    prioritiesSection.appendChild(this.buildPrioritiesList(data.priorities));
    twoColumn.appendChild(prioritiesSection);

    // Gratitude section
    const gratitudeSection = document.createElement('section');
    gratitudeSection.className = 'ceo-dashboard__section';
    const gratitudeTitle = document.createElement('h3');
    gratitudeTitle.textContent = '🙏 Gratitude';
    gratitudeSection.appendChild(gratitudeTitle);
    gratitudeSection.appendChild(this.buildGratitudeList(data.gratitude));
    twoColumn.appendChild(gratitudeSection);

    return twoColumn;
  }

  private buildPrioritiesList(priorities: CEOPriority[]): HTMLElement {
    const active = priorities.filter((p) => p.status === 'active').sort((a, b) => a.order - b.order);

    if (active.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ceo-dashboard__list-empty';
      const p = document.createElement('p');
      p.textContent = 'No active priorities';
      empty.appendChild(p);
      return empty;
    }

    const list = document.createElement('ol');
    list.className = 'ceo-dashboard__priorities-list';

    active.slice(0, 3).forEach((p, i) => {
      const item = document.createElement('li');
      item.className = 'ceo-dashboard__priority-item';

      const numberEl = document.createElement('span');
      numberEl.className = 'ceo-dashboard__priority-number';
      numberEl.textContent = String(i + 1);
      item.appendChild(numberEl);

      const textEl = document.createElement('span');
      textEl.className = 'ceo-dashboard__priority-text';
      textEl.textContent = p.text; // Safe: textContent escapes HTML
      item.appendChild(textEl);

      list.appendChild(item);
    });

    return list;
  }

  private buildGratitudeList(gratitude: CEOGratitude[]): HTMLElement {
    if (gratitude.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ceo-dashboard__list-empty';
      const p = document.createElement('p');
      p.textContent = 'No gratitude logged this week';
      empty.appendChild(p);
      return empty;
    }

    const list = document.createElement('ul');
    list.className = 'ceo-dashboard__gratitude-list';

    gratitude.slice(0, 3).forEach((g) => {
      const item = document.createElement('li');
      item.className = 'ceo-dashboard__gratitude-item';

      const iconEl = document.createElement('span');
      iconEl.className = 'ceo-dashboard__gratitude-icon';
      iconEl.textContent = '🙏';
      item.appendChild(iconEl);

      const textEl = document.createElement('span');
      textEl.className = 'ceo-dashboard__gratitude-text';
      textEl.textContent = `"${g.text}"`; // Safe: textContent escapes HTML
      item.appendChild(textEl);

      list.appendChild(item);
    });

    return list;
  }

  private buildAlerts(data: CEOCoachingDashboardData): HTMLElement {
    const alerts = document.createElement('div');
    alerts.className = 'ceo-dashboard__alerts';

    if (data.staleBlockers > 0) {
      const alert = document.createElement('div');
      alert.className = 'ceo-dashboard__alert';
      alert.textContent = `⚠️ ${data.staleBlockers} blocker${data.staleBlockers > 1 ? 's' : ''} stuck 14+ days`;
      alerts.appendChild(alert);
    }

    if (data.staleDecisions > 0) {
      const alert = document.createElement('div');
      alert.className = 'ceo-dashboard__alert';
      alert.textContent = `⚠️ ${data.staleDecisions} decision${data.staleDecisions > 1 ? 's' : ''} pending 14+ days`;
      alerts.appendChild(alert);
    }

    return alerts;
  }

  private buildInsights(data: CEOCoachingDashboardData): HTMLElement {
    const section = document.createElement('div');
    section.className = 'ceo-dashboard__insights';

    const title = document.createElement('h3');
    title.textContent = '💡 Insights';
    section.appendChild(title);

    const insights: string[] = [];

    // Energy insight
    if (data.avgEnergyThisWeek > data.avgEnergyLastWeek && data.avgEnergyLastWeek > 0) {
      insights.push(`⚡ Energy up from ${data.avgEnergyLastWeek.toFixed(1)} to ${data.avgEnergyThisWeek.toFixed(1)} - great momentum!`);
    } else if (data.avgEnergyThisWeek < 5 && data.avgEnergyThisWeek > 0) {
      insights.push(`💤 Energy averaging ${data.avgEnergyThisWeek.toFixed(1)} - consider scheduling recovery time`);
    }

    if (data.bestEnergyDay) {
      insights.push(`📅 Best energy typically on ${data.bestEnergyDay}s`);
    }

    if (data.topWinCategory) {
      insights.push(`🏆 Most wins in: ${data.topWinCategory}`);
    }

    if (data.currentWinStreak >= 3) {
      insights.push(`🔥 ${data.currentWinStreak}-day win streak! Keep it going!`);
    }

    if (insights.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ceo-dashboard__insights-empty';
      const p = document.createElement('p');
      p.textContent = 'Insights will appear as you log more data';
      empty.appendChild(p);
      section.appendChild(empty);
    } else {
      const list = document.createElement('ul');
      list.className = 'ceo-dashboard__insights-list';

      insights.forEach((insight) => {
        const item = document.createElement('li');
        item.textContent = insight; // Safe: textContent escapes HTML
        list.appendChild(item);
      });

      section.appendChild(list);
    }

    return section;
  }

  private formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  private animateCharts(): void {
    trackedTimeout(() => {
      this.wrapper
        ?.querySelectorAll('.ceo-dashboard__energy-bar-fill')
        .forEach((el) => {
          (el as HTMLElement).style.height = 'var(--bar-height)';
        });
    }, DURATION.NORMAL);
  }

  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = `
      /* ========================================================================
         CEO COACHING DASHBOARD OVERLAY
         ======================================================================== */
      .ceo-dashboard {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal, 1400);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--ma-rest, 21px);
        background: rgba(44, 37, 32, 0.75);
        opacity: 0;
        visibility: hidden;
        transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD}, visibility ${DURATION.SLOW}ms;
      }

      .ceo-dashboard--visible {
        opacity: 1;
        visibility: visible;
      }

      .ceo-dashboard__wrapper {
        width: 100%;
        max-width: clamp(500px, 90vw, 720px);
        max-height: 90vh;
        overflow-y: auto;
        background: var(--color-background-elevated);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
        border-radius: var(--radius-xl, 1.5rem);
        box-shadow: var(--shadow-2xl, 0 24px 48px rgba(44, 37, 32, 0.15));
      }

      /* ========================================================================
         HEADER
         ======================================================================== */
      .ceo-dashboard__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--ma-rest, 21px) var(--ma-silence, 34px);
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .ceo-dashboard__title {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-xl, 1.25rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0;
      }

      .ceo-dashboard__close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        padding: 0;
        background: var(--color-background-tertiary);
        border: none;
        border-radius: var(--radius-full, 9999px);
        color: var(--color-text-secondary);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .ceo-dashboard__close:hover {
        background: var(--color-background-secondary);
        color: var(--color-text-primary);
      }

      .ceo-dashboard__close svg {
        width: 16px;
        height: 16px;
      }

      /* ========================================================================
         OVERVIEW CARDS
         ======================================================================== */
      .ceo-dashboard__overview {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--ma-breath, 13px);
        padding: var(--ma-rest, 21px) var(--ma-silence, 34px);
      }

      @media (max-width: 600px) {
        .ceo-dashboard__overview {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      .ceo-dashboard__card {
        text-align: center;
        padding: var(--ma-breath, 13px);
        background: var(--color-background-secondary);
        border-radius: var(--radius-lg, 0.75rem);
      }

      .ceo-dashboard__card-emoji {
        font-size: 1.5rem;
        margin-bottom: var(--space-1, 4px);
      }

      .ceo-dashboard__card-value {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-xl, 1.25rem);
        font-weight: var(--font-weight-bold, 700);
        color: var(--color-text-primary);
      }

      .ceo-dashboard__card-label {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted);
      }

      .ceo-dashboard__card-subtext {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-accent-primary);
        margin-top: var(--space-1, 4px);
      }

      /* ========================================================================
         CHARTS
         ======================================================================== */
      .ceo-dashboard__charts {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--ma-rest, 21px);
        padding: var(--ma-rest, 21px) var(--ma-silence, 34px);
      }

      @media (max-width: 600px) {
        .ceo-dashboard__charts {
          grid-template-columns: 1fr;
        }
      }

      .ceo-dashboard__chart-section {
        background: var(--color-background-secondary);
        border-radius: var(--radius-lg, 0.75rem);
        padding: var(--ma-breath, 13px);
      }

      .ceo-dashboard__chart-section h3 {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0 0 var(--ma-breath, 13px) 0;
      }

      .ceo-dashboard__chart-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: var(--ma-rest, 21px);
        min-height: 100px;
      }

      .ceo-dashboard__empty-icon {
        font-size: 2rem;
        opacity: 0.5;
        margin-bottom: var(--space-2, 8px);
      }

      .ceo-dashboard__empty-title {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-secondary);
        margin: 0 0 var(--space-1, 4px) 0;
      }

      .ceo-dashboard__empty-hint {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted);
        margin: 0;
      }

      /* Energy Chart */
      .ceo-dashboard__energy-chart {
        display: flex;
        align-items: flex-end;
        gap: 4px;
        height: 100px;
      }

      .ceo-dashboard__energy-bar {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        height: 100%;
        cursor: pointer;
      }

      .ceo-dashboard__energy-bar-fill {
        width: 100%;
        height: 0;
        background: var(--bar-color, var(--color-accent-primary));
        border-radius: var(--radius-sm, 0.25rem) var(--radius-sm, 0.25rem) 0 0;
        transition: height ${DURATION.CELEBRATION}ms ${EASING.SPRING};
        transition-delay: var(--bar-delay, 0ms);
      }

      .ceo-dashboard__energy-bar-label {
        margin-top: var(--space-1, 4px);
        font-family: var(--font-body);
        font-size: 10px;
        color: var(--color-text-muted);
      }

      /* Wins List */
      .ceo-dashboard__wins-list {
        list-style: none;
        margin: 0;
        padding: 0;
        max-height: 150px;
        overflow-y: auto;
      }

      .ceo-dashboard__win-item {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        padding: var(--space-2, 8px) 0;
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .ceo-dashboard__win-item:last-child {
        border-bottom: none;
      }

      .ceo-dashboard__win-icon {
        color: var(--color-semantic-success);
        font-weight: bold;
      }

      .ceo-dashboard__win-text {
        flex: 1;
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-primary);
      }

      .ceo-dashboard__win-date {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted);
      }

      /* ========================================================================
         TWO COLUMN SECTIONS
         ======================================================================== */
      .ceo-dashboard__two-column {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--ma-rest, 21px);
        padding: 0 var(--ma-silence, 34px) var(--ma-rest, 21px);
      }

      @media (max-width: 600px) {
        .ceo-dashboard__two-column {
          grid-template-columns: 1fr;
        }
      }

      .ceo-dashboard__section {
        background: var(--color-background-secondary);
        border-radius: var(--radius-lg, 0.75rem);
        padding: var(--ma-breath, 13px);
      }

      .ceo-dashboard__section h3 {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0 0 var(--ma-breath, 13px) 0;
      }

      .ceo-dashboard__list-empty {
        text-align: center;
        padding: var(--space-3, 12px);
        color: var(--color-text-muted);
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
      }

      .ceo-dashboard__list-empty p {
        margin: 0;
      }

      /* Priorities List */
      .ceo-dashboard__priorities-list {
        list-style: none;
        margin: 0;
        padding: 0;
        counter-reset: priority;
      }

      .ceo-dashboard__priority-item {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        padding: var(--space-2, 8px) 0;
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .ceo-dashboard__priority-item:last-child {
        border-bottom: none;
      }

      .ceo-dashboard__priority-number {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        background: var(--color-accent-primary);
        color: white;
        font-family: var(--font-display);
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-weight-bold, 700);
        border-radius: var(--radius-full, 9999px);
      }

      .ceo-dashboard__priority-text {
        flex: 1;
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-primary);
      }

      /* Gratitude List */
      .ceo-dashboard__gratitude-list {
        list-style: none;
        margin: 0;
        padding: 0;
      }

      .ceo-dashboard__gratitude-item {
        display: flex;
        align-items: flex-start;
        gap: var(--space-2, 8px);
        padding: var(--space-2, 8px) 0;
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .ceo-dashboard__gratitude-item:last-child {
        border-bottom: none;
      }

      .ceo-dashboard__gratitude-icon {
        flex-shrink: 0;
      }

      .ceo-dashboard__gratitude-text {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        font-style: italic;
        color: var(--color-text-secondary);
      }

      /* ========================================================================
         ALERTS
         ======================================================================== */
      .ceo-dashboard__alerts {
        padding: 0 var(--ma-silence, 34px) var(--ma-rest, 21px);
      }

      .ceo-dashboard__alert {
        padding: var(--space-3, 12px);
        background: var(--color-semantic-warning-bg, rgba(230, 162, 60, 0.1));
        border-left: 3px solid var(--color-semantic-warning);
        border-radius: var(--radius-md, 0.5rem);
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-primary);
        margin-bottom: var(--space-2, 8px);
      }

      .ceo-dashboard__alert:last-child {
        margin-bottom: 0;
      }

      /* ========================================================================
         INSIGHTS
         ======================================================================== */
      .ceo-dashboard__insights {
        padding: var(--ma-rest, 21px) var(--ma-silence, 34px);
        border-top: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .ceo-dashboard__insights h3 {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0 0 var(--ma-breath, 13px) 0;
      }

      .ceo-dashboard__insights-list {
        list-style: none;
        margin: 0;
        padding: 0;
      }

      .ceo-dashboard__insights-list li {
        padding: var(--space-2, 8px) 0;
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary);
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .ceo-dashboard__insights-list li:last-child {
        border-bottom: none;
      }

      .ceo-dashboard__insights-empty {
        text-align: center;
        padding: var(--space-3, 12px);
        color: var(--color-text-muted);
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
      }

      .ceo-dashboard__insights-empty p {
        margin: 0;
      }

      /* ========================================================================
         LOADING STATE
         ======================================================================== */
      .ceo-dashboard__loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--ma-vastness, 89px) var(--ma-rest, 21px);
        min-height: 200px;
      }

      .ceo-dashboard__loading-spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--color-border-subtle, rgba(44, 37, 32, 0.1));
        border-top-color: var(--color-accent-primary);
        border-radius: 50%;
        animation: ceo-spin 0.8s linear infinite;
        margin-bottom: var(--ma-breath, 13px);
      }

      @keyframes ceo-spin {
        to { transform: rotate(360deg); }
      }

      .ceo-dashboard__loading-text {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-muted);
        margin: 0;
      }

      /* ========================================================================
         DARK THEME
         ======================================================================== */
      [data-theme="midnight"] .ceo-dashboard {
        background: var(--backdrop-page);
      }

      [data-theme="midnight"] .ceo-dashboard__wrapper {
        background: var(--color-background-elevated);
      }

      [data-theme="midnight"] .ceo-dashboard__title,
      [data-theme="midnight"] .ceo-dashboard__card-value,
      [data-theme="midnight"] .ceo-dashboard__chart-section h3,
      [data-theme="midnight"] .ceo-dashboard__section h3,
      [data-theme="midnight"] .ceo-dashboard__insights h3,
      [data-theme="midnight"] .ceo-dashboard__win-text,
      [data-theme="midnight"] .ceo-dashboard__priority-text {
        color: var(--color-text-primary);
      }

      [data-theme="midnight"] .ceo-dashboard__card,
      [data-theme="midnight"] .ceo-dashboard__chart-section,
      [data-theme="midnight"] .ceo-dashboard__section {
        background: var(--color-background-secondary);
      }

      [data-theme="midnight"] .ceo-dashboard__close {
        background: var(--color-background-tertiary);
        color: var(--color-text-secondary);
      }

      [data-theme="midnight"] .ceo-dashboard__close:hover {
        color: var(--color-text-primary);
      }

      /* ========================================================================
         MOBILE RESPONSIVE
         ======================================================================== */
      @media (max-width: 480px) {
        .ceo-dashboard__wrapper {
          max-height: 95vh;
          border-radius: var(--radius-xl, 16px) var(--radius-xl, 16px) 0 0;
          margin-top: auto;
        }

        .ceo-dashboard__header {
          padding: var(--space-4, 16px);
        }

        .ceo-dashboard__overview {
          gap: var(--space-2, 8px);
          padding: var(--space-3, 12px) var(--space-4, 16px);
        }

        .ceo-dashboard__charts,
        .ceo-dashboard__two-column {
          padding: var(--space-3, 12px) var(--space-4, 16px);
        }

        .ceo-dashboard__insights,
        .ceo-dashboard__alerts {
          padding: var(--space-3, 12px) var(--space-4, 16px);
        }
      }

      /* ========================================================================
         REDUCED MOTION
         ======================================================================== */
      @media (prefers-reduced-motion: reduce) {
        .ceo-dashboard {
          transition: opacity ${DURATION.FAST}ms linear;
        }

        .ceo-dashboard__energy-bar-fill {
          transition: none;
          height: var(--bar-height);
        }
      }
    `;
    document.head.appendChild(this.styleElement);
  }

  destroy(): void {
    this.hide();
    this.panel?.remove();
    this.styleElement?.remove();
    this.panel = null;
    this.wrapper = null;
    this.styleElement = null;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: CEOCoachingDashboardUI | null = null;

export function getCEOCoachingDashboardUI(): CEOCoachingDashboardUI {
  if (!instance) {
    instance = new CEOCoachingDashboardUI();
  }
  return instance;
}

export function initCEOCoachingDashboardUI(): void {
  getCEOCoachingDashboardUI().initialize();
}

export function showCEOCoachingDashboard(data: CEOCoachingDashboardData): void {
  getCEOCoachingDashboardUI().show(data);
}

export function showCEOCoachingDashboardLoading(): void {
  getCEOCoachingDashboardUI().showLoading();
}

export function hideCEOCoachingDashboard(): void {
  getCEOCoachingDashboardUI().hide();
}

export default CEOCoachingDashboardUI;
