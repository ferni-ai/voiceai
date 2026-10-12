/**
 * Predictions UI Component - "Predictions"
 *
 * A centered floating modal for prediction games, accuracy tracking, and history.
 * Redesigned to match the Menu/Engagement modal treatment.
 *
 * Design System Compliance:
 * - Uses CSS variables from tokens.css
 * - Uses DURATION/EASING from animation-constants.ts
 * - Uses shared components from engagement-components.ts
 * - Respects prefers-reduced-motion
 * - Centered floating modal with backdrop blur
 */

import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { formatDate, formatNumber, t } from '../i18n/index.js';
import {
  ICONS,
  injectSharedStyles,
  escapeHtml,
  renderCloseButton,
} from './engagement-components.js';
import { engagementService } from '../services/engagement.service.js';
import {
  scoredStreak,
  toneBand,
  type PredictionData,
  type ResolutionScore,
} from '../services/prediction-data.js';
import { openResolutionModal } from './prediction-resolution-modal.js';
import { metricLabel } from './prediction-resolution-copy.js';
import {
  isDemoDataEnabled,
  getDemoPredictions,
  calculateDemoPredictionAccuracy,
} from '../services/engagement-demo-data.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { playMicroExpression } from './better-than-human.ui.js';
import {
  enhancePredictionsWithNarrative,
  injectStorytellingStyles,
} from './visualization-storytelling.js';

const log = createLogger('PredictionsUI');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

/** Records actual values (keyed by metric name) and resolves to the server's score. */
export type ResolutionSubmit = (
  id: string,
  actuals: Record<string, number>
) => Promise<ResolutionScore>;

export interface PredictionsUIData {
  predictions: PredictionData[];
  accuracy: number | null;
  totalResolved: number;
  currentStreak: number;
}

// ============================================================================
// CATEGORY ICONS (Using shared icons where possible)
// ============================================================================

const CATEGORY_ICONS: Record<string, string> = {
  mood: ICONS.sunny,
  productivity: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </svg>`,
  health: ICONS.heart,
  social: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>`,
  finance: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <line x1="12" y1="1" x2="12" y2="23"/>
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
  </svg>`,
  default: ICONS.clock,
};

// ============================================================================
// PREDICTIONS UI CLASS
// ============================================================================

export class PredictionsUI {
  private container: HTMLElement | null = null;
  private panelVisible: boolean = false;
  private styleElement: HTMLStyleElement | null = null;
  private currentPredictions: PredictionData[] = [];
  private onResolutionSubmit: ResolutionSubmit | null = null;
  private hasDataLoaded: boolean = false;

  /**
   * Initialize the predictions UI
   */
  initialize(): void {
    // HMR protection
    if (this.container) return;

    // Clean up orphaned elements
    const existingPanel = document.getElementById('predictions-panel');
    if (existingPanel) existingPanel.remove();

    injectSharedStyles();
    injectStorytellingStyles(); // Enhanced narrative styles
    this.createStyles();
    this.createPanel();
  }

  /**
   * Create the predictions panel - CENTERED FLOATING MODAL
   */
  private createPanel(): void {
    this.container = document.createElement('div');
    this.container.id = 'predictions-panel';
    this.container.className = 'predictions-panel';
    this.container.setAttribute('role', 'dialog');
    this.container.setAttribute('aria-modal', 'true');
    this.container.setAttribute('aria-label', t('titles.predictions'));
    this.container.setAttribute('aria-hidden', 'true');

    this.container.innerHTML = `
      <div class="predictions-panel__backdrop"></div>
      <div class="predictions-panel__card">
        <header class="predictions-panel__header">
          <h2 class="predictions-panel__title">${t('titles.predictions')}</h2>
          ${renderCloseButton(t('accessibility.closePanel'))}
        </header>
        <div class="predictions-panel__content" id="predictions-content">
          ${this.renderEmptyState()}
        </div>
      </div>
    `;

    document.body.appendChild(this.container);

    // Bind events
    const backdrop = this.container.querySelector('.predictions-panel__backdrop');
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

  /** No predictions yet: say what the feature is and how this panel fills. */
  private renderEmptyState(): string {
    return `
      <div class="predictions-empty">
        <!-- Hero Section -->
        <div class="predictions-empty__hero">
          <div class="predictions-empty__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
          </div>
          <h3 class="predictions-empty__title">${t('predictions.title')}</h3>
          <p class="predictions-empty__subtitle">
            ${t('predictions.description')}
          </p>
        </div>

        <div class="predictions-empty__cta">
          <p class="predictions-empty__cta-text">${t('predictions.ctaText')}</p>
        </div>
      </div>
    `;
  }

  /**
   * Set callback for resolution submissions
   */
  setOnResolutionSubmit(callback: ResolutionSubmit): void {
    this.onResolutionSubmit = callback;
  }

  /**
   * Update with predictions data
   */
  update(data: PredictionsUIData): void {
    if (!this.container) return;

    // Mark data as loaded when receiving data (e.g., from LiveKit)
    this.hasDataLoaded = true;
    this.currentPredictions = data.predictions;

    const content = this.container.querySelector('#predictions-content');
    if (!content) return;

    if (data.predictions.length === 0) {
      content.innerHTML = this.renderEmptyState();
      return;
    }

    const sections: string[] = [];

    // Stats header
    sections.push(this.renderStatsHeader(data));

    // Pending predictions
    const pending = data.predictions.filter((p) => p.status === 'pending');
    if (pending.length > 0) {
      sections.push(this.renderPredictionGroup(t('predictions.activePredictions'), pending, true));
    }

    // Resolved predictions
    const resolved = data.predictions.filter((p) => p.status === 'resolved');
    if (resolved.length > 0) {
      sections.push(this.renderPredictionGroup(t('predictions.recentResults'), resolved.slice(0, 10), false));
    }

    content.innerHTML = sections.join('');

    // Bind resolve buttons
    content.querySelectorAll('.prediction-resolve-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const predictionId = (e.currentTarget as HTMLElement).dataset.predictionId;
        if (predictionId) {
          this.showResolutionModal(predictionId);
        }
      });
    });

    // Add entrance animations
    if (!prefersReducedMotion()) {
      const cards = content.querySelectorAll('.prediction-card');
      cards.forEach((card, index) => {
        (card as HTMLElement).style.animationDelay = `${index * 60}ms`;
      });
    }

    // Enhance with narrative storytelling (adds meaning to stats)
    enhancePredictionsWithNarrative(
      content as HTMLElement,
      data.accuracy,
      data.totalResolved,
      data.currentStreak
    );
  }

  /**
   * Ask for the actual values of a prediction's metrics, then show the
   * comparison the server scored.
   */
  private showResolutionModal(predictionId: string): void {
    const prediction = this.currentPredictions.find((p) => p.id === predictionId);
    const submit = this.onResolutionSubmit;
    if (!prediction || !submit) return;

    openResolutionModal({
      prediction,
      submit: (actuals) => submit(predictionId, actuals),
      onScored: (score) => this.triggerResolutionEQ(score.accuracy),
    });
  }

  /**
   * Trigger EQ micro-expression from the server's score for the resolution.
   * Better than Human: Celebrates self-awareness wins
   */
  private triggerResolutionEQ(accuracy: number): void {
    const band = toneBand(accuracy);
    // Close guess → pride for calibrated intuition; near → warmth for effort;
    // anything else → understanding (engagement is valuable).
    const expression =
      band === 'spotOn' ? 'pride_flash' : band === 'close' ? 'warmth_pulse' : 'understanding';
    trackedTimeout(() => playMicroExpression(expression), 200);
  }

  /**
   * Render stats header
   */
  private renderStatsHeader(data: PredictionsUIData): string {
    return `
      <div class="predictions-stats">
        <div class="predictions-stat">
          <span class="predictions-stat__value">${data.accuracy !== null ? formatNumber(data.accuracy / 100, { style: 'percent' }) : '--'}</span>
          <span class="predictions-stat__label">${t('predictions.accuracyLabel')}</span>
        </div>
        <div class="predictions-stat">
          <span class="predictions-stat__value">${data.totalResolved}</span>
          <span class="predictions-stat__label">${t('predictions.resolved')}</span>
        </div>
        <div class="predictions-stat">
          <span class="predictions-stat__value">${data.currentStreak}</span>
          <span class="predictions-stat__label">${t('predictions.streak')}</span>
        </div>
      </div>
    `;
  }

  /**
   * Render prediction group
   */
  private renderPredictionGroup(
    title: string,
    predictions: PredictionData[],
    isPending: boolean
  ): string {
    const items = predictions.map((p) => this.renderPredictionCard(p, isPending)).join('');

    return `
      <section class="predictions-group">
        <h3 class="predictions-group__title">${escapeHtml(title)}</h3>
        <div class="predictions-group__items">${items}</div>
      </section>
    `;
  }

  /**
   * Render prediction card
   */
  private renderPredictionCard(prediction: PredictionData, isPending: boolean): string {
    const icon = CATEGORY_ICONS[prediction.category] || CATEGORY_ICONS['default'];
    const date = formatDate(new Date(prediction.createdAt), { month: 'short', day: 'numeric' });

    let statusClass = '';
    let resultHtml = '';

    const metrics = prediction.metrics ?? [];
    if (!isPending && prediction.actualOutcome !== undefined) {
      // Status comes from the server's score; unscored results get no verdict.
      const band = typeof prediction.accuracy === 'number' ? toneBand(prediction.accuracy) : null;
      statusClass = band
        ? `prediction-card--${band === 'spotOn' ? 'accurate' : band === 'close' ? 'close' : 'off'}`
        : '';
      const score =
        typeof prediction.accuracy === 'number'
          ? ` · ${escapeHtml(t('predictionResolution.scored', { accuracy: prediction.accuracy }))}`
          : '';
      resultHtml = `
        <div class="prediction-card__result">
          <span class="prediction-card__predicted">${escapeHtml(t('predictionResolution.youGuessed', { value: prediction.userPrediction }))}</span>
          <span class="prediction-card__actual">${escapeHtml(t('predictionResolution.actual', { value: prediction.actualOutcome }))}${score}</span>
        </div>
      `;
    } else if (isPending) {
      const guesses =
        metrics.length > 0
          ? metrics.map((m) => `${metricLabel(m.key)}: ${m.predicted}`).join(' · ')
          : t('predictionResolution.youGuessed', { value: prediction.userPrediction });
      // Only predictions that carry their metric names can be scored.
      const resolveBtn =
        metrics.length > 0
          ? `<button class="prediction-resolve-btn" data-prediction-id="${escapeHtml(prediction.id)}">${escapeHtml(t('predictionResolution.record'))}</button>`
          : '';
      resultHtml = `
        <div class="prediction-card__pending">
          <span class="prediction-card__predicted">${escapeHtml(guesses)}</span>
          ${resolveBtn}
        </div>
      `;
    }

    return `
      <div class="prediction-card ${statusClass}">
        <div class="prediction-card__icon">${icon}</div>
        <div class="prediction-card__content">
          <p class="prediction-card__question">${escapeHtml(prediction.question)}</p>
          ${resultHtml}
          <span class="prediction-card__date">${date}</span>
        </div>
      </div>
    `;
  }

  /** Show the panel (fetching data if needed). Its button can beat the deferred init. */
  show(): void {
    if (!this.container) this.initialize();
    if (!this.container) return;

    this.panelVisible = true;
    this.container.classList.add('predictions-panel--visible');
    this.container.setAttribute('aria-hidden', 'false');

    // Fetch data if not already loaded
    if (!this.hasDataLoaded) {
      void this.loadData();
    }
  }

  /**
   * Load predictions data from API or demo data.
   */
  private async loadData(): Promise<void> {
    log.debug('Loading predictions data...');

    // Try to get cached data from engagement service
    const cachedPredictions = engagementService.getCachedPredictions();
    if (cachedPredictions.length > 0) {
      log.debug('Using cached predictions data');
      this.update({
        predictions: cachedPredictions,
        accuracy: engagementService.calculateAccuracy(),
        totalResolved: cachedPredictions.filter((p) => p.status === 'resolved').length,
        currentStreak: this.calculateStreak(cachedPredictions),
      });
      this.hasDataLoaded = true;
      return;
    }

    // Try to fetch from API
    const userId = localStorage.getItem('ferni_user_id');
    if (userId) {
      const predictions = await engagementService.fetchPredictions(userId);
      if (predictions.length > 0) {
        log.debug('Loaded predictions from API');
        this.update({
          predictions,
          accuracy: engagementService.calculateAccuracy(),
          totalResolved: predictions.filter((p) => p.status === 'resolved').length,
          currentStreak: this.calculateStreak(predictions),
        });
        this.hasDataLoaded = true;
        return;
      }
    }

    // Fall back to demo data if enabled
    if (isDemoDataEnabled()) {
      log.debug('Loading demo predictions data');
      const demoPredictions = getDemoPredictions();
      this.update({
        predictions: demoPredictions,
        accuracy: calculateDemoPredictionAccuracy(),
        totalResolved: demoPredictions.filter((p) => p.status === 'resolved').length,
        currentStreak: this.calculateStreak(demoPredictions),
      });
      this.hasDataLoaded = true;
      return;
    }

    // Explicitly render empty state (in case initial render failed)
    log.debug('No predictions data available, rendering empty state');
    const content = this.container?.querySelector('#predictions-content');
    if (content) {
      content.innerHTML = this.renderEmptyState();
    }
  }

  /** Consecutive well-scored predictions, from the server's scores. */
  private calculateStreak(predictions: PredictionData[]): number {
    return scoredStreak(predictions);
  }

  /**
   * Hide the panel
   */
  hide(): void {
    if (!this.container) return;

    this.panelVisible = false;
    this.container.setAttribute('aria-hidden', 'true');

    // Wait for animation before hiding
    trackedTimeout(
      () => {
        this.container?.classList.remove('predictions-panel--visible');
      },
      prefersReducedMotion() ? 0 : DURATION.NORMAL
    );
  }

  /**
   * Toggle visibility
   */
  toggle(): void {
    if (this.panelVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Create styles - CENTERED FLOATING MODAL
   */
  private createStyles(): void {
    const styleId = 'predictions-ui-styles';
    if (document.getElementById(styleId)) return;

    this.styleElement = document.createElement('style');
    this.styleElement.id = styleId;
    this.styleElement.textContent = `
      /* ========================================
         PREDICTIONS PANEL - CENTERED FLOATING MODAL
         Matches Menu/Engagement treatment
         ======================================== */

      .predictions-panel {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--ma-silence, 34px);
        opacity: 0;
        visibility: hidden;
        transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD},
                    visibility ${DURATION.NORMAL}ms ${EASING.STANDARD};
      }

      .predictions-panel--visible {
        opacity: 1;
        visibility: visible;
      }

      /* Backdrop */
      .predictions-panel__backdrop {
        position: absolute;
        inset: 0;
        background: rgba(44, 37, 32, 0.75);
      }

      /* Card */
      .predictions-panel__card {
        position: relative;
        width: 100%;
        max-width: clamp(294px, 90vw, 420px);
        max-height: 80vh;
        background: var(--color-bg-elevated, #FFFDFB);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
        border-radius: var(--radius-xl, 20px);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transform: translateY(20px) scale(0.95);
        opacity: 0;
        transition: transform ${DURATION.MODERATE}ms ${EASING.SPRING},
                    opacity ${DURATION.MODERATE}ms ${EASING.STANDARD};
      }

      .predictions-panel--visible .predictions-panel__card {
        transform: translateY(0) scale(1);
        opacity: 1;
      }

      /* Header */
      .predictions-panel__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-5, 20px) var(--space-6, 24px);
        border-bottom: 1px solid var(--color-border-subtle);
        flex-shrink: 0;
      }

      .predictions-panel__title {
        font-family: var(--font-display);
        font-size: var(--text-xl, 1.25rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0;
      }

      /* Content */
      .predictions-panel__content {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-5, 20px);
        display: flex;
        flex-direction: column;
        gap: var(--space-4, 16px);
      }

      /* Stats */
      .predictions-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--space-3, 12px);
        padding: var(--space-4, 16px);
        background: var(--color-background-secondary);
        border-radius: var(--radius-xl, 1.25rem);
      }

      .predictions-stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }

      .predictions-stat__value {
        font-family: var(--font-display);
        font-size: var(--text-2xl, 1.5rem);
        font-weight: var(--font-weight-bold, 700);
        color: var(--color-text-primary);
        line-height: 1;
      }

      .predictions-stat__label {
        font-size: var(--text-2xs, 0.625rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: var(--tracking-wide);
      }

      /* Narrative Enhancement */
      .predictions-narrative {
        grid-column: 1 / -1;
        text-align: center;
        font-family: var(--font-display);
        font-size: var(--text-base, 1rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--persona-primary, #4a6741);
        padding-bottom: var(--space-2, 8px);
        border-bottom: 1px solid var(--color-border-subtle);
        margin-bottom: var(--space-2, 8px);
      }

      .predictions-deeper {
        grid-column: 1 / -1;
        text-align: center;
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted);
        font-style: italic;
        margin: 0;
        padding-top: var(--space-2, 8px);
        border-top: 1px solid var(--color-border-subtle);
      }

      /* Groups */
      .predictions-group {
        display: flex;
        flex-direction: column;
        gap: var(--space-3, 12px);
      }

      .predictions-group__title {
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: var(--tracking-wider, 0.05em);
        margin: 0;
      }

      .predictions-group__items {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
      }

      /* Cards */
      .prediction-card {
        display: flex;
        gap: var(--space-3, 12px);
        padding: var(--space-3, 12px);
        background: var(--color-background-elevated);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-lg, 1rem);
        animation: predictionSlideIn ${DURATION.MODERATE}ms ${EASING.SPRING} forwards;
        opacity: 0;
        transform: translateY(8px);
      }

      @keyframes predictionSlideIn {
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .prediction-card--accurate {
        border-left: 3px solid var(--color-semantic-success);
      }

      .prediction-card--close {
        border-left: 3px solid var(--color-semantic-warning);
      }

      .prediction-card--off {
        border-left: 3px solid var(--color-text-dimmed);
      }

      .prediction-card__icon {
        flex-shrink: 0;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-background-tertiary);
        border-radius: var(--radius-lg, 1rem);
        color: var(--color-text-secondary);
      }

      .prediction-card__icon svg {
        width: 20px;
        height: 20px;
      }

      .prediction-card__content {
        flex: 1;
        min-width: 0;
      }

      .prediction-card__question {
        font-size: var(--text-sm);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary);
        margin: 0 0 var(--space-2, 8px) 0;
        line-height: var(--leading-snug);
      }

      .prediction-card__result,
      .prediction-card__pending {
        display: flex;
        gap: var(--space-3, 12px);
        font-size: var(--text-xs);
        margin-bottom: var(--space-1, 4px);
      }

      .prediction-card__predicted {
        color: var(--color-text-secondary);
      }

      .prediction-card__actual {
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
      }

      .prediction-card__waiting {
        color: var(--color-text-dimmed);
        font-style: italic;
      }

      .prediction-card__date {
        font-size: var(--text-2xs, 0.625rem);
        color: var(--color-text-dimmed);
      }

      /* Resolve Button */
      .prediction-resolve-btn {
        padding: var(--space-1, 4px) var(--space-3, 12px);
        font-size: var(--text-xs);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-accent-text);
        background: var(--persona-tint, var(--color-accent-subtle));
        border: none;
        border-radius: var(--radius-md, 0.5rem);
        cursor: pointer;
        transition: background ${DURATION.FAST}ms ${EASING.STANDARD},
                    transform ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .prediction-resolve-btn:hover {
        background: var(--persona-primary, var(--color-accent-primary));
        color: white;
        transform: translateY(-1px);
      }

      .prediction-resolve-btn:active {
        transform: translateY(0);
      }

      /* Resolution Modal */
      .prediction-resolution-modal {
        position: fixed;
        inset: 0;
        z-index: calc(var(--z-modal) + 10);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-4, 16px);
        opacity: 0;
        visibility: hidden;
        transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD},
                    visibility ${DURATION.NORMAL}ms ${EASING.STANDARD};
      }

      .prediction-resolution-modal--visible {
        opacity: 1;
        visibility: visible;
      }

      .prediction-resolution-modal__backdrop {
        position: absolute;
        inset: 0;
        background: rgba(44, 37, 32, 0.75);
      }

      .prediction-resolution-modal__card {
        position: relative;
        width: 100%;
        max-width: min(360px, 100%);
        background: var(--color-bg-elevated, #FFFDFB);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
        border-radius: var(--radius-xl, 20px);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
        overflow: hidden;
        transform: scale(0.95);
        opacity: 0;
        transition: transform ${DURATION.MODERATE}ms ${EASING.SPRING},
                    opacity ${DURATION.MODERATE}ms ${EASING.STANDARD};
      }

      .prediction-resolution-modal--visible .prediction-resolution-modal__card {
        transform: scale(1);
        opacity: 1;
      }

      .prediction-resolution-modal__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-4, 16px);
        border-bottom: 1px solid var(--color-border-subtle);
      }

      .prediction-resolution-modal__header h3 {
        font-family: var(--font-display);
        font-size: var(--text-lg);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0;
      }

      .prediction-resolution-modal__content {
        padding: var(--space-4, 16px);
        display: flex;
        flex-direction: column;
        gap: var(--space-3, 12px);
      }

      .prediction-resolution-modal__question {
        font-size: var(--text-sm);
        color: var(--color-text-primary);
        font-weight: var(--font-weight-medium, 500);
        margin: 0;
      }

      .prediction-resolution-modal__prediction {
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        margin: 0;
      }

      .prediction-resolution-modal__input-group {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
      }

      .prediction-resolution-modal__input-group label {
        font-size: var(--text-sm);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary);
      }

      .prediction-resolution-modal__input {
        padding: var(--space-3, 12px);
        font-size: var(--text-base);
        color: var(--color-text-primary);
        background: var(--color-background-secondary);
        border: 1px solid var(--color-border-medium);
        border-radius: var(--radius-md, 0.5rem);
        outline: none;
        transition: border-color ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .prediction-resolution-modal__input:focus {
        border-color: var(--color-accent-text);
      }

      .prediction-resolution-modal__input--error {
        border-color: var(--color-semantic-error);
        animation: shake ${DURATION.NORMAL}ms ${EASING.STANDARD};
      }

      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-4px); }
        75% { transform: translateX(4px); }
      }

      .prediction-resolution-modal__footer {
        display: flex;
        justify-content: flex-end;
        gap: var(--space-2, 8px);
        padding: var(--space-4, 16px);
        border-top: 1px solid var(--color-border-subtle);
      }

      .prediction-resolution-modal__cancel {
        padding: var(--space-2, 8px) var(--space-4, 16px);
        font-size: var(--text-sm);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-secondary);
        background: transparent;
        border: 1px solid var(--color-border-medium);
        border-radius: var(--radius-md, 0.5rem);
        cursor: pointer;
        transition: background ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .prediction-resolution-modal__cancel:hover {
        background: var(--color-background-secondary);
      }

      .prediction-resolution-modal__submit {
        padding: var(--space-2, 8px) var(--space-4, 16px);
        font-size: var(--text-sm);
        font-weight: var(--font-weight-medium, 500);
        color: white;
        background: var(--persona-primary, var(--color-accent-primary));
        border: none;
        border-radius: var(--radius-md, 0.5rem);
        cursor: pointer;
        transition: opacity ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .prediction-resolution-modal__submit:hover {
        opacity: 0.9;
      }

      .prediction-resolution-modal__submit:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      /* ========================================
         EMPTY STATE
         ======================================== */

      .predictions-empty {
        display: flex;
        flex-direction: column;
        gap: var(--space-4, 16px);
        padding: var(--space-2, 8px);
      }

      /* Hero Section */
      .predictions-empty__hero {
        text-align: center;
        padding: var(--space-4, 16px) var(--space-2, 8px);
      }

      .predictions-empty__icon {
        width: 56px;
        height: 56px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(
          135deg,
          var(--persona-tint, rgba(74, 103, 65, 0.15)),
          var(--persona-tint, rgba(74, 103, 65, 0.05))
        );
        border-radius: var(--radius-full);
        margin: 0 auto var(--space-3, 12px);
        color: var(--persona-primary, #4a6741);
        animation: iconFloat 3s ease-in-out infinite;
      }

      @keyframes iconFloat {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-4px); }
      }

      .predictions-empty__icon svg {
        width: 28px;
        height: 28px;
      }

      .predictions-empty__title {
        font-family: var(--font-display);
        font-size: var(--text-lg, 1.125rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0 0 var(--space-1, 4px) 0;
      }

      .predictions-empty__subtitle {
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary);
        margin: 0;
        line-height: var(--leading-relaxed, 1.6);
      }

      /* CTA Section */
      .predictions-empty__cta {
        text-align: center;
        padding-top: var(--space-3, 12px);
        border-top: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.06));
      }

      .predictions-empty__cta-text {
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary);
        margin: 0 0 var(--space-3, 12px) 0;
        line-height: var(--leading-relaxed, 1.6);
      }

      /* Dark Theme */
      [data-theme="midnight"] .predictions-panel__backdrop {
        background: var(--backdrop-heavy);
      }

      [data-theme="midnight"] .predictions-panel__card {
        background: var(--color-background-elevated);
        border-color: var(--color-border-medium);
      }

      [data-theme="midnight"] .predictions-stats {
        background: var(--color-background-tertiary);
      }

      [data-theme="midnight"] .prediction-card {
        background: var(--color-background-secondary);
        border-color: var(--color-border-subtle);
      }

      [data-theme="midnight"] .prediction-card__icon {
        background: var(--color-background-tertiary);
      }

      /* Dark Theme - Empty State */
      [data-theme="midnight"] .predictions-empty__icon {
        background: linear-gradient(
          135deg,
          rgba(74, 103, 65, 0.25),
          rgba(74, 103, 65, 0.1)
        );
      }

      /* Responsive */
      @media (max-width: 480px) {
        .predictions-panel {
          padding: var(--space-4, 16px);
        }

        .predictions-panel__card {
          max-height: 90vh;
          border-radius: var(--radius-xl, 1.25rem);
        }

        .predictions-panel__header {
          padding: var(--space-4, 16px);
        }
      }

      /* Reduced Motion */
      @media (prefers-reduced-motion: reduce) {
        .predictions-panel,
        .predictions-panel__card,
        .prediction-card {
          animation: none !important;
          transition: opacity ${DURATION.FAST}ms linear !important;
          transform: none !important;
        }
      }
    `;

    document.head.appendChild(this.styleElement);
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }

    if (this.styleElement) {
      this.styleElement.remove();
      this.styleElement = null;
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let predictionsUI: PredictionsUI | null = null;

export function getPredictionsUI(): PredictionsUI {
  if (!predictionsUI) {
    predictionsUI = new PredictionsUI();
  }
  return predictionsUI;
}

export function initializePredictionsUI(): void {
  const ui = getPredictionsUI();
  ui.initialize();
}

export default PredictionsUI;
