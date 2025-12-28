/**
 * Prediction Accuracy Tracker UI
 *
 * Gamified view of prediction performance over time.
 * Shows accuracy trends, best categories, and insights.
 *
 * DESIGN PRINCIPLES:
 *   - Encouraging, not discouraging
 *   - Focus on learning, not perfection
 *   - Visual progress indicators
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

// ============================================================================
// TYPES
// ============================================================================

// Track setTimeout calls for memory leak prevention
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

export interface CategoryAccuracy {
  category: string;
  correct: number;
  total: number;
  accuracy: number;
}

export interface PredictionTrackerData {
  overallAccuracy: number;
  totalPredictions: number;
  correctPredictions: number;
  byCategory: CategoryAccuracy[];
  recentTrend: number[];
  bestStreak: number;
  currentStreak: number;
}

export interface PredictionTrackerUICallbacks {
  onClose?: () => void;
  onViewPredictions?: () => void;
}

// ============================================================================
// CATEGORY ICONS
// ============================================================================

const CATEGORY_ICONS: Record<string, string> = {
  personal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  work: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
  health: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  habits: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  general: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
};

// ============================================================================
// PREDICTION TRACKER UI CLASS
// ============================================================================

class PredictionTrackerUI {
  private panel: HTMLElement | null = null;
  private wrapper: HTMLElement | null = null;
  private callbacks: PredictionTrackerUICallbacks = {};
  private styleElement: HTMLStyleElement | null = null;
  private isVisible = false;

  initialize(): void {
    if (this.panel) return;
    this.injectStyles();
    this.createPanel();
  }

  setCallbacks(callbacks: PredictionTrackerUICallbacks): void {
    this.callbacks = callbacks;
  }

  show(data: PredictionTrackerData): void {
    this.initialize();
    if (!this.panel || !this.wrapper) return;

    this.renderContent(data);
    this.panel.classList.add('pred-tracker--visible');
    this.isVisible = true;

    if (!prefersReducedMotion()) {
      this.animateProgress();
    }
  }

  hide(): void {
    if (!this.panel) return;
    this.panel.classList.remove('pred-tracker--visible');
    this.isVisible = false;
    this.callbacks.onClose?.();
  }

  /** Check if the panel is currently visible */
  getIsVisible(): boolean {
    return this.isVisible;
  }

  private createPanel(): void {
    this.panel = document.createElement('div');
    this.panel.className = 'pred-tracker';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Prediction accuracy');

    this.wrapper = document.createElement('div');
    this.wrapper.className = 'pred-tracker__wrapper';
    this.panel.appendChild(this.wrapper);

    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) this.hide();
    });

    document.body.appendChild(this.panel);
  }

  private renderContent(data: PredictionTrackerData): void {
    if (!this.wrapper) return;

    const message = this.getEncouragingMessage(data.overallAccuracy);

    this.wrapper.innerHTML = `
      <header class="pred-tracker__header">
        <h2>Your Predictions</h2>
        <button class="pred-tracker__close" aria-label="${t('common.close')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </header>

      <div class="pred-tracker__score">
        <div class="pred-tracker__ring" style="--progress: ${data.overallAccuracy}">
          <span class="pred-tracker__ring-value">${data.overallAccuracy}%</span>
          <span class="pred-tracker__ring-label">Accuracy</span>
        </div>
        <p class="pred-tracker__message">${message}</p>
      </div>

      <div class="pred-tracker__stats">
        <div class="pred-tracker__stat">
          <span class="pred-tracker__stat-value">${data.totalPredictions}</span>
          <span class="pred-tracker__stat-label">Total</span>
        </div>
        <div class="pred-tracker__stat">
          <span class="pred-tracker__stat-value">${data.correctPredictions}</span>
          <span class="pred-tracker__stat-label">Correct</span>
        </div>
        <div class="pred-tracker__stat">
          <span class="pred-tracker__stat-value">${data.currentStreak}</span>
          <span class="pred-tracker__stat-label">Current Streak</span>
        </div>
        <div class="pred-tracker__stat">
          <span class="pred-tracker__stat-value">${data.bestStreak}</span>
          <span class="pred-tracker__stat-label">Best Streak</span>
        </div>
      </div>

      ${data.byCategory.length > 0 ? `
        <div class="pred-tracker__categories">
          <h3>By Category</h3>
          ${data.byCategory.map(c => this.renderCategory(c)).join('')}
        </div>
      ` : ''}

      ${data.recentTrend.length > 0 ? `
        <div class="pred-tracker__trend">
          <h3>Recent Trend</h3>
          <div class="pred-tracker__trend-chart">
            ${data.recentTrend.map((v, i) => `
              <div class="pred-tracker__trend-bar" style="--height: ${v}%; --delay: ${i * 50}ms"></div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <div class="pred-tracker__actions" role="button" tabindex="0">
        <button aria-label="View All Predictions" class="pred-tracker__btn pred-tracker__btn--primary">View All Predictions</button>
      </div>
    `;

    this.wrapper.querySelector('.pred-tracker__close')?.addEventListener('click', () => this.hide());
    this.wrapper.querySelector('.pred-tracker__btn--primary')?.addEventListener('click', () => {
      this.callbacks.onViewPredictions?.();
    });
  }

  private renderCategory(cat: CategoryAccuracy): string {
    const icon = CATEGORY_ICONS[cat.category] || CATEGORY_ICONS['general'];
    return `
      <div class="pred-tracker__category">
        <span class="pred-tracker__category-icon">${icon}</span>
        <span class="pred-tracker__category-name">${cat.category}</span>
        <div class="pred-tracker__category-bar">
          <div class="pred-tracker__category-fill" style="--width: ${cat.accuracy}%"></div>
        </div>
        <span class="pred-tracker__category-pct">${cat.accuracy}%</span>
      </div>
    `;
  }

  private getEncouragingMessage(accuracy: number): string {
    if (accuracy >= 80) return 'Excellent intuition! You really know yourself.';
    if (accuracy >= 60) return 'Solid predictions! Your self-awareness is growing.';
    if (accuracy >= 40) return 'Learning in progress. Each prediction teaches something.';
    return 'Early days! The more you predict, the more you learn.';
  }

  private animateProgress(): void {
    trackedTimeout(() => {
      const ring = this.wrapper?.querySelector('.pred-tracker__ring') as HTMLElement;
      if (ring) {
        ring.classList.add('pred-tracker__ring--animated');
      }

      this.wrapper?.querySelectorAll('.pred-tracker__category-fill').forEach(el => {
        (el as HTMLElement).style.width = 'var(--width)';
      });

      this.wrapper?.querySelectorAll('.pred-tracker__trend-bar').forEach(el => {
        (el as HTMLElement).style.height = 'var(--height)';
      });
    }, DURATION.NORMAL);
  }

  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = `
      .pred-tracker {
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

      .pred-tracker--visible { opacity: 1; visibility: visible; }

      .pred-tracker__wrapper {
        width: 100%;
        max-width: clamp(294px, 90vw, 420px);
        max-height: 85vh;
        overflow-y: auto;
        background: var(--color-bg-elevated, #FFFDFB);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
        border-radius: var(--radius-xl, 20px);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
      }

      .pred-tracker__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--ma-rest, 21px) var(--ma-silence, 34px);
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .pred-tracker__header h2 {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-lg, 1.0625rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
        margin: 0;
      }

      .pred-tracker__close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        padding: 0;
        background: var(--color-background-tertiary, #ebe6df);
        border: none;
        border-radius: var(--radius-full, 9999px);
        color: var(--color-text-secondary, #5c544a);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .pred-tracker__close:hover { background: var(--color-background-secondary, #f5f2ed); color: var(--color-text-primary, #2c2520); }
      .pred-tracker__close svg { width: 16px; height: 16px; }

      .pred-tracker__score {
        padding: var(--ma-rest, 21px) var(--ma-silence, 34px);
        text-align: center;
      }

      .pred-tracker__ring {
        width: min(120px, 100%);
        height: 120px;
        margin: 0 auto var(--ma-breath, 13px);
        border-radius: 50%;
        background: conic-gradient(
          var(--color-accent-primary, #2d5a3d) 0%,
          var(--color-border-subtle, rgba(44, 37, 32, 0.1)) 0%
        );
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        position: relative;
      }

      .pred-tracker__ring--animated {
        background: conic-gradient(
          var(--color-accent-primary, #2d5a3d) calc(var(--progress, 0) * 1%),
          var(--color-border-subtle, rgba(44, 37, 32, 0.1)) calc(var(--progress, 0) * 1%)
        );
        transition: background ${DURATION.CELEBRATION}ms ${EASING.SPRING};
      }

      .pred-tracker__ring::before {
        content: '';
        position: absolute;
        inset: 8px;
        background: var(--color-background-elevated, #fffdfb);
        border-radius: 50%;
      }

      .pred-tracker__ring-value {
        position: relative;
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-2xl, 1.5rem);
        font-weight: var(--font-weight-bold, 700);
        color: var(--color-text-primary, #2c2520);
      }

      .pred-tracker__ring-label {
        position: relative;
        font-family: var(--font-primary, 'Inter', sans-serif);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
      }

      .pred-tracker__message {
        font-family: var(--font-primary, 'Inter', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary, #5c544a);
        margin: 0;
      }

      .pred-tracker__stats {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--space-2, 8px);
        padding: 0 var(--ma-silence, 34px) var(--ma-rest, 21px);
      }

      .pred-tracker__stat { text-align: center; }

      .pred-tracker__stat-value {
        display: block;
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-lg, 1.0625rem);
        font-weight: var(--font-weight-bold, 700);
        color: var(--color-text-primary, #2c2520);
      }

      .pred-tracker__stat-label {
        font-family: var(--font-primary, 'Inter', sans-serif);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
      }

      .pred-tracker__categories {
        padding: var(--ma-breath, 13px) var(--ma-silence, 34px);
        border-top: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .pred-tracker__categories h3 {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
        margin: 0 0 var(--ma-breath, 13px) 0;
      }

      .pred-tracker__category {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        margin-bottom: var(--space-2, 8px);
      }

      .pred-tracker__category-icon {
        width: 20px;
        height: 20px;
        color: var(--color-accent-primary, #2d5a3d);
      }

      .pred-tracker__category-icon svg { width: 100%; height: 100%; }

      .pred-tracker__category-name {
        width: 60px;
        font-family: var(--font-primary, 'Inter', sans-serif);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-secondary, #5c544a);
        text-transform: capitalize;
      }

      .pred-tracker__category-bar {
        flex: 1;
        height: 8px;
        background: var(--color-background-tertiary, #ebe6df);
        border-radius: var(--radius-full, 9999px);
        overflow: hidden;
      }

      .pred-tracker__category-fill {
        height: 100%;
        width: 0;
        background: var(--color-accent-primary, #2d5a3d);
        border-radius: var(--radius-full, 9999px);
        transition: width ${DURATION.CELEBRATION}ms ${EASING.SPRING};
      }

      .pred-tracker__category-pct {
        width: 36px;
        text-align: right;
        font-family: var(--font-primary, 'Inter', sans-serif);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
      }

      .pred-tracker__trend {
        padding: var(--ma-breath, 13px) var(--ma-silence, 34px);
        border-top: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .pred-tracker__trend h3 {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
        margin: 0 0 var(--ma-breath, 13px) 0;
      }

      .pred-tracker__trend-chart {
        display: flex;
        align-items: flex-end;
        gap: 4px;
        height: 60px;
      }

      .pred-tracker__trend-bar {
        flex: 1;
        height: 0;
        background: var(--color-accent-primary, #2d5a3d);
        border-radius: var(--radius-sm, 0.25rem) var(--radius-sm, 0.25rem) 0 0;
        transition: height ${DURATION.CELEBRATION}ms ${EASING.SPRING};
        transition-delay: var(--delay, 0ms);
      }

      .pred-tracker__actions {
        padding: var(--ma-breath, 13px) var(--ma-silence, 34px);
        border-top: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .pred-tracker__btn {
        width: 100%;
        padding: var(--space-3, 12px);
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        border: none;
        border-radius: var(--radius-lg, 0.75rem);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .pred-tracker__btn--primary {
        background: var(--color-accent-primary, #2d5a3d);
        color: white;
      }

      .pred-tracker__btn--primary:hover { background: var(--color-accent-hover, #3a7050); }

      /* Dark Theme - WCAG AA Compliant */
      [data-theme="midnight"] .pred-tracker { background: var(--backdrop-page); }
      [data-theme="midnight"] .pred-tracker__wrapper { background: var(--color-background-elevated, #70605a); }
      [data-theme="midnight"] .pred-tracker__header h2,
      [data-theme="midnight"] .pred-tracker__stat-value,
      [data-theme="midnight"] .pred-tracker__ring-value,
      [data-theme="midnight"] .pred-tracker__categories h3,
      [data-theme="midnight"] .pred-tracker__trend h3 { color: var(--color-text-primary, #faf6f0); }
      [data-theme="midnight"] .pred-tracker__ring::before { background: var(--color-background-elevated, #70605a); }
      [data-theme="midnight"] .pred-tracker__close { background: var(--color-background-tertiary, #685852); color: var(--color-text-secondary, #f0ebe4); }
      [data-theme="midnight"] .pred-tracker__stat-label,
      [data-theme="midnight"] .pred-tracker__ring-label,
      [data-theme="midnight"] .pred-tracker__trend-day { color: var(--color-text-muted, #e8e2da); }
      [data-theme="midnight"] .pred-tracker__category-name,
      [data-theme="midnight"] .pred-tracker__category-pct { color: var(--color-text-primary, #faf6f0); }
      [data-theme="midnight"] .pred-tracker__insight { color: var(--color-text-secondary, #f0ebe4); }

      @media (prefers-reduced-motion: reduce) {
        .pred-tracker { transition: opacity ${DURATION.FAST}ms linear; }
        .pred-tracker__ring--animated,
        .pred-tracker__category-fill,
        .pred-tracker__trend-bar { transition: none; }
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

let instance: PredictionTrackerUI | null = null;

export function getPredictionTrackerUI(): PredictionTrackerUI {
  if (!instance) instance = new PredictionTrackerUI();
  return instance;
}

export function initPredictionTrackerUI(): void {
  getPredictionTrackerUI().initialize();
}

export function showPredictionTracker(data: PredictionTrackerData): void {
  getPredictionTrackerUI().show(data);
}

export default PredictionTrackerUI;

