/**
 * Predictive Insights UI Component
 *
 * Surfaces proactive predictions to users as floating cards or a dashboard.
 * Shows things like:
 * - Energy windows ("High energy window coming up at 10am")
 * - Burnout warnings ("Heavy calendar ahead")
 * - Goal trajectory ("You're 3 days ahead on savings goal")
 * - Habit nudges ("Meditation streak slipping")
 * - Social connections ("Haven't mentioned Sarah lately")
 *
 * Design: Floating cards that appear subtly, non-intrusive but helpful.
 *
 * @module PredictiveInsightsUI
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

const log = createLogger('PredictiveInsightsUI');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

export interface InsightCard {
  id: string;
  type: InsightType;
  title: string;
  message: string;
  suggestion?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  icon: string;
  accentColor: string;
  actionLabel?: string;
  onAction?: () => void;
  dismissable: boolean;
  expiresAt?: Date;
}

export type InsightType =
  | 'energy_prediction'
  | 'relationship_health'
  | 'goal_trajectory'
  | 'burnout_prediction'
  | 'decision_timing'
  | 'social_connection'
  | 'seasonal_mood'
  | 'habit_decay';

// ============================================================================
// ICONS
// ============================================================================

const INSIGHT_ICONS: Record<InsightType, string> = {
  energy_prediction: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    <circle cx="12" cy="12" r="5"/>
  </svg>`,
  relationship_health: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>`,
  goal_trajectory: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <circle cx="12" cy="12" r="6"/>
    <circle cx="12" cy="12" r="2"/>
  </svg>`,
  burnout_prediction: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 9v2m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>
  </svg>`,
  decision_timing: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>`,
  social_connection: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>`,
  seasonal_mood: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17 18a5 5 0 0 0-10 0"/>
    <line x1="12" y1="2" x2="12" y2="9"/>
    <line x1="4.22" y1="10.22" x2="5.64" y2="11.64"/>
    <line x1="1" y1="18" x2="3" y2="18"/>
    <line x1="21" y1="18" x2="23" y2="18"/>
    <line x1="18.36" y1="11.64" x2="19.78" y2="10.22"/>
    <line x1="23" y1="22" x2="1" y2="22"/>
    <polyline points="8 6 12 2 16 6"/>
  </svg>`,
  habit_decay: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
    <polyline points="17 6 23 6 23 12"/>
  </svg>`,
};

const INSIGHT_COLORS: Record<InsightType, string> = {
  energy_prediction: 'var(--color-ferni)',
  relationship_health: 'var(--color-alex)',
  goal_trajectory: 'var(--color-maya)',
  burnout_prediction: '#c4856a', // Warm warning
  decision_timing: 'var(--color-peter)',
  social_connection: 'var(--color-ferni)',
  seasonal_mood: 'var(--color-nayan)',
  habit_decay: 'var(--color-maya)',
};

// ============================================================================
// PREDICTIVE INSIGHTS UI CLASS
// ============================================================================

class PredictiveInsightsUI {
  private container: HTMLElement | null = null;
  private cardsContainer: HTMLElement | null = null;
  private activeCards: Map<string, HTMLElement> = new Map();
  private styleElement: HTMLStyleElement | null = null;
  private initialized = false;
  private dismissedInsights: Set<string> = new Set();

  /**
   * Initialize the predictive insights UI
   */
  initialize(): void {
    if (this.initialized) return;

    // HMR cleanup
    document.querySelectorAll('.predictive-insights-container').forEach((el) => el.remove());

    this.createStyles();
    this.createContainer();
    this.loadDismissedInsights();
    this.initialized = true;

    log.debug('Predictive Insights UI initialized');
  }

  /**
   * Create the floating cards container
   */
  private createContainer(): void {
    this.container = document.createElement('div');
    this.container.className = 'predictive-insights-container';
    this.container.setAttribute('aria-live', 'polite');
    this.container.setAttribute('aria-label', 'Predictive Insights');

    this.cardsContainer = document.createElement('div');
    this.cardsContainer.className = 'predictive-insights-cards';

    this.container.appendChild(this.cardsContainer);
    document.body.appendChild(this.container);
  }

  /**
   * Show an insight card
   */
  showInsight(insight: InsightCard): void {
    if (!this.cardsContainer || !this.initialized) {
      this.initialize();
    }

    // Don't show if dismissed
    if (this.dismissedInsights.has(insight.id)) {
      log.debug({ id: insight.id }, 'Insight was dismissed, not showing');
      return;
    }

    // Don't show duplicates
    if (this.activeCards.has(insight.id)) {
      return;
    }

    // Limit active cards
    if (this.activeCards.size >= 3) {
      // Remove oldest
      const oldestId = this.activeCards.keys().next().value;
      if (oldestId) this.dismissInsight(oldestId, false);
    }

    const card = this.createCard(insight);
    this.cardsContainer!.appendChild(card);
    this.activeCards.set(insight.id, card);

    // Animate in
    requestAnimationFrame(() => {
      card.classList.add('visible');
    });

    // Auto-dismiss after delay (unless urgent)
    if (insight.priority !== 'urgent') {
      const delay = insight.priority === 'high' ? 30000 : 15000;
      trackedTimeout(() => {
        this.dismissInsight(insight.id, false);
      }, delay);
    }

    log.debug({ id: insight.id, type: insight.type }, 'Showing insight card');
  }

  /**
   * Create a card element
   */
  private createCard(insight: InsightCard): HTMLElement {
    const card = document.createElement('div');
    card.className = `insight-card priority-${insight.priority}`;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-expanded', 'false');
    card.setAttribute('data-insight-id', insight.id);

    const icon = INSIGHT_ICONS[insight.type] || INSIGHT_ICONS.energy_prediction;
    const color = insight.accentColor || INSIGHT_COLORS[insight.type] || 'var(--color-ferni)';

    card.innerHTML = `
      <div class="insight-card-accent" style="background: ${color}"></div>
      <div class="insight-card-content">
        <div class="insight-card-header">
          <div class="insight-card-icon" style="color: ${color}">
            ${icon}
          </div>
          <div class="insight-card-title">${this.escapeHtml(insight.title)}</div>
          ${
            insight.dismissable
              ? `
            <button class="insight-card-dismiss" aria-label="${t('accessibility.dismiss')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          `
              : ''
          }
        </div>
        <div class="insight-card-message">${this.escapeHtml(insight.message)}</div>
        ${
          insight.suggestion
            ? `
          <div class="insight-card-suggestion">${this.escapeHtml(insight.suggestion)}</div>
        `
            : ''
        }
        ${
          insight.actionLabel
            ? `
          <button class="insight-card-action" style="background: ${color}">
            ${this.escapeHtml(insight.actionLabel)}
          </button>
        `
            : ''
        }
      </div>
    `;

    // Event handlers
    const dismissBtn = card.querySelector('.insight-card-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dismissInsight(insight.id, true);
      });
    }

    const actionBtn = card.querySelector('.insight-card-action');
    if (actionBtn && insight.onAction) {
      actionBtn.addEventListener('click', () => {
        insight.onAction!();
        this.dismissInsight(insight.id, false);
      });
    }

    // Click and keyboard to expand/interact
    const toggleExpand = () => {
      card.classList.toggle('expanded');
      card.setAttribute('aria-expanded', String(card.classList.contains('expanded')));
    };
    card.addEventListener('click', toggleExpand);
    card.addEventListener('keydown', (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Enter' || ke.key === ' ') {
        ke.preventDefault();
        toggleExpand();
      }
    });

    return card;
  }

  /**
   * Dismiss an insight card
   */
  dismissInsight(id: string, remember: boolean): void {
    const card = this.activeCards.get(id);
    if (!card) return;

    card.classList.remove('visible');
    card.classList.add('dismissing');

    trackedTimeout(() => {
      card.remove();
      this.activeCards.delete(id);
    }, DURATION.NORMAL);

    if (remember) {
      this.dismissedInsights.add(id);
      this.saveDismissedInsights();
    }

    log.debug({ id, remembered: remember }, 'Dismissed insight card');
  }

  /**
   * Clear all cards
   */
  clearAll(): void {
    for (const id of this.activeCards.keys()) {
      this.dismissInsight(id, false);
    }
  }

  /**
   * Escape HTML for security
   */
  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Load dismissed insights from localStorage
   */
  private loadDismissedInsights(): void {
    try {
      const stored = localStorage.getItem('ferni_dismissed_insights');
      if (stored) {
        const data = JSON.parse(stored);
        // Only keep dismissals from last 24 hours
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        for (const [id, timestamp] of Object.entries(data)) {
          if ((timestamp as number) > cutoff) {
            this.dismissedInsights.add(id);
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Save dismissed insights to localStorage
   */
  private saveDismissedInsights(): void {
    try {
      const data: Record<string, number> = {};
      for (const id of this.dismissedInsights) {
        data[id] = Date.now();
      }
      localStorage.setItem('ferni_dismissed_insights', JSON.stringify(data));
    } catch {
      // Ignore
    }
  }

  /**
   * Create styles
   */
  private createStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = `
      .predictive-insights-container {
        position: fixed;
        top: calc(var(--space-4) + 60px);
        right: var(--space-4);
        z-index: var(--z-dropdown);
        pointer-events: none;
        max-width: min(360px, 100%);
        width: 100%;
      }

      .predictive-insights-cards {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .insight-card {
        background: var(--color-background-elevated);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-lg);
        overflow: hidden;
        pointer-events: auto;
        cursor: pointer;
        opacity: 0;
        transform: translateX(20px);
        transition: 
          opacity ${DURATION.NORMAL}ms ${EASING.STANDARD},
          transform ${DURATION.NORMAL}ms ${EASING.STANDARD};
      }

      .insight-card.visible {
        opacity: 1;
        transform: translateX(0);
      }

      .insight-card.dismissing {
        opacity: 0;
        transform: translateX(20px) scale(0.95);
      }

      .insight-card.expanded {
        box-shadow: var(--shadow-xl);
      }

      .insight-card-accent {
        height: 3px;
        width: 100%;
      }

      .insight-card-content {
        padding: var(--space-4);
      }

      .insight-card-header {
        display: flex;
        align-items: flex-start;
        gap: var(--space-3);
        margin-bottom: var(--space-2);
      }

      .insight-card-icon {
        flex-shrink: 0;
        width: 24px;
        height: 24px;
      }

      .insight-card-icon svg {
        width: 100%;
        height: 100%;
      }

      .insight-card-title {
        flex: 1;
        font-weight: 600;
        font-size: 14px;
        color: var(--color-text-primary);
        line-height: 1.3;
      }

      .insight-card-dismiss {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        padding: 0;
        background: none;
        border: none;
        cursor: pointer;
        opacity: 0.5;
        transition: opacity ${DURATION.FAST}ms;
        color: var(--color-text-secondary);
      }

      .insight-card-dismiss:hover {
        opacity: 1;
      }

      .insight-card-dismiss svg {
        width: 100%;
        height: 100%;
      }

      .insight-card-message {
        font-size: 13px;
        color: var(--color-text-secondary);
        line-height: 1.5;
        margin-bottom: var(--space-2);
      }

      .insight-card-suggestion {
        font-size: 12px;
        color: var(--color-text-muted);
        font-style: italic;
        margin-bottom: var(--space-3);
      }

      .insight-card-action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-2) var(--space-4);
        font-size: 12px;
        font-weight: 500;
        color: white;
        border: none;
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: transform ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .insight-card-action:hover {
        transform: scale(1.02);
      }

      .insight-card-action:active {
        transform: scale(0.98);
      }

      /* Priority variants */
      .insight-card.priority-urgent {
        animation: urgentPulse 2s ease-in-out infinite;
      }

      .insight-card.priority-high .insight-card-accent {
        height: 4px;
      }

      @keyframes urgentPulse {
        0%, 100% { box-shadow: var(--shadow-lg); }
        50% { box-shadow: var(--shadow-xl), 0 0 20px rgba(196, 133, 106, 0.3); }
      }

      /* Mobile adjustments */
      @media (max-width: clamp(336px, 90vw, 480px)) {
        .predictive-insights-container {
          top: auto;
          bottom: calc(var(--space-4) + 80px);
          left: var(--space-3);
          right: var(--space-3);
          max-width: none;
        }

        .insight-card {
          transform: translateY(20px);
        }

        .insight-card.visible {
          transform: translateY(0);
        }

        .insight-card.dismissing {
          transform: translateY(20px) scale(0.95);
        }
      }

      /* Reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .insight-card {
          transition: opacity ${DURATION.NORMAL}ms;
        }

        .insight-card.priority-urgent {
          animation: none;
        }
      }
    `;

    document.head.appendChild(this.styleElement);
  }

  /**
   * Destroy the UI
   */
  destroy(): void {
    this.container?.remove();
    this.styleElement?.remove();
    this.activeCards.clear();
    this.initialized = false;
  }
}

// ============================================================================
// SINGLETON & EXPORTS
// ============================================================================

let instance: PredictiveInsightsUI | null = null;

export function getPredictiveInsightsUI(): PredictiveInsightsUI {
  if (!instance) {
    instance = new PredictiveInsightsUI();
  }
  return instance;
}

export function initPredictiveInsights(): void {
  getPredictiveInsightsUI().initialize();
}

export function showPredictiveInsight(insight: InsightCard): void {
  getPredictiveInsightsUI().showInsight(insight);
}

export function dismissPredictiveInsight(id: string): void {
  getPredictiveInsightsUI().dismissInsight(id, true);
}

/**
 * Convenience function to show an insight from API data
 */
export function showInsightFromAPI(apiInsight: {
  id: string;
  type: InsightType;
  title: string;
  message: string;
  suggestion?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}): void {
  const insight: InsightCard = {
    ...apiInsight,
    icon: INSIGHT_ICONS[apiInsight.type],
    accentColor: INSIGHT_COLORS[apiInsight.type],
    dismissable: true,
  };

  showPredictiveInsight(insight);
}

export default {
  initialize: initPredictiveInsights,
  show: showPredictiveInsight,
  dismiss: dismissPredictiveInsight,
  showFromAPI: showInsightFromAPI,
  getInstance: getPredictiveInsightsUI,
};
