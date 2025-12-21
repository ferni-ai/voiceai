/**
 * Analytics Dashboard UI
 *
 * A brand-aligned dashboard for visualizing engagement progress over time.
 * Shows streak trends, mood patterns, prediction accuracy, and ritual completion.
 *
 * DESIGN PRINCIPLES:
 *   - Clean data visualization with warm colors
 *   - No overwhelming charts - focused metrics
 *   - Golden ratio proportions for visual harmony
 *   - Accessible color contrast throughout
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { playMicroExpression } from './better-than-human.ui.js';

// ============================================================================
// TYPES
// ============================================================================

// Track setTimeout calls for memory leak prevention
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

export interface StreakTrend {
  date: string;
  count: number;
  ritualId: string;
  personaId: string;
}

export interface MoodTrend {
  date: string;
  mood: 'sunny' | 'partly-cloudy' | 'cloudy' | 'rainy' | 'stormy';
  energy: 'high' | 'medium' | 'low';
}

export interface PredictionAccuracyTrend {
  date: string;
  accuracy: number;
  totalPredictions: number;
}

export interface GrowthInsight {
  id: string;
  type: string;
  area: string;
  before: string;
  after: string;
  evidence: string[];
  confidence: number;
  detectedAt: string;
  surfacedAt?: string;
  userReaction?: 'resonated' | 'neutral' | 'dismissed';
}

export interface GrowthSummary {
  totalInsights: number;
  surfacedInsights: number;
  resonatedInsights: number;
  topGrowthAreas: Array<{ area: string; count: number }>;
  recentInsights: GrowthInsight[];
  growthScore: number;
}

export interface AnalyticsDashboardData {
  // Overview stats
  totalDays: number;
  totalRituals: number;
  currentLongestStreak: number;
  averageMood: number; // 1-5 scale
  predictionAccuracy: number | null;

  // Trends (last 30 days)
  streakTrends: StreakTrend[];
  moodTrends: MoodTrend[];
  predictionTrends: PredictionAccuracyTrend[];

  // Insights
  bestDay: string | null; // Day of week
  mostConsistentRitual: string | null;
  improvementAreas: string[];

  // Growth insights (optional - loaded separately)
  growthSummary?: GrowthSummary;
  growthInsights?: GrowthInsight[];
}

export interface AnalyticsDashboardUICallbacks {
  onClose?: () => void;
  onExportData?: () => void;
}

// ============================================================================
// MOOD VALUES
// ============================================================================

const MOOD_VALUES: Record<string, number> = {
  sunny: 5,
  'partly-cloudy': 4,
  cloudy: 3,
  rainy: 2,
  stormy: 1,
};

const MOOD_COLORS: Record<string, string> = {
  sunny: 'var(--color-semantic-success)',
  'partly-cloudy': 'var(--color-accent-primary)',
  cloudy: 'var(--color-semantic-warning)',
  rainy: 'var(--color-semantic-info)',
  stormy: 'var(--color-semantic-error)',
};

// ============================================================================
// ANALYTICS DASHBOARD UI CLASS
// ============================================================================

class AnalyticsDashboardUI {
  private panel: HTMLElement | null = null;
  private wrapper: HTMLElement | null = null;
  private callbacks: AnalyticsDashboardUICallbacks = {};
  private styleElement: HTMLStyleElement | null = null;
  private isVisible = false;

  /**
   * Initialize the dashboard
   */
  initialize(): void {
    if (this.panel) return;

    // HMR protection - clean up orphaned elements
    document.querySelectorAll('.analytics').forEach((el) => el.remove());

    this.injectStyles();
    this.createPanel();
  }

  /**
   * Set callbacks
   */
  setCallbacks(callbacks: AnalyticsDashboardUICallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Show with data
   */
  show(data: AnalyticsDashboardData): void {
    this.initialize();
    if (!this.panel || !this.wrapper) return;

    this.renderContent(data);
    this.panel.classList.add('analytics--visible');
    this.isVisible = true;

    // Trigger Ferni EQ based on achievements in the data
    this.triggerProgressEQ(data);

    // Animate charts
    if (!prefersReducedMotion()) {
      this.animateCharts();
    }
  }

  /**
   * Trigger Ferni's emotional response based on progress data.
   * Makes the dashboard feel like Ferni is proud of your achievements.
   */
  private triggerProgressEQ(data: AnalyticsDashboardData): void {
    // Priority 1: Long streak achievement (7+ days) → pride
    if (data.currentLongestStreak >= 7) {
      trackedTimeout(() => playMicroExpression('pride_flash'), 300);
      return;
    }

    // Priority 2: High prediction accuracy (75%+) → delight
    if (data.predictionAccuracy && data.predictionAccuracy >= 75) {
      trackedTimeout(() => playMicroExpression('delight_flash'), 300);
      return;
    }

    // Priority 3: Growth insights detected → aha moment
    if (data.growthSummary && data.growthSummary.totalInsights > 0) {
      trackedTimeout(() => playMicroExpression('aha_flash'), 300);
      return;
    }

    // Priority 4: Good engagement (10+ days active) → warmth
    if (data.totalDays >= 10) {
      trackedTimeout(() => playMicroExpression('warmth_pulse'), 300);
      return;
    }

    // Default: general positive acknowledgment for viewing progress
    if (data.totalRituals > 0 || data.totalDays > 0) {
      trackedTimeout(() => playMicroExpression('understanding'), 400);
    }
  }

  /**
   * Show loading state while data is being fetched
   */
  showLoading(): void {
    this.initialize();
    if (!this.panel || !this.wrapper) return;

    this.wrapper.innerHTML = `
      <header class="analytics__header">
        <h2 class="analytics__title">Your Journey</h2>
        <div class="analytics__actions">
          <button class="analytics__close" aria-label="${t('accessibility.closeDashboard')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </header>
      <div class="analytics__loading">
        <div class="analytics__loading-spinner"></div>
        <p class="analytics__loading-text">Loading your progress...</p>
      </div>
    `;

    this.wrapper.querySelector('.analytics__close')?.addEventListener('click', () => this.hide());
    this.panel.classList.add('analytics--visible');
    this.isVisible = true;
  }

  /**
   * Show error state if data fetch fails
   */
  showError(message = 'Unable to load your progress'): void {
    this.initialize();
    if (!this.panel || !this.wrapper) return;

    this.wrapper.innerHTML = `
      <header class="analytics__header">
        <h2 class="analytics__title">Your Journey</h2>
        <div class="analytics__actions">
          <button class="analytics__close" aria-label="${t('accessibility.closeDashboard')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </header>
      <div class="analytics__error">
        <div class="analytics__error-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4"/>
            <path d="M12 16h.01"/>
          </svg>
        </div>
        <p class="analytics__error-title">${message}</p>
        <p class="analytics__error-hint">Please try again later</p>
      </div>
    `;

    this.wrapper.querySelector('.analytics__close')?.addEventListener('click', () => this.hide());
    this.panel.classList.add('analytics--visible');
    this.isVisible = true;
  }

  /**
   * Hide
   */
  hide(): void {
    if (!this.panel) return;

    this.panel.classList.remove('analytics--visible');
    this.isVisible = false;
    this.callbacks.onClose?.();
  }

  /**
   * Toggle
   */
  toggle(data?: AnalyticsDashboardData): void {
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
    this.panel.className = 'analytics';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Analytics Dashboard');

    this.wrapper = document.createElement('div');
    this.wrapper.className = 'analytics__wrapper';
    this.panel.appendChild(this.wrapper);

    // Close on backdrop
    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) this.hide();
    });

    document.body.appendChild(this.panel);
  }

  private renderContent(data: AnalyticsDashboardData): void {
    if (!this.wrapper) return;

    this.wrapper.innerHTML = `
      <header class="analytics__header">
        <h2 class="analytics__title">Your Journey</h2>
        <div class="analytics__actions">
          <button class="analytics__export" aria-label="${t('accessibility.exportData')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
          <button class="analytics__close" aria-label="${t('accessibility.closeDashboard')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </header>

      <div class="analytics__overview">
        ${this.renderOverviewCard('Days Active', data.totalDays.toString(), 'calendar')}
        ${this.renderOverviewCard('Rituals Completed', data.totalRituals.toString(), 'check')}
        ${this.renderOverviewCard('Longest Streak', `${data.currentLongestStreak} days`, 'flame')}
        ${this.renderOverviewCard('Prediction Accuracy', data.predictionAccuracy ? `${data.predictionAccuracy}%` : '—', 'target')}
      </div>

      <div class="analytics__charts">
        <section class="analytics__chart-section">
          <h3>Mood Over Time</h3>
          ${this.renderMoodChart(data.moodTrends)}
        </section>

        <section class="analytics__chart-section">
          <h3>Streak Progress</h3>
          ${this.renderStreakChart(data.streakTrends)}
        </section>
      </div>

      ${
        data.predictionTrends.length > 0
          ? `
        <div class="analytics__prediction-section">
          <section class="analytics__chart-section analytics__chart-section--full">
            <div class="analytics__section-header">
              <h3>Prediction Accuracy Trend</h3>
              <span class="analytics__accuracy-badge">${data.predictionAccuracy !== null ? `${data.predictionAccuracy}% overall` : 'No data'}</span>
            </div>
            ${this.renderPredictionTrendChart(data.predictionTrends)}
          </section>
        </div>
      `
          : ''
      }

      ${data.growthSummary ? this.renderGrowthSection(data.growthSummary, data.growthInsights) : ''}

      <div class="analytics__insights">
        <h3>Insights</h3>
        ${this.renderInsightsList(data)}
      </div>
    `;

    // Bind events
    this.wrapper.querySelector('.analytics__close')?.addEventListener('click', () => this.hide());
    this.wrapper
      .querySelector('.analytics__export')
      ?.addEventListener('click', () => this.callbacks.onExportData?.());
  }

  private renderOverviewCard(label: string, value: string, icon: string): string {
    const icons: Record<string, string> = {
      calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>`,
      check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"/>
      </svg>`,
      flame: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
      </svg>`,
      target: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <circle cx="12" cy="12" r="6"/>
        <circle cx="12" cy="12" r="2"/>
      </svg>`,
    };

    return `
      <div class="analytics__card">
        <div class="analytics__card-icon">${icons[icon] || ''}</div>
        <div class="analytics__card-value">${value}</div>
        <div class="analytics__card-label">${label}</div>
      </div>
    `;
  }

  private renderMoodChart(trends: MoodTrend[]): string {
    if (trends.length === 0) {
      return `
        <div class="analytics__chart-empty">
          <div class="analytics__empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32">
              <circle cx="12" cy="12" r="10"/>
              <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
              <line x1="9" y1="9" x2="9.01" y2="9"/>
              <line x1="15" y1="9" x2="15.01" y2="9"/>
            </svg>
          </div>
          <p class="analytics__empty-title">No mood data yet</p>
          <p class="analytics__empty-hint">Do a Morning Sky Check with Ferni to start tracking</p>
        </div>
      `;
    }

    // Take last 14 days
    const recent = trends.slice(-14);
    const maxValue = 5;

    return `
      <div class="analytics__mood-chart">
        ${recent
          .map((t, i) => {
            const value = MOOD_VALUES[t.mood] || 3;
            const height = (value / maxValue) * 100;
            const color = MOOD_COLORS[t.mood] || 'var(--color-text-muted)';
            const day = new Date(t.date)
              .toLocaleDateString('en-US', { weekday: 'short' })
              .slice(0, 1);

            return `
            <div class="analytics__mood-bar" style="--bar-height: ${height}%; --bar-color: ${color}; --bar-delay: ${i * 30}ms">
              <div class="analytics__mood-bar-fill"></div>
              <span class="analytics__mood-bar-label">${day}</span>
            </div>
          `;
          })
          .join('')}
      </div>
    `;
  }

  private renderStreakChart(trends: StreakTrend[]): string {
    if (trends.length === 0) {
      return `
        <div class="analytics__chart-empty">
          <div class="analytics__empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32">
              <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
            </svg>
          </div>
          <p class="analytics__empty-title">No streaks yet</p>
          <p class="analytics__empty-hint">Complete rituals daily to build streaks</p>
        </div>
      `;
    }

    // Group by date and sum
    const byDate = new Map<string, number>();
    for (const t of trends) {
      byDate.set(t.date, (byDate.get(t.date) || 0) + t.count);
    }

    const dates = Array.from(byDate.entries()).slice(-14);
    const maxValue = Math.max(...dates.map(([, v]) => v), 1);

    return `
      <div class="analytics__streak-chart">
        ${dates
          .map(([date, count], i) => {
            const height = (count / maxValue) * 100;
            const day = new Date(date)
              .toLocaleDateString('en-US', { weekday: 'short' })
              .slice(0, 1);

            return `
            <div class="analytics__streak-bar" style="--bar-height: ${height}%; --bar-delay: ${i * 30}ms">
              <div class="analytics__streak-bar-fill"></div>
              <span class="analytics__streak-bar-label">${day}</span>
            </div>
          `;
          })
          .join('')}
      </div>
    `;
  }

  private renderPredictionTrendChart(trends: PredictionAccuracyTrend[]): string {
    if (trends.length === 0) {
      return '<div class="analytics__chart-empty">No prediction data yet</div>';
    }

    // Take last 14 days
    const recent = trends.slice(-14);

    // Calculate SVG line chart path
    const width = 300;
    const height = 80;
    const padding = 10;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const points = recent.map((t, i) => {
      const x = padding + (i / (recent.length - 1 || 1)) * chartWidth;
      const y = padding + chartHeight - (t.accuracy / 100) * chartHeight;
      return { x, y, accuracy: t.accuracy, date: t.date };
    });

    // Create path
    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    // Create area fill path
    const areaD = `${pathD} L ${points[points.length - 1]?.x || padding} ${height - padding} L ${padding} ${height - padding} Z`;

    // Calculate average
    const avgAccuracy = Math.round(recent.reduce((sum, t) => sum + t.accuracy, 0) / recent.length);

    return `
      <div class="analytics__prediction-chart">
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
          <!-- Grid lines -->
          <line x1="${padding}" y1="${padding}" x2="${width - padding}" y2="${padding}" class="analytics__grid-line" />
          <line x1="${padding}" y1="${height / 2}" x2="${width - padding}" y2="${height / 2}" class="analytics__grid-line" />
          <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" class="analytics__grid-line" />
          
          <!-- Area fill -->
          <path d="${areaD}" class="analytics__prediction-area" />
          
          <!-- Line -->
          <path d="${pathD}" class="analytics__prediction-line" fill="none" stroke-width="2" />
          
          <!-- Points -->
          ${points
            .map(
              (p) => `
            <circle cx="${p.x}" cy="${p.y}" r="4" class="analytics__prediction-point" />
          `
            )
            .join('')}
        </svg>
        
        <div class="analytics__prediction-summary">
          <div class="analytics__prediction-avg">
            <span class="analytics__prediction-avg-value">${avgAccuracy}%</span>
            <span class="analytics__prediction-avg-label">Average</span>
          </div>
          <div class="analytics__prediction-range">
            <span>${Math.min(...recent.map((t) => t.accuracy))}% - ${Math.max(...recent.map((t) => t.accuracy))}%</span>
            <span class="analytics__prediction-range-label">Range</span>
          </div>
        </div>
      </div>
    `;
  }

  private renderInsightsList(data: AnalyticsDashboardData): string {
    const hasInsights =
      data.bestDay || data.mostConsistentRitual || data.improvementAreas.length > 0;

    if (!hasInsights) {
      return `
        <div class="analytics__insights-empty">
          <div class="analytics__empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4"/>
              <path d="M12 8h.01"/>
            </svg>
          </div>
          <p class="analytics__empty-title">Insights unlock with practice</p>
          <p class="analytics__empty-hint">Complete a few sky checks and rituals to see patterns emerge</p>
        </div>
      `;
    }

    // SVG icons for insights (Lucide-style, 2px stroke, rounded)
    const icons = {
      calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>`,
      flame: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
      </svg>`,
      lightbulb: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
        <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
        <path d="M9 18h6"/>
        <path d="M10 22h4"/>
      </svg>`,
    };

    const items: string[] = [];

    if (data.bestDay) {
      items.push(`<li class="analytics__insight-item">
        <div class="analytics__insight-icon-wrapper">${icons.calendar}</div>
        <div class="analytics__insight-content">
          <span class="analytics__insight-label">Best day</span>
          <span class="analytics__insight-value">${data.bestDay}</span>
        </div>
      </li>`);
    }

    if (data.mostConsistentRitual) {
      items.push(`<li class="analytics__insight-item">
        <div class="analytics__insight-icon-wrapper">${icons.flame}</div>
        <div class="analytics__insight-content">
          <span class="analytics__insight-label">Most consistent</span>
          <span class="analytics__insight-value">${data.mostConsistentRitual}</span>
        </div>
      </li>`);
    }

    for (const area of data.improvementAreas) {
      items.push(`<li class="analytics__insight-item analytics__insight-item--tip">
        <div class="analytics__insight-icon-wrapper analytics__insight-icon-wrapper--tip">${icons.lightbulb}</div>
        <span class="analytics__insight-text">${this.escapeHtml(area)}</span>
      </li>`);
    }

    return `<ul class="analytics__insights-list">${items.join('')}</ul>`;
  }

  private renderGrowthSection(summary: GrowthSummary, insights?: GrowthInsight[]): string {
    const growthIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
    </svg>`;

    const sparkleIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    </svg>`;

    const trendIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
      <polyline points="16 7 22 7 22 13"/>
    </svg>`;

    // Render growth score as a visual indicator
    const scoreColor =
      summary.growthScore >= 70
        ? 'var(--color-semantic-success)'
        : summary.growthScore >= 40
          ? 'var(--color-semantic-warning)'
          : 'var(--color-text-muted)';

    // Render top growth areas
    const topAreas = summary.topGrowthAreas
      .slice(0, 3)
      .map(
        (area) => `
        <div class="analytics__growth-area">
          <span class="analytics__growth-area-name">${this.escapeHtml(area.area)}</span>
          <span class="analytics__growth-area-count">${area.count} insight${area.count !== 1 ? 's' : ''}</span>
        </div>
      `
      )
      .join('');

    // Render recent insights
    const recentInsightsList =
      summary.recentInsights.length > 0
        ? summary.recentInsights
            .slice(0, 3)
            .map(
              (insight) => `
          <div class="analytics__growth-insight">
            <div class="analytics__growth-insight-icon">${sparkleIcon}</div>
            <div class="analytics__growth-insight-content">
              <div class="analytics__growth-insight-area">${this.escapeHtml(insight.area)}</div>
              <div class="analytics__growth-insight-change">
                <span class="analytics__growth-before">${this.escapeHtml(insight.before)}</span>
                <span class="analytics__growth-arrow">→</span>
                <span class="analytics__growth-after">${this.escapeHtml(insight.after)}</span>
              </div>
            </div>
            <div class="analytics__growth-insight-confidence" title="${insight.confidence}% confidence">
              ${Math.round(insight.confidence)}%
            </div>
          </div>
        `
            )
            .join('')
        : `<div class="analytics__growth-empty">
            <p>Keep going! Growth insights will appear as patterns emerge.</p>
          </div>`;

    return `
      <div class="analytics__growth-section">
        <div class="analytics__section-header">
          <h3>Your Growth</h3>
          <div class="analytics__growth-score" style="--score-color: ${scoreColor}">
            <span class="analytics__growth-score-value">${summary.growthScore}</span>
            <span class="analytics__growth-score-label">Growth Score</span>
          </div>
        </div>

        <div class="analytics__growth-stats">
          <div class="analytics__growth-stat">
            <div class="analytics__growth-stat-icon">${growthIcon}</div>
            <div class="analytics__growth-stat-value">${summary.totalInsights}</div>
            <div class="analytics__growth-stat-label">Total Insights</div>
          </div>
          <div class="analytics__growth-stat">
            <div class="analytics__growth-stat-icon">${trendIcon}</div>
            <div class="analytics__growth-stat-value">${summary.resonatedInsights}</div>
            <div class="analytics__growth-stat-label">Resonated</div>
          </div>
        </div>

        ${
          summary.topGrowthAreas.length > 0
            ? `
          <div class="analytics__growth-areas">
            <h4>Top Growth Areas</h4>
            ${topAreas}
          </div>
        `
            : ''
        }

        <div class="analytics__growth-recent">
          <h4>Recent Growth</h4>
          ${recentInsightsList}
        </div>
      </div>
    `;
  }

  private animateCharts(): void {
    // Animate bar fills
    trackedTimeout(() => {
      this.wrapper
        ?.querySelectorAll('.analytics__mood-bar-fill, .analytics__streak-bar-fill')
        .forEach((el) => {
          (el as HTMLElement).style.height = 'var(--bar-height)';
        });
    }, DURATION.NORMAL);
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = `
      /* ========================================================================
         ANALYTICS OVERLAY
         ======================================================================== */
      .analytics {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal, 1400);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--ma-rest, 21px);
        background: var(--backdrop-page);
        backdrop-filter: blur(var(--glass-blur-subtle));
        -webkit-backdrop-filter: blur(var(--glass-blur-subtle));
        opacity: 0;
        visibility: hidden;
        transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD}, visibility ${DURATION.SLOW}ms;
      }

      .analytics--visible {
        opacity: 1;
        visibility: visible;
      }

      .analytics__wrapper {
        width: 100%;
        max-width: 680px;
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
      .analytics__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--ma-rest, 21px) var(--ma-silence, 34px);
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .analytics__title {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-xl, 1.25rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0;
      }

      .analytics__actions {
        display: flex;
        gap: var(--space-2, 8px);
      }

      .analytics__export,
      .analytics__close {
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

      .analytics__export:hover,
      .analytics__close:hover {
        background: var(--color-background-secondary);
        color: var(--color-text-primary);
      }

      .analytics__export svg,
      .analytics__close svg {
        width: 16px;
        height: 16px;
      }

      /* ========================================================================
         OVERVIEW CARDS
         ======================================================================== */
      .analytics__overview {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--ma-breath, 13px);
        padding: var(--ma-rest, 21px) var(--ma-silence, 34px);
      }

      @media (max-width: 600px) {
        .analytics__overview {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      .analytics__card {
        text-align: center;
        padding: var(--ma-breath, 13px);
        background: var(--color-background-secondary);
        border-radius: var(--radius-lg, 0.75rem);
      }

      .analytics__card-icon {
        width: 24px;
        height: 24px;
        margin: 0 auto var(--space-2, 8px);
        color: var(--color-accent-primary);
      }

      .analytics__card-icon svg {
        width: 100%;
        height: 100%;
      }

      .analytics__card-value {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-xl, 1.25rem);
        font-weight: var(--font-weight-bold, 700);
        color: var(--color-text-primary);
      }

      .analytics__card-label {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted);
      }

      /* ========================================================================
         CHARTS
         ======================================================================== */
      .analytics__charts {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--ma-rest, 21px);
        padding: var(--ma-rest, 21px) var(--ma-silence, 34px);
      }

      @media (max-width: 600px) {
        .analytics__charts {
          grid-template-columns: 1fr;
        }
      }

      .analytics__chart-section {
        background: var(--color-background-secondary);
        border-radius: var(--radius-lg, 0.75rem);
        padding: var(--ma-breath, 13px);
      }

      .analytics__chart-section h3 {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0 0 var(--ma-breath, 13px) 0;
      }

      .analytics__chart-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: var(--ma-rest, 21px);
        min-height: 100px;
      }

      .analytics__empty-icon {
        color: var(--color-text-muted);
        opacity: 0.5;
        margin-bottom: var(--space-2, 8px);
      }

      .analytics__empty-title {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-secondary);
        margin: 0 0 var(--space-1, 4px) 0;
      }

      .analytics__empty-hint {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted);
        margin: 0;
      }

      .analytics__mood-chart,
      .analytics__streak-chart {
        display: flex;
        align-items: flex-end;
        gap: 4px;
        height: 100px;
      }

      .analytics__mood-bar,
      .analytics__streak-bar {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        height: 100%;
      }

      .analytics__mood-bar-fill,
      .analytics__streak-bar-fill {
        width: 100%;
        height: 0;
        background: var(--bar-color, var(--color-accent-primary));
        border-radius: var(--radius-sm, 0.25rem) var(--radius-sm, 0.25rem) 0 0;
        transition: height ${DURATION.CELEBRATION}ms ${EASING.SPRING};
        transition-delay: var(--bar-delay, 0ms);
      }

      .analytics__streak-bar-fill {
        background: var(--color-accent-primary);
      }

      .analytics__mood-bar-label,
      .analytics__streak-bar-label {
        margin-top: var(--space-1, 4px);
        font-family: var(--font-body);
        font-size: 10px;
        color: var(--color-text-muted);
      }

      /* ========================================================================
         INSIGHTS
         ======================================================================== */
      .analytics__insights {
        padding: var(--ma-rest, 21px) var(--ma-silence, 34px);
        border-top: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .analytics__insights h3 {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0 0 var(--ma-breath, 13px) 0;
      }

      .analytics__insights-list {
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .analytics__insight-item {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--space-3, 12px) 0;
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .analytics__insight-item:last-child {
        border-bottom: none;
      }

      .analytics__insight-icon-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: var(--radius-md, 0.5rem);
        background: var(--color-background-secondary);
        color: var(--color-accent-primary);
        flex-shrink: 0;
      }

      .analytics__insight-icon-wrapper--tip {
        background: var(--persona-tint, rgba(45, 90, 61, 0.1));
        color: var(--color-semantic-warning);
      }

      .analytics__insight-content {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
      }

      .analytics__insight-label {
        color: var(--color-text-muted);
        font-size: var(--text-xs, 0.75rem);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .analytics__insight-value {
        color: var(--color-text-primary);
        font-weight: var(--font-weight-medium, 500);
      }

      .analytics__insight-item--tip {
        color: var(--color-text-secondary);
      }

      .analytics__insight-text {
        flex: 1;
        line-height: 1.4;
      }

      .analytics__insights-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: var(--ma-silence, 34px) var(--ma-rest, 21px);
      }

      /* Legacy support */
      .analytics__insights-list li {
        padding: var(--space-2, 8px) 0;
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary);
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .analytics__insights-list li:last-child {
        border-bottom: none;
      }

      .analytics__insights-list strong {
        color: var(--color-text-primary);
      }

      /* ========================================================================
         PREDICTION TREND CHART
         ======================================================================== */
      .analytics__prediction-section {
        padding: 0 var(--ma-silence, 34px) var(--ma-rest, 21px);
      }

      .analytics__chart-section--full {
        grid-column: 1 / -1;
      }

      .analytics__section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--ma-breath, 13px);
      }

      .analytics__section-header h3 {
        margin: 0;
      }

      .analytics__accuracy-badge {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-accent-primary);
        background: var(--persona-tint);
        padding: var(--space-1, 4px) var(--space-2, 8px);
        border-radius: var(--radius-full, 9999px);
      }

      .analytics__prediction-chart {
        display: flex;
        flex-direction: column;
        gap: var(--ma-breath, 13px);
      }

      .analytics__prediction-chart svg {
        width: 100%;
        height: auto;
        overflow: visible;
      }

      .analytics__grid-line {
        stroke: var(--color-border-subtle, rgba(44, 37, 32, 0.1));
        stroke-dasharray: 4 4;
      }

      .analytics__prediction-area {
        fill: var(--persona-tint);
      }

      .analytics__prediction-line {
        stroke: var(--color-accent-primary);
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .analytics__prediction-point {
        fill: var(--color-background-elevated);
        stroke: var(--color-accent-primary);
        stroke-width: 2;
      }

      .analytics__prediction-summary {
        display: flex;
        justify-content: space-around;
        text-align: center;
      }

      .analytics__prediction-avg,
      .analytics__prediction-range {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .analytics__prediction-avg-value {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-xl, 1.25rem);
        font-weight: var(--font-weight-bold, 700);
        color: var(--color-accent-primary);
      }

      .analytics__prediction-avg-label,
      .analytics__prediction-range-label {
        font-family: var(--font-primary, 'Inter', sans-serif);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted);
      }

      .analytics__prediction-range span:first-child {
        font-family: var(--font-primary, 'Inter', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary);
      }

      /* ========================================================================
         LOADING STATE
         ======================================================================== */
      .analytics__loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--ma-vastness, 89px) var(--ma-rest, 21px);
        min-height: 200px;
      }

      .analytics__loading-spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--color-border-subtle, rgba(44, 37, 32, 0.1));
        border-top-color: var(--color-accent-primary);
        border-radius: 50%;
        animation: analytics-spin 0.8s linear infinite;
        margin-bottom: var(--ma-breath, 13px);
      }

      @keyframes analytics-spin {
        to { transform: rotate(360deg); }
      }

      .analytics__loading-text {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-muted);
        margin: 0;
      }

      /* ========================================================================
         ERROR STATE
         ======================================================================== */
      .analytics__error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--ma-vastness, 89px) var(--ma-rest, 21px);
        min-height: 200px;
        text-align: center;
      }

      .analytics__error-icon {
        color: var(--color-text-muted);
        opacity: 0.5;
        margin-bottom: var(--ma-breath, 13px);
      }

      .analytics__error-title {
        font-family: var(--font-body);
        font-size: var(--text-base, 1rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-secondary);
        margin: 0 0 var(--space-1, 4px) 0;
      }

      .analytics__error-hint {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-muted);
        margin: 0;
      }

      /* ========================================================================
         DARK THEME
         ======================================================================== */
      [data-theme="midnight"] .analytics {
        background: var(--backdrop-page);
      }

      [data-theme="midnight"] .analytics__wrapper {
        background: var(--color-background-elevated);
      }

      [data-theme="midnight"] .analytics__title,
      [data-theme="midnight"] .analytics__card-value,
      [data-theme="midnight"] .analytics__chart-section h3,
      [data-theme="midnight"] .analytics__insights h3,
      [data-theme="midnight"] .analytics__insights-list strong {
        color: var(--color-text-primary);
      }

      [data-theme="midnight"] .analytics__card,
      [data-theme="midnight"] .analytics__chart-section {
        background: var(--color-background-secondary);
      }

      [data-theme="midnight"] .analytics__export,
      [data-theme="midnight"] .analytics__close {
        background: var(--color-background-tertiary);
        color: var(--color-text-secondary);
      }

      [data-theme="midnight"] .analytics__export:hover,
      [data-theme="midnight"] .analytics__close:hover {
        color: var(--color-text-primary);
      }

      /* Dark Theme Text - WCAG AA Compliant */
      [data-theme="midnight"] .analytics__card-label,
      [data-theme="midnight"] .analytics__card-subtext,
      [data-theme="midnight"] .analytics__chart-label,
      [data-theme="midnight"] .analytics__bar-label {
        color: var(--color-text-muted);
      }

      /* Insights text needs high contrast for readability */
      [data-theme="midnight"] .analytics__insights-list li {
        color: var(--color-text-primary);
      }

      [data-theme="midnight"] .analytics__insights-list span {
        color: var(--color-text-secondary);
      }

      /* Dark Theme - Empty States */
      [data-theme="midnight"] .analytics__empty-title {
        color: var(--color-text-primary);
      }

      [data-theme="midnight"] .analytics__empty-hint {
        color: var(--color-text-muted);
      }

      [data-theme="midnight"] .analytics__empty-icon {
        color: var(--color-text-muted);
        opacity: 0.6;
      }

      /* Dark Theme - Prediction Chart */
      [data-theme="midnight"] .analytics__accuracy-badge {
        background: var(--persona-tint);
        color: var(--color-accent-secondary);
      }

      [data-theme="midnight"] .analytics__prediction-area {
        fill: var(--persona-tint);
      }

      [data-theme="midnight"] .analytics__prediction-line {
        stroke: var(--color-accent-secondary);
      }

      [data-theme="midnight"] .analytics__prediction-point {
        fill: var(--color-background-elevated);
        stroke: var(--color-accent-secondary);
      }

      [data-theme="midnight"] .analytics__prediction-avg-value {
        color: var(--color-accent-secondary);
      }

      [data-theme="midnight"] .analytics__prediction-range span:first-child {
        color: var(--color-text-primary);
      }

      /* Dark Theme - Insight Icons */
      [data-theme="midnight"] .analytics__insight-icon-wrapper {
        background: var(--color-background-secondary);
        color: var(--color-accent-secondary);
      }

      [data-theme="midnight"] .analytics__insight-icon-wrapper--tip {
        background: var(--persona-tint);
        color: var(--color-semantic-warning);
      }

      /* ========================================================================
         MOBILE RESPONSIVE - Small Screens
         ======================================================================== */
      @media (max-width: 480px) {
        .analytics__wrapper {
          max-height: 95vh;
          border-radius: var(--radius-xl, 16px) var(--radius-xl, 16px) 0 0;
          margin-top: auto;
        }

        .analytics__header {
          padding: var(--space-4, 16px);
        }

        .analytics__title {
          font-size: var(--text-lg, 1.125rem);
        }

        .analytics__overview {
          grid-template-columns: repeat(2, 1fr);
          gap: var(--space-2, 8px);
          padding: var(--space-3, 12px) var(--space-4, 16px);
        }

        .analytics__card {
          padding: var(--space-2, 8px);
        }

        .analytics__card-value {
          font-size: var(--text-lg, 1.125rem);
        }

        .analytics__charts {
          grid-template-columns: 1fr;
          padding: var(--space-3, 12px) var(--space-4, 16px);
        }

        .analytics__insights {
          padding: var(--space-3, 12px) var(--space-4, 16px);
        }

        .analytics__prediction-section {
          padding: 0 var(--space-4, 16px) var(--space-3, 12px);
        }
      }

      /* Very small screens (320px) */
      @media (max-width: 375px) {
        .analytics__wrapper {
          max-height: 100vh;
          border-radius: 0;
        }

        .analytics__overview {
          gap: var(--space-1, 4px);
          padding: var(--space-2, 8px) var(--space-3, 12px);
        }

        .analytics__card {
          padding: var(--space-1, 4px) var(--space-2, 8px);
        }

        .analytics__card-icon {
          width: 20px;
          height: 20px;
        }

        .analytics__card-value {
          font-size: var(--text-base, 1rem);
        }

        .analytics__card-label {
          font-size: 10px;
        }
      }

      /* ========================================================================
         GROWTH SECTION
         ======================================================================== */
      .analytics__growth-section {
        padding: var(--ma-rest, 21px) var(--ma-silence, 34px);
        border-top: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .analytics__growth-section .analytics__section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--ma-breath, 13px);
      }

      .analytics__growth-section h3 {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0;
      }

      .analytics__growth-section h4 {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin: 0 0 var(--space-2, 8px) 0;
      }

      .analytics__growth-score {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: var(--space-2, 8px) var(--space-4, 16px);
        background: var(--color-background-secondary);
        border-radius: var(--radius-lg, 0.75rem);
        border: 2px solid var(--score-color);
      }

      .analytics__growth-score-value {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-xl, 1.25rem);
        font-weight: var(--font-weight-bold, 700);
        color: var(--score-color);
      }

      .analytics__growth-score-label {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted);
      }

      .analytics__growth-stats {
        display: flex;
        gap: var(--ma-breath, 13px);
        margin-bottom: var(--ma-rest, 21px);
      }

      .analytics__growth-stat {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: var(--ma-breath, 13px);
        background: var(--color-background-secondary);
        border-radius: var(--radius-lg, 0.75rem);
      }

      .analytics__growth-stat-icon {
        color: var(--color-accent-primary);
        margin-bottom: var(--space-2, 8px);
      }

      .analytics__growth-stat-value {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-lg, 1.125rem);
        font-weight: var(--font-weight-bold, 700);
        color: var(--color-text-primary);
      }

      .analytics__growth-stat-label {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted);
      }

      .analytics__growth-areas {
        margin-bottom: var(--ma-rest, 21px);
      }

      .analytics__growth-area {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--space-2, 8px) var(--space-3, 12px);
        background: var(--color-background-secondary);
        border-radius: var(--radius-md, 0.5rem);
        margin-bottom: var(--space-2, 8px);
      }

      .analytics__growth-area:last-child {
        margin-bottom: 0;
      }

      .analytics__growth-area-name {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary);
        text-transform: capitalize;
      }

      .analytics__growth-area-count {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted);
      }

      .analytics__growth-recent {
        margin-top: var(--ma-breath, 13px);
      }

      .analytics__growth-insight {
        display: flex;
        align-items: flex-start;
        gap: var(--space-3, 12px);
        padding: var(--space-3, 12px);
        background: var(--color-background-secondary);
        border-radius: var(--radius-md, 0.5rem);
        margin-bottom: var(--space-2, 8px);
      }

      .analytics__growth-insight:last-child {
        margin-bottom: 0;
      }

      .analytics__growth-insight-icon {
        flex-shrink: 0;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--persona-tint, rgba(45, 90, 61, 0.1));
        color: var(--color-accent-primary);
        border-radius: var(--radius-md, 0.5rem);
      }

      .analytics__growth-insight-content {
        flex: 1;
        min-width: 0;
      }

      .analytics__growth-insight-area {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.03em;
        margin-bottom: var(--space-1, 4px);
      }

      .analytics__growth-insight-change {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
      }

      .analytics__growth-before {
        color: var(--color-text-muted);
        text-decoration: line-through;
        opacity: 0.7;
      }

      .analytics__growth-arrow {
        color: var(--color-accent-primary);
        font-weight: bold;
      }

      .analytics__growth-after {
        color: var(--color-text-primary);
        font-weight: var(--font-weight-medium, 500);
      }

      .analytics__growth-insight-confidence {
        flex-shrink: 0;
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-accent-primary);
        background: var(--persona-tint, rgba(45, 90, 61, 0.1));
        padding: var(--space-1, 4px) var(--space-2, 8px);
        border-radius: var(--radius-full, 9999px);
      }

      .analytics__growth-empty {
        text-align: center;
        padding: var(--ma-rest, 21px);
        color: var(--color-text-muted);
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
      }

      .analytics__growth-empty p {
        margin: 0;
      }

      /* Dark Theme - Growth Section */
      [data-theme="midnight"] .analytics__growth-section h3,
      [data-theme="midnight"] .analytics__growth-stat-value,
      [data-theme="midnight"] .analytics__growth-area-name,
      [data-theme="midnight"] .analytics__growth-after {
        color: var(--color-text-primary);
      }

      [data-theme="midnight"] .analytics__growth-stat,
      [data-theme="midnight"] .analytics__growth-area,
      [data-theme="midnight"] .analytics__growth-insight,
      [data-theme="midnight"] .analytics__growth-score {
        background: var(--color-background-secondary);
      }

      [data-theme="midnight"] .analytics__growth-insight-icon {
        background: var(--persona-tint);
        color: var(--color-accent-secondary);
      }

      [data-theme="midnight"] .analytics__growth-insight-confidence {
        background: var(--persona-tint);
        color: var(--color-accent-secondary);
      }

      [data-theme="midnight"] .analytics__growth-arrow {
        color: var(--color-accent-secondary);
      }

      /* ========================================================================
         REDUCED MOTION
         ======================================================================== */
      @media (prefers-reduced-motion: reduce) {
        .analytics {
          transition: opacity ${DURATION.FAST}ms linear;
        }

        .analytics__mood-bar-fill,
        .analytics__streak-bar-fill {
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

let instance: AnalyticsDashboardUI | null = null;

export function getAnalyticsDashboardUI(): AnalyticsDashboardUI {
  if (!instance) {
    instance = new AnalyticsDashboardUI();
  }
  return instance;
}

export function initAnalyticsDashboardUI(): void {
  getAnalyticsDashboardUI().initialize();
}

export function showAnalyticsDashboard(data: AnalyticsDashboardData): void {
  getAnalyticsDashboardUI().show(data);
}

export function showAnalyticsDashboardLoading(): void {
  getAnalyticsDashboardUI().showLoading();
}

export function showAnalyticsDashboardError(message?: string): void {
  getAnalyticsDashboardUI().showError(message);
}

export function hideAnalyticsDashboard(): void {
  getAnalyticsDashboardUI().hide();
}

export default AnalyticsDashboardUI;
