/**
 * Practice Suggestions UI
 *
 * Shows practice suggestions based on calendar pattern analysis.
 * Appears in the engagement menu or as a dedicated section.
 *
 * DESIGN SYSTEM COMPLIANCE:
 * - Uses CSS variables from tokens.css
 * - Uses DURATION/EASING from animation-constants.ts
 * - Respects prefers-reduced-motion
 * - Humanized, encouraging copy
 */

import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { createAnimationConfig, ICONS, escapeHtml, injectSharedStyles } from './engagement-components.js';
import { practiceBriefingsService, type PatternSuggestion } from '../services/practice-briefings.service.js';

// ============================================================================
// TYPES
// ============================================================================

export interface PracticeSuggestionsUICallbacks {
  onSuggestionAccepted?: (suggestion: PatternSuggestion) => void;
  onClose?: () => void;
}

// ============================================================================
// COPY
// ============================================================================

const SUGGESTIONS_COPY = {
  title: 'Based on Your Schedule',
  subtitle: 'Practices that might help',
  empty: "Keep using Ferni and I'll suggest practices based on your patterns",
  cta: 'Add Practice',
  dismiss: 'Not now',
  confidenceLabels: {
    high: 'Recommended',
    medium: 'Worth trying',
    low: 'Might help',
  },
};

// ============================================================================
// STYLES
// ============================================================================

let stylesInjected = false;

function injectSuggestionStyles(): void {
  if (stylesInjected) return;
  injectSharedStyles();

  const style = document.createElement('style');
  style.id = 'practice-suggestions-styles';
  style.textContent = `
    .practice-suggestions {
      padding: var(--ma-pause);
    }

    .practice-suggestions__header {
      margin-bottom: var(--ma-pause);
    }

    .practice-suggestions__title {
      font-family: var(--font-display);
      font-size: var(--text-sm);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-primary);
      margin: 0 0 4px 0;
      display: flex;
      align-items: center;
      gap: var(--ma-breath);
    }

    .practice-suggestions__title-icon {
      width: 16px;
      height: 16px;
      color: var(--persona-primary, var(--color-accent-primary));
    }

    .practice-suggestions__subtitle {
      font-family: var(--font-body);
      font-size: var(--text-xs);
      color: var(--color-text-muted);
      margin: 0;
    }

    .practice-suggestions__list {
      display: flex;
      flex-direction: column;
      gap: var(--ma-pause);
    }

    .practice-suggestions__card {
      padding: var(--ma-pause);
      background: var(--color-background-secondary);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-lg);
      transition: 
        background var(--duration-fast) var(--ease-gentle),
        border-color var(--duration-fast) var(--ease-gentle);
    }

    .practice-suggestions__card:hover {
      background: var(--color-background-tertiary);
      border-color: var(--persona-primary, var(--color-accent-primary));
    }

    .practice-suggestions__card-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--ma-breath);
      margin-bottom: var(--ma-breath);
    }

    .practice-suggestions__card-title {
      font-family: var(--font-display);
      font-size: var(--text-sm);
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text-primary);
      margin: 0;
    }

    .practice-suggestions__card-badge {
      font-family: var(--font-body);
      font-size: 10px;
      font-weight: var(--font-weight-medium, 500);
      color: var(--persona-primary, var(--color-accent-primary));
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      padding: 2px 6px;
      border-radius: var(--radius-sm);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .practice-suggestions__card-description {
      font-family: var(--font-body);
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
      margin: 0 0 var(--ma-breath) 0;
      line-height: var(--leading-relaxed);
    }

    .practice-suggestions__card-meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ma-breath);
      margin-bottom: var(--ma-pause);
    }

    .practice-suggestions__card-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      color: var(--color-text-muted);
      background: var(--color-background-tertiary);
      padding: 2px 6px;
      border-radius: var(--radius-sm);
    }

    .practice-suggestions__card-tag svg {
      width: 10px;
      height: 10px;
    }

    .practice-suggestions__card-reasoning {
      font-family: var(--font-body);
      font-size: var(--text-xs);
      color: var(--color-text-muted);
      font-style: italic;
      margin: 0 0 var(--ma-pause) 0;
      padding: var(--ma-breath);
      background: var(--color-background-tertiary);
      border-radius: var(--radius-md);
      border-left: 2px solid var(--persona-primary, var(--color-accent-primary));
    }

    .practice-suggestions__card-actions {
      display: flex;
      gap: var(--ma-breath);
    }

    .practice-suggestions__card-btn {
      flex: 1;
      padding: var(--ma-breath) var(--ma-pause);
      border-radius: var(--radius-md);
      font-family: var(--font-display);
      font-size: var(--text-xs);
      font-weight: var(--font-weight-medium, 500);
      cursor: pointer;
      transition: 
        background var(--duration-fast) var(--ease-gentle),
        transform var(--duration-fast) var(--ease-spring);
    }

    .practice-suggestions__card-btn:active {
      transform: scale(0.98);
    }

    .practice-suggestions__card-btn--secondary {
      background: transparent;
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-secondary);
    }

    .practice-suggestions__card-btn--secondary:hover {
      background: var(--color-background-secondary);
      color: var(--color-text-primary);
    }

    .practice-suggestions__card-btn--primary {
      background: var(--persona-primary, var(--color-accent-primary));
      border: none;
      color: white;
    }

    .practice-suggestions__card-btn--primary:hover {
      filter: brightness(1.1);
    }

    .practice-suggestions__empty {
      text-align: center;
      padding: var(--ma-rest);
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .practice-suggestions__loading {
      text-align: center;
      padding: var(--ma-rest);
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    /* Dark theme */
    [data-theme="midnight"] .practice-suggestions__card {
      background: var(--color-background-secondary);
      border-color: var(--color-border-subtle);
    }

    [data-theme="midnight"] .practice-suggestions__card:hover {
      background: var(--color-background-tertiary);
    }

    [data-theme="midnight"] .practice-suggestions__card-reasoning {
      background: var(--color-background-secondary);
    }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

// ============================================================================
// UI CLASS
// ============================================================================

class PracticeSuggestionsUI {
  private container: HTMLElement | null = null;
  private callbacks: PracticeSuggestionsUICallbacks = {};
  private suggestions: PatternSuggestion[] = [];
  private loading = false;

  /**
   * Render suggestions into a container element
   */
  async render(containerSelector: string, callbacks?: PracticeSuggestionsUICallbacks): Promise<void> {
    injectSuggestionStyles();

    this.callbacks = callbacks ?? {};
    this.container = document.querySelector(containerSelector);

    if (!this.container) {
      return;
    }

    // Show loading state
    this.loading = true;
    this.renderContent();

    // Fetch suggestions
    this.suggestions = await practiceBriefingsService.getPatternSuggestions();
    this.loading = false;
    this.renderContent();
  }

  /**
   * Create a standalone element with suggestions
   */
  async createElement(callbacks?: PracticeSuggestionsUICallbacks): Promise<HTMLElement> {
    injectSuggestionStyles();

    this.callbacks = callbacks ?? {};
    this.container = document.createElement('div');
    this.container.className = 'practice-suggestions';

    // Show loading state
    this.loading = true;
    this.renderContent();

    // Fetch suggestions
    this.suggestions = await practiceBriefingsService.getPatternSuggestions();
    this.loading = false;
    this.renderContent();

    return this.container;
  }

  /**
   * Refresh suggestions
   */
  async refresh(): Promise<void> {
    this.loading = true;
    this.renderContent();

    this.suggestions = await practiceBriefingsService.getPatternSuggestions();
    this.loading = false;
    this.renderContent();
  }

  private renderContent(): void {
    if (!this.container) return;

    if (this.loading) {
      this.container.innerHTML = `
        <div class="practice-suggestions">
          <div class="practice-suggestions__loading">Analyzing your calendar patterns...</div>
        </div>
      `;
      return;
    }

    if (this.suggestions.length === 0) {
      this.container.innerHTML = `
        <div class="practice-suggestions">
          <div class="practice-suggestions__empty">${SUGGESTIONS_COPY.empty}</div>
        </div>
      `;
      return;
    }

    const cardsHtml = this.suggestions.map((suggestion, index) => {
      const confidenceLabel = this.getConfidenceLabel(suggestion.confidence);
      const timeLabel = this.formatTime(suggestion);
      const frequencyLabel = this.formatFrequency(suggestion.suggestedFrequency);

      return `
        <div class="practice-suggestions__card" data-index="${index}">
          <div class="practice-suggestions__card-header">
            <h4 class="practice-suggestions__card-title">${escapeHtml(suggestion.title)}</h4>
            <span class="practice-suggestions__card-badge">${confidenceLabel}</span>
          </div>
          <p class="practice-suggestions__card-description">${escapeHtml(suggestion.description)}</p>
          <div class="practice-suggestions__card-meta">
            <span class="practice-suggestions__card-tag">
              ${ICONS.clock}
              ${suggestion.durationMinutes} min
            </span>
            <span class="practice-suggestions__card-tag">
              ${ICONS.calendar}
              ${frequencyLabel}
            </span>
            <span class="practice-suggestions__card-tag">
              ${ICONS.sunny}
              ${timeLabel}
            </span>
          </div>
          <p class="practice-suggestions__card-reasoning">${escapeHtml(suggestion.reasoning)}</p>
          <div class="practice-suggestions__card-actions" role="button" tabindex="0">
            <button aria-label="Copy" class="practice-suggestions__card-btn practice-suggestions__card-btn--secondary" data-action="dismiss" type="button">
              ${SUGGESTIONS_COPY.dismiss}
            </button>
            <button aria-label="Copy" class="practice-suggestions__card-btn practice-suggestions__card-btn--primary" data-action="accept" type="button">
              ${SUGGESTIONS_COPY.cta}
            </button>
          </div>
        </div>
      `;
    }).join('');

    this.container.innerHTML = `
      <div class="practice-suggestions">
        <div class="practice-suggestions__header">
          <h3 class="practice-suggestions__title">
            <span class="practice-suggestions__title-icon">${ICONS.star}</span>
            ${SUGGESTIONS_COPY.title}
          </h3>
          <p class="practice-suggestions__subtitle">${SUGGESTIONS_COPY.subtitle}</p>
        </div>
        <div class="practice-suggestions__list">
          ${cardsHtml}
        </div>
      </div>
    `;

    this.bindEvents();

    // Staggered entrance animation
    if (!prefersReducedMotion()) {
      this.container.querySelectorAll('.practice-suggestions__card').forEach((card, i) => {
        (card as HTMLElement).animate(
          [
            { opacity: 0, transform: 'translateY(8px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          {
            duration: DURATION.MODERATE,
            easing: EASING.EXPO_OUT,
            delay: i * 80,
            fill: 'forwards',
          }
        );
      });
    }
  }

  private bindEvents(): void {
    if (!this.container) return;

    this.container.querySelectorAll('.practice-suggestions__card-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const action = target.dataset.action;
        const card = target.closest('.practice-suggestions__card') as HTMLElement;
        const index = parseInt(card?.dataset.index ?? '-1', 10);

        if (index >= 0 && index < this.suggestions.length) {
          const suggestion = this.suggestions[index];

          if (action === 'accept') {
            this.callbacks.onSuggestionAccepted?.(suggestion);
          }

          // Animate card out
          if (!prefersReducedMotion()) {
            card.animate(
              [
                { opacity: 1, transform: 'scale(1)' },
                { opacity: 0, transform: 'scale(0.95)' },
              ],
              createAnimationConfig(DURATION.SLOW, EASING.STANDARD)
            ).onfinish = () => {
              card.remove();
            };
          } else {
            card.remove();
          }

          // Remove from suggestions array
          this.suggestions.splice(index, 1);

          // Re-render if empty
          if (this.suggestions.length === 0) {
            setTimeout(() => this.renderContent(), DURATION.SLOW);
          }
        }
      });
    });
  }

  private getConfidenceLabel(confidence: number): string {
    if (confidence >= 0.8) return SUGGESTIONS_COPY.confidenceLabels.high;
    if (confidence >= 0.6) return SUGGESTIONS_COPY.confidenceLabels.medium;
    return SUGGESTIONS_COPY.confidenceLabels.low;
  }

  private formatTime(suggestion: PatternSuggestion): string {
    if (suggestion.specificTime) {
      const { hour, minute } = suggestion.specificTime;
      const period = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 || 12;
      const displayMinute = String(minute).padStart(2, '0');
      return `${displayHour}:${displayMinute} ${period}`;
    }
    return suggestion.suggestedTime.charAt(0).toUpperCase() + suggestion.suggestedTime.slice(1);
  }

  private formatFrequency(frequency: string): string {
    const labels: Record<string, string> = {
      daily: 'Daily',
      weekday: 'Weekdays',
      weekend: 'Weekends',
      weekly: 'Weekly',
    };
    return labels[frequency] ?? frequency;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const practiceSuggestionsUI = new PracticeSuggestionsUI();

export async function renderPracticeSuggestions(
  containerSelector: string,
  callbacks?: PracticeSuggestionsUICallbacks
): Promise<void> {
  await practiceSuggestionsUI.render(containerSelector, callbacks);
}

export async function createPracticeSuggestionsElement(
  callbacks?: PracticeSuggestionsUICallbacks
): Promise<HTMLElement> {
  return practiceSuggestionsUI.createElement(callbacks);
}

export default practiceSuggestionsUI;

