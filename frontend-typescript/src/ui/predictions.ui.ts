/**
 * Predictions UI Component
 *
 * Displays weekly prediction games, accuracy tracking, and prediction history.
 * Brand-aligned: warm, organic, zen aesthetic. No emojis.
 *
 * Design System Compliance:
 * - Uses CSS variables from tokens.css
 * - Uses DURATION/EASING from animation-constants.ts
 * - Respects prefers-reduced-motion
 */

import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import type { PredictionData } from '../services/engagement.service.js';

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
// CATEGORY ICONS (SVG-based, no emojis)
// ============================================================================

const CATEGORY_ICONS: Record<string, string> = {
  mood: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/>
    <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
    <line x1="9" y1="9" x2="9.01" y2="9"/>
    <line x1="15" y1="9" x2="15.01" y2="9"/>
  </svg>`,
  productivity: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </svg>`,
  health: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>`,
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
  default: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>`,
};

// ============================================================================
// PREDICTIONS UI CLASS
// ============================================================================

export class PredictionsUI {
  private container: HTMLElement | null = null;
  private panelVisible: boolean = false;

  /**
   * Initialize the predictions UI
   */
  initialize(): void {
    this.createStyles();
    this.createPanel();
  }

  /**
   * Create the predictions panel
   */
  private createPanel(): void {
    this.container = document.createElement('div');
    this.container.id = 'predictions-panel';
    this.container.className = 'predictions-panel';
    this.container.setAttribute('role', 'dialog');
    this.container.setAttribute('aria-label', 'Prediction games');
    this.container.setAttribute('aria-hidden', 'true');

    const wrapper = document.createElement('div');
    wrapper.className = 'predictions-panel__wrapper';

    // Header
    const header = document.createElement('header');
    header.className = 'predictions-panel__header';
    header.innerHTML = `
      <h2 class="predictions-panel__title">Predictions</h2>
      <button class="predictions-panel__close" aria-label="Close panel">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;

    // Content
    const content = document.createElement('div');
    content.className = 'predictions-panel__content';
    content.id = 'predictions-content';
    content.innerHTML = this.renderEmptyState();

    wrapper.appendChild(header);
    wrapper.appendChild(content);
    this.container.appendChild(wrapper);
    document.body.appendChild(this.container);

    // Bind close button
    const closeBtn = header.querySelector('.predictions-panel__close');
    closeBtn?.addEventListener('click', () => this.hide());
  }

  /**
   * Render empty state
   */
  private renderEmptyState(): string {
    return `
      <div class="predictions-empty">
        <div class="predictions-empty__icon">
          ${CATEGORY_ICONS['default']}
        </div>
        <p class="predictions-empty__title">No predictions yet</p>
        <p class="predictions-empty__text">Ask your coach to start a prediction game during your next conversation</p>
      </div>
    `;
  }

  /**
   * Update with predictions data
   */
  update(data: PredictionsUIData): void {
    if (!this.container) return;

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
      sections.push(this.renderPredictionGroup('Pending', pending, true));
    }

    // Resolved predictions
    const resolved = data.predictions.filter(p => p.status === 'resolved');
    if (resolved.length > 0) {
      sections.push(this.renderPredictionGroup('History', resolved.slice(0, 10), false));
    }

    content.innerHTML = sections.join('');

    // Add entrance animations
    if (!prefersReducedMotion()) {
      const cards = content.querySelectorAll('.prediction-card');
      cards.forEach((card, index) => {
        (card as HTMLElement).style.animationDelay = `${index * 60}ms`;
      });
    }
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
        <h3 class="predictions-group__title">${title}</h3>
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
          <span class="prediction-card__predicted">You: ${prediction.userPrediction}%</span>
          <span class="prediction-card__actual">Actual: ${prediction.actualOutcome}%</span>
        </div>
      `;
    } else if (isPending) {
      resultHtml = `
        <div class="prediction-card__pending">
          <span class="prediction-card__predicted">Your prediction: ${prediction.userPrediction}%</span>
          <span class="prediction-card__waiting">Awaiting result</span>
        </div>
      `;
    }

    return `
      <div class="prediction-card ${statusClass}">
        <div class="prediction-card__icon">${icon}</div>
        <div class="prediction-card__content">
          <p class="prediction-card__question">${this.escapeHtml(prediction.question)}</p>
          ${resultHtml}
          <span class="prediction-card__date">${date}</span>
        </div>
      </div>
    `;
  }

  /**
   * Show the panel
   */
  show(): void {
    if (!this.container) return;

    this.panelVisible = true;
    this.container.classList.add('predictions-panel--visible');
    this.container.setAttribute('aria-hidden', 'false');

    if (!prefersReducedMotion()) {
      this.container.animate(
        [
          { transform: 'translateY(100%)', opacity: 0 },
          { transform: 'translateY(0)', opacity: 1 },
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

    const animation = this.container.animate(
      [
        { transform: 'translateY(0)', opacity: 1 },
        { transform: 'translateY(100%)', opacity: 0 },
      ],
      {
        duration: DURATION.SLOW,
        easing: EASING.STANDARD,
        fill: 'forwards',
      }
    );

    animation.onfinish = () => {
      this.container?.classList.remove('predictions-panel--visible');
    };
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
   * Escape HTML
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
    const styleId = 'predictions-ui-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* ========================================
         PREDICTIONS PANEL
         ======================================== */

      .predictions-panel {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        margin: 0 auto;
        width: 420px;
        max-width: 95vw;
        max-height: 80vh;
        z-index: var(--z-modal, 1400);
        pointer-events: none;
        opacity: 0;
        transform: translateY(100%);
      }

      .predictions-panel--visible {
        pointer-events: auto;
        opacity: 1;
        transform: translateY(0);
      }

      .predictions-panel__wrapper {
        display: flex;
        flex-direction: column;
        width: 100%;
        max-height: 80vh;
        background: var(--color-background-elevated, #fffdfb);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
        border-bottom: none;
        border-radius: var(--radius-xl, 1.5rem) var(--radius-xl, 1.5rem) 0 0;
        box-shadow: var(--shadow-2xl, 0 24px 48px rgba(44, 37, 32, 0.15));
        overflow: hidden;
        box-sizing: border-box;
      }

      /* Header */
      .predictions-panel__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: var(--ma-rest, 21px) var(--ma-silence, 34px);
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
        flex-shrink: 0;
        width: 100%;
        box-sizing: border-box;
      }

      .predictions-panel__title {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-lg, 1.0625rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
        margin: 0;
        flex: 1;
      }

      .predictions-panel__close {
        display: flex;
        align-items: center;
        justify-content: center;
        /* Golden ratio: 34px button / 1.618 ≈ 21px icon */
        width: 34px;
        height: 34px;
        min-width: 34px;
        flex-shrink: 0;
        padding: 0;
        /* Visible background for Zen theme */
        background: var(--color-background-tertiary, #ebe6df);
        border: 1px solid var(--color-border-medium, rgba(44, 37, 32, 0.12));
        border-radius: var(--radius-full, 9999px);
        color: var(--color-text-primary, #2c2520);
        cursor: pointer;
        transition: all 200ms var(--ease-gentle, cubic-bezier(0.4, 0, 0.2, 1));
        box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.5),
                    0 2px 4px rgba(44, 37, 32, 0.08);
      }

      .predictions-panel__close:hover {
        background: var(--color-background-tertiary, #ebe6df);
        color: var(--color-text-primary, #2c2520);
        border-color: var(--color-border-medium, rgba(44, 37, 32, 0.10));
        transform: scale(1.05);
        box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.6),
                    0 2px 6px rgba(44, 37, 32, 0.08);
      }

      .predictions-panel__close:active {
        transform: scale(0.95);
        box-shadow: inset 0 2px 4px rgba(44, 37, 32, 0.08);
      }

      .predictions-panel__close:focus-visible {
        outline: 2px solid var(--color-accent-primary, #2d5a3d);
        outline-offset: 2px;
      }

      .predictions-panel__close svg {
        /* Golden ratio to button: 34/1.618 ≈ 21px */
        width: 16px;
        height: 16px;
        stroke-width: 2.5;
        /* Full opacity for visibility */
        opacity: 1;
        transition: opacity 200ms ease;
      }

      .predictions-panel__close:hover svg {
        opacity: 1;
      }

      /* Content */
      .predictions-panel__content {
        flex: 1;
        overflow-y: auto;
        padding: var(--ma-rest, 21px);
      }

      /* Stats */
      .predictions-stats {
        display: flex;
        justify-content: space-around;
        padding: var(--ma-pause, 13px);
        background: var(--color-background-secondary, #f5f2ed);
        border-radius: var(--radius-lg, 1rem);
        margin-bottom: var(--ma-rest, 21px);
      }

      .predictions-stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }

      .predictions-stat__value {
        font-family: var(--font-accent, 'Sora', sans-serif);
        font-size: var(--text-xl, 1.25rem);
        font-weight: var(--font-weight-bold, 700);
        color: var(--color-text-primary, #2c2520);
      }

      .predictions-stat__label {
        font-size: var(--text-2xs, 0.625rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-muted, #756a5e);
        text-transform: uppercase;
        letter-spacing: var(--tracking-wider, 0.05em);
      }

      /* Groups */
      .predictions-group {
        margin-bottom: var(--ma-rest, 21px);
      }

      .predictions-group__title {
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-muted, #756a5e);
        text-transform: uppercase;
        letter-spacing: var(--tracking-wider, 0.05em);
        margin-bottom: var(--ma-pause, 13px);
      }

      .predictions-group__items {
        display: flex;
        flex-direction: column;
        gap: var(--ma-breath, 8px);
      }

      /* Cards */
      .prediction-card {
        display: flex;
        gap: var(--ma-pause, 13px);
        padding: var(--ma-pause, 13px);
        background: var(--color-background-primary, #faf8f5);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
        border-radius: var(--radius-md, 0.75rem);
        animation: predictionSlideIn 350ms var(--ease-ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1)) forwards;
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
        border-left: 3px solid var(--color-semantic-success, #3d7a52);
      }

      .prediction-card--close {
        border-left: 3px solid var(--color-semantic-warning, #b8860b);
      }

      .prediction-card--off {
        border-left: 3px solid var(--color-text-dimmed, #a89d90);
      }

      .prediction-card__icon {
        flex-shrink: 0;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-background-tertiary, #ebe6df);
        border-radius: var(--radius-md, 0.75rem);
        color: var(--color-text-secondary, #5c544a);
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
        font-size: var(--text-sm, 0.8125rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary, #2c2520);
        margin: 0 0 var(--ma-breath, 8px) 0;
        line-height: var(--leading-snug, 1.4);
      }

      .prediction-card__result,
      .prediction-card__pending {
        display: flex;
        gap: var(--ma-pause, 13px);
        font-size: var(--text-xs, 0.75rem);
        margin-bottom: 4px;
      }

      .prediction-card__predicted {
        color: var(--color-text-secondary, #5c544a);
      }

      .prediction-card__actual {
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
      }

      .prediction-card__waiting {
        color: var(--color-text-dimmed, #a89d90);
        font-style: italic;
      }

      .prediction-card__date {
        font-size: var(--text-2xs, 0.625rem);
        color: var(--color-text-dimmed, #a89d90);
      }

      /* Empty state */
      .predictions-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--ma-meditation, 55px) var(--ma-rest, 21px);
        text-align: center;
      }

      .predictions-empty__icon {
        width: 56px;
        height: 56px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-background-tertiary, #ebe6df);
        border-radius: 50%;
        color: var(--color-text-dimmed, #a89d90);
        margin-bottom: var(--ma-pause, 13px);
      }

      .predictions-empty__icon svg {
        width: 28px;
        height: 28px;
      }

      .predictions-empty__title {
        font-size: var(--text-base, 0.9375rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary, #2c2520);
        margin: 0 0 var(--ma-breath, 8px) 0;
      }

      .predictions-empty__text {
        font-size: var(--text-sm, 0.8125rem);
        color: var(--color-text-secondary, #5c544a);
        max-width: 240px;
        line-height: var(--leading-normal, 1.6);
        margin: 0;
      }

      /* Reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .prediction-card {
          animation: none;
          opacity: 1;
          transform: none;
        }
      }

      /* Dark theme (Cedar Night) */
      [data-theme="midnight"] .predictions-panel__wrapper {
        background: var(--color-background-elevated, #70605a);
        border-color: var(--color-border-medium, rgba(215, 185, 145, 0.20));
      }

      [data-theme="midnight"] .predictions-panel__title {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .predictions-panel__close {
        background: var(--color-background-tertiary, #685852);
        border-color: var(--color-border-subtle, rgba(215, 185, 145, 0.12));
        color: var(--color-text-secondary, #e0d5c8);
        box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.05),
                    0 1px 3px rgba(0, 0, 0, 0.15);
      }

      [data-theme="midnight"] .predictions-panel__close:hover {
        background: var(--color-background-secondary, #60504a);
        border-color: var(--color-border-medium, rgba(215, 185, 145, 0.20));
        color: var(--color-text-primary, #faf6f0);
        box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.08),
                    0 2px 6px rgba(0, 0, 0, 0.2);
      }

      [data-theme="midnight"] .predictions-panel__close:active {
        box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
      }

      [data-theme="midnight"] .predictions-stats {
        background: var(--color-background-tertiary, #685852);
      }

      [data-theme="midnight"] .predictions-stat__value {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .predictions-stat__label {
        color: var(--color-text-muted, #d0c4b4);
      }

      [data-theme="midnight"] .predictions-group__title {
        color: var(--color-text-muted, #d0c4b4);
      }

      [data-theme="midnight"] .prediction-card {
        background: var(--color-background-secondary, #60504a);
        border-color: var(--color-border-subtle, rgba(215, 185, 145, 0.12));
      }

      [data-theme="midnight"] .prediction-card__icon {
        background: var(--color-background-tertiary, #685852);
        color: var(--color-text-secondary, #e0d5c8);
      }

      [data-theme="midnight"] .prediction-card__question {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .prediction-card__predicted {
        color: var(--color-text-secondary, #e0d5c8);
      }

      [data-theme="midnight"] .prediction-card__actual {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .prediction-card__waiting {
        color: var(--color-text-muted, #d0c4b4);
      }

      [data-theme="midnight"] .prediction-card__date {
        color: var(--color-text-muted, #d0c4b4);
      }

      [data-theme="midnight"] .predictions-empty__icon {
        background: var(--color-background-tertiary, #685852);
        color: var(--color-text-muted, #d0c4b4);
      }

      [data-theme="midnight"] .predictions-empty__title {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .predictions-empty__text {
        color: var(--color-text-secondary, #e0d5c8);
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

    const style = document.getElementById('predictions-ui-styles');
    if (style) {
      style.remove();
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

