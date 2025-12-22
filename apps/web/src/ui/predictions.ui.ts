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
import { t } from '../i18n/index.js';
import {
  ICONS,
  injectSharedStyles,
  escapeHtml,
  renderCloseButton,
} from './engagement-components.js';
import { engagementService, type PredictionData } from '../services/engagement.service.js';
import { isDemoDataEnabled, getDemoPredictions, calculateDemoPredictionAccuracy } from '../services/engagement-demo-data.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { playMicroExpression } from './better-than-human.ui.js';

const log = createLogger('PredictionsUI');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

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
  private onResolutionSubmit: ((id: string, actual: number) => Promise<void>) | null = null;
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
    this.container.setAttribute('aria-label', 'Predictions');
    this.container.setAttribute('aria-hidden', 'true');

    this.container.innerHTML = `
      <div class="predictions-panel__backdrop"></div>
      <div class="predictions-panel__card">
        <header class="predictions-panel__header">
          <h2 class="predictions-panel__title">Predictions</h2>
          ${renderCloseButton('Close panel')}
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

  /**
   * Render empty state - encouraging
   */
  private renderEmptyState(): string {
    return `
      <div class="predictions-empty">
        <div class="predictions-empty__icon">
          ${ICONS.clock}
        </div>
        <h3 class="predictions-empty__title">Test Your Intuition</h3>
        <p class="predictions-empty__text">
          Prediction games help you calibrate your self-awareness. 
          Ask Ferni to start a prediction during your next conversation.
        </p>
      </div>
    `;
  }

  /**
   * Set callback for resolution submissions
   */
  setOnResolutionSubmit(callback: (id: string, actual: number) => Promise<void>): void {
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
    const pending = data.predictions.filter(p => p.status === 'pending');
    if (pending.length > 0) {
      sections.push(this.renderPredictionGroup('Active Predictions', pending, true));
    }

    // Resolved predictions
    const resolved = data.predictions.filter(p => p.status === 'resolved');
    if (resolved.length > 0) {
      sections.push(this.renderPredictionGroup('Recent Results', resolved.slice(0, 10), false));
    }

    content.innerHTML = sections.join('');

    // Bind resolve buttons
    content.querySelectorAll('.prediction-resolve-btn').forEach(btn => {
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
  }

  /**
   * Show resolution modal for a prediction
   */
  private showResolutionModal(predictionId: string): void {
    const prediction = this.currentPredictions.find(p => p.id === predictionId);
    if (!prediction) return;

    // Create modal overlay
    const modal = document.createElement('div');
    modal.className = 'prediction-resolution-modal';
    modal.innerHTML = `
      <div class="prediction-resolution-modal__backdrop"></div>
      <div class="prediction-resolution-modal__card">
        <header class="prediction-resolution-modal__header">
          <h3>Record Actual Result</h3>
          <button class="engagement-close-btn" aria-label="${t('common.close')}">
            ${ICONS.close}
          </button>
        </header>
        <div class="prediction-resolution-modal__content">
          <p class="prediction-resolution-modal__question">${escapeHtml(prediction.question)}</p>
          <p class="prediction-resolution-modal__prediction">You predicted: <strong>${prediction.userPrediction}</strong></p>
          <div class="prediction-resolution-modal__input-group">
            <label for="actual-result">What was the actual result?</label>
            <input 
              type="number" 
              id="actual-result" 
              class="prediction-resolution-modal__input"
              placeholder="${t('placeholders.enterValue')}"
              min="0"
              max="100"
            />
          </div>
        </div>
        <footer class="prediction-resolution-modal__footer">
          <button aria-label="Cancel" class="prediction-resolution-modal__cancel">Cancel</button>
          <button aria-label="Save Result" class="prediction-resolution-modal__submit engagement-btn-primary">Save Result</button>
        </footer>
      </div>
    `;

    document.body.appendChild(modal);

    // Animate in
    requestAnimationFrame(() => {
      modal.classList.add('prediction-resolution-modal--visible');
    });

    // Bind events
    const closeModal = () => {
      modal.classList.remove('prediction-resolution-modal--visible');
      trackedTimeout(() => modal.remove(), prefersReducedMotion() ? 0 : DURATION.NORMAL);
    };

    modal.querySelector('.prediction-resolution-modal__backdrop')?.addEventListener('click', closeModal);
    modal.querySelector('.engagement-close-btn')?.addEventListener('click', closeModal);
    modal.querySelector('.prediction-resolution-modal__cancel')?.addEventListener('click', closeModal);

    const input = modal.querySelector('#actual-result') as HTMLInputElement;
    const submitBtn = modal.querySelector('.prediction-resolution-modal__submit');

    submitBtn?.addEventListener('click', async () => {
      const actualValue = parseInt(input.value, 10);
      if (isNaN(actualValue)) {
        input.classList.add('prediction-resolution-modal__input--error');
        return;
      }

      if (this.onResolutionSubmit) {
        submitBtn.textContent = t('common.saving');
        (submitBtn as HTMLButtonElement).disabled = true;

        try {
          await this.onResolutionSubmit(predictionId, actualValue);

          // Trigger EQ response based on prediction accuracy
          this.triggerResolutionEQ(prediction.userPrediction, actualValue);

          closeModal();
        } catch (err) {
          submitBtn.textContent = t('common.errorRetry');
          (submitBtn as HTMLButtonElement).disabled = false;
        }
      } else {
        closeModal();
      }
    });

    // Focus input
    input.focus();
  }

  /**
   * Trigger EQ micro-expression based on prediction accuracy
   * Better than Human: Celebrates self-awareness wins
   */
  private triggerResolutionEQ(predicted: number, actual: number): void {
    const error = Math.abs(predicted - actual);

    // Priority 1: Very accurate prediction (within 10) → pride for calibrated intuition
    if (error <= 10) {
      trackedTimeout(() => playMicroExpression('pride_flash'), 200);
      return;
    }

    // Priority 2: Close prediction (within 25) → warmth for effort
    if (error <= 25) {
      trackedTimeout(() => playMicroExpression('warmth_pulse'), 200);
      return;
    }

    // Priority 3: Any resolution → understanding (engagement is valuable)
    trackedTimeout(() => playMicroExpression('understanding'), 200);
  }

  /**
   * Render stats header
   */
  private renderStatsHeader(data: PredictionsUIData): string {
    return `
      <div class="predictions-stats">
        <div class="predictions-stat">
          <span class="predictions-stat__value">${data.accuracy !== null ? data.accuracy + '%' : '--'}</span>
          <span class="predictions-stat__label">Accuracy</span>
        </div>
        <div class="predictions-stat">
          <span class="predictions-stat__value">${data.totalResolved}</span>
          <span class="predictions-stat__label">Resolved</span>
        </div>
        <div class="predictions-stat">
          <span class="predictions-stat__value">${data.currentStreak}</span>
          <span class="predictions-stat__label">Streak</span>
        </div>
      </div>
    `;
  }

  /**
   * Render prediction group
   */
  private renderPredictionGroup(title: string, predictions: PredictionData[], isPending: boolean): string {
    const items = predictions.map(p => this.renderPredictionCard(p, isPending)).join('');

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
    const date = new Date(prediction.createdAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });

    let statusClass = '';
    let resultHtml = '';

    if (!isPending && prediction.actualOutcome !== undefined) {
      const error = Math.abs(prediction.userPrediction - prediction.actualOutcome);
      statusClass = error <= 10 ? 'prediction-card--accurate' : error <= 25 ? 'prediction-card--close' : 'prediction-card--off';
      resultHtml = `
        <div class="prediction-card__result">
          <span class="prediction-card__predicted">You predicted: ${prediction.userPrediction}%</span>
          <span class="prediction-card__actual">Actual: ${prediction.actualOutcome}%</span>
        </div>
      `;
    } else if (isPending) {
      resultHtml = `
        <div class="prediction-card__pending">
          <span class="prediction-card__predicted">Your prediction: ${prediction.userPrediction}</span>
          <button aria-label="Record Actual" class="prediction-resolve-btn" data-prediction-id="${escapeHtml(prediction.id)}">
            Record Actual
          </button>
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

  /**
   * Show the panel.
   * Fetches data from API if not already loaded.
   */
  show(): void {
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
        totalResolved: cachedPredictions.filter(p => p.status === 'resolved').length,
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
          totalResolved: predictions.filter(p => p.status === 'resolved').length,
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
        totalResolved: demoPredictions.filter(p => p.status === 'resolved').length,
        currentStreak: this.calculateStreak(demoPredictions),
      });
      this.hasDataLoaded = true;
      return;
    }

    // Leave as empty state
    log.debug('No predictions data available, showing empty state');
  }

  /**
   * Calculate prediction streak from resolved predictions.
   */
  private calculateStreak(predictions: PredictionData[]): number {
    // Count consecutive accurate predictions (within 15% of actual)
    const resolved = predictions
      .filter(p => p.status === 'resolved' && p.actualOutcome !== undefined)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    let streak = 0;
    for (const pred of resolved) {
      const accuracy = pred.actualOutcome !== undefined && pred.userPrediction > 0
        ? 100 - Math.abs((pred.actualOutcome - pred.userPrediction) / pred.userPrediction * 100)
        : 0;
      if (accuracy >= 70) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }

  /**
   * Hide the panel
   */
  hide(): void {
    if (!this.container) return;

    this.panelVisible = false;
    this.container.setAttribute('aria-hidden', 'true');
    
    // Wait for animation before hiding
    trackedTimeout(() => {
      this.container?.classList.remove('predictions-panel--visible');
    }, prefersReducedMotion() ? 0 : DURATION.NORMAL);
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

      .predictions-panel--visible {
        opacity: 1;
        visibility: visible;
      }

      /* Backdrop */
      .predictions-panel__backdrop {
        position: absolute;
        inset: 0;
        background: var(--color-background-overlay);
        backdrop-filter: blur(var(--glass-blur-subtle, 8px));
      }

      /* Card */
      .predictions-panel__card {
        position: relative;
        width: 100%;
        max-width: clamp(294px, 90vw, 420px);
        max-height: 80vh;
        background: var(--color-background-elevated);
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
        z-index: calc(var(--z-modal, 1400) + 10);
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
        background: var(--backdrop-heavy);
        backdrop-filter: blur(var(--glass-blur-subtle, 8px));
      }

      .prediction-resolution-modal__card {
        position: relative;
        width: 100%;
        max-width: min(360px, 100%);
        background: var(--color-background-elevated);
        border-radius: var(--radius-xl, 1.25rem);
        box-shadow: var(--shadow-2xl);
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

      /* Empty state */
      .predictions-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: var(--space-8, 32px) var(--space-4, 16px);
      }

      .predictions-empty__icon {
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

      .predictions-empty__icon svg {
        width: 32px;
        height: 32px;
      }

      .predictions-empty__title {
        font-family: var(--font-display);
        font-size: var(--text-lg);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0 0 var(--space-2, 8px) 0;
      }

      .predictions-empty__text {
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        line-height: var(--leading-relaxed);
        max-width: min(280px, 100%);
        margin: 0;
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

      /* Responsive */
      @media (max-width: clamp(336px, 90vw, 480px)) {
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
