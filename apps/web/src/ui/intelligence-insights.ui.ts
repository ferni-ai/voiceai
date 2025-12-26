/**
 * Intelligence Insights UI
 *
 * Displays insights from the Unified Intelligence Layer including:
 * - Proactive suggestions
 * - Anticipated tools
 * - Emotion-aware recommendations
 *
 * This can be integrated into settings, dev panel, or shown contextually.
 *
 * @module ui/intelligence-insights
 */

import { createLogger } from '../utils/logger';
import {
  getCachedProfile,
  getProactiveSuggestions,
  triggerOutreachCheck,
  type IntelligenceProfile,
  type ProactiveSuggestion,
} from '../services/intelligence.service';

const log = createLogger('IntelligenceInsights');

// ============================================================================
// STYLES
// ============================================================================

const STYLES = `
  .intelligence-insights {
    background: var(--color-background-elevated);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    box-shadow: var(--shadow-md);
    max-width: 400px;
  }

  .intelligence-insights__header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }

  .intelligence-insights__title {
    font-family: var(--font-display);
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
  }

  .intelligence-insights__icon {
    width: 24px;
    height: 24px;
    color: var(--color-accent);
  }

  .intelligence-insights__section {
    margin-bottom: var(--space-3);
  }

  .intelligence-insights__section-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: var(--space-2);
  }

  .intelligence-insights__tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .intelligence-insights__tag {
    background: var(--color-background-subtle);
    color: var(--color-text-secondary);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-full);
    font-size: 0.8rem;
    font-weight: 500;
  }

  .intelligence-insights__tag--anticipated {
    background: var(--color-accent-subtle);
    color: var(--color-accent);
  }

  .intelligence-insights__suggestion {
    background: var(--color-background-subtle);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    margin-bottom: var(--space-2);
  }

  .intelligence-insights__suggestion-tool {
    font-weight: 600;
    color: var(--color-text-primary);
    font-size: 0.9rem;
  }

  .intelligence-insights__suggestion-reason {
    color: var(--color-text-secondary);
    font-size: 0.85rem;
    margin-top: var(--space-1);
  }

  .intelligence-insights__suggestion-cta {
    background: var(--color-accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-3);
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    margin-top: var(--space-2);
    transition: background 0.2s;
  }

  .intelligence-insights__suggestion-cta:hover {
    background: var(--color-accent-hover);
  }

  .intelligence-insights__empty {
    color: var(--color-text-muted);
    font-size: 0.9rem;
    text-align: center;
    padding: var(--space-4);
  }

  .intelligence-insights__outreach {
    background: var(--gradient-primary-subtle);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    margin-top: var(--space-3);
    border: 1px solid var(--color-accent-subtle);
  }

  .intelligence-insights__outreach-message {
    color: var(--color-text-primary);
    font-size: 0.9rem;
    line-height: 1.4;
  }

  .intelligence-insights__loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
    color: var(--color-text-muted);
  }
`;

// ============================================================================
// COMPONENT
// ============================================================================

export class IntelligenceInsightsUI {
  private container: HTMLElement | null = null;
  private profile: IntelligenceProfile | null = null;
  private suggestions: ProactiveSuggestion[] = [];
  private styleElement: HTMLStyleElement | null = null;

  constructor() {
    this.injectStyles();
  }

  private injectStyles(): void {
    if (document.getElementById('intelligence-insights-styles')) return;

    this.styleElement = document.createElement('style');
    this.styleElement.id = 'intelligence-insights-styles';
    this.styleElement.textContent = STYLES;
    document.head.appendChild(this.styleElement);
  }

  /**
   * Render the insights panel in a container
   */
  async render(targetId: string): Promise<void> {
    const target = document.getElementById(targetId);
    if (!target) {
      log.warn({ targetId }, 'Target element not found');
      return;
    }

    // Show loading state
    target.innerHTML = `
      <div class="intelligence-insights">
        <div class="intelligence-insights__loading">
          Loading insights...
        </div>
      </div>
    `;

    // Fetch data
    await this.loadData();

    // Render full UI
    target.innerHTML = this.buildHTML();
    this.container = target.querySelector('.intelligence-insights');
    this.attachEventListeners();
  }

  private async loadData(): Promise<void> {
    try {
      const [profile, suggestionsResult] = await Promise.all([
        getCachedProfile(),
        getProactiveSuggestions(),
      ]);

      this.profile = profile;
      this.suggestions = suggestionsResult?.suggestions ?? [];

      log.debug(
        { hasProfile: !!profile, suggestionCount: this.suggestions.length },
        'Intelligence data loaded'
      );
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to load intelligence data');
    }
  }

  private buildHTML(): string {
    if (!this.profile) {
      return `
        <div class="intelligence-insights">
          <div class="intelligence-insights__empty">
            No insights available yet. Keep chatting!
          </div>
        </div>
      `;
    }

    const anticipatedToolsHTML = this.profile.anticipatedTools.length > 0
      ? this.profile.anticipatedTools
          .slice(0, 5)
          .map(
            (tool) =>
              `<span class="intelligence-insights__tag intelligence-insights__tag--anticipated">${this.formatToolName(tool)}</span>`
          )
          .join('')
      : '<span class="intelligence-insights__tag">None yet</span>';

    const preferredDomainsHTML = this.profile.preferredDomains.length > 0
      ? this.profile.preferredDomains
          .map((domain) => `<span class="intelligence-insights__tag">${domain}</span>`)
          .join('')
      : '<span class="intelligence-insights__tag">Discovering...</span>';

    const suggestionsHTML = this.suggestions.length > 0
      ? this.suggestions
          .slice(0, 3)
          .map(
            (s) => `
            <div class="intelligence-insights__suggestion" data-tool-id="${s.toolId}">
              <div class="intelligence-insights__suggestion-tool">${this.formatToolName(s.toolId)}</div>
              <div class="intelligence-insights__suggestion-reason">${s.reason}</div>
              ${s.triggerPhrase ? `<button class="intelligence-insights__suggestion-cta" data-trigger="${s.triggerPhrase}">Try it</button>` : ''}
            </div>
          `
          )
          .join('')
      : '<div class="intelligence-insights__empty">No suggestions right now</div>';

    const outreachHTML = this.profile.proactiveOutreach?.shouldTrigger
      ? `
        <div class="intelligence-insights__outreach">
          <div class="intelligence-insights__outreach-message">
            ${this.profile.proactiveOutreach.suggestedMessage || 'We have something to share with you!'}
          </div>
        </div>
      `
      : '';

    return `
      <div class="intelligence-insights">
        <div class="intelligence-insights__header">
          <svg class="intelligence-insights__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
          <h3 class="intelligence-insights__title">What I've Learned</h3>
        </div>

        <div class="intelligence-insights__section">
          <div class="intelligence-insights__section-title">Your Interests</div>
          <div class="intelligence-insights__tags">
            ${preferredDomainsHTML}
          </div>
        </div>

        <div class="intelligence-insights__section">
          <div class="intelligence-insights__section-title">Ready for You</div>
          <div class="intelligence-insights__tags">
            ${anticipatedToolsHTML}
          </div>
        </div>

        <div class="intelligence-insights__section">
          <div class="intelligence-insights__section-title">Suggestions</div>
          ${suggestionsHTML}
        </div>

        ${outreachHTML}
      </div>
    `;
  }

  private formatToolName(toolId: string): string {
    // Convert tool_id to "Tool Id" format
    return toolId
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  private attachEventListeners(): void {
    if (!this.container) return;

    // Handle suggestion CTA clicks
    const ctaButtons = this.container.querySelectorAll('.intelligence-insights__suggestion-cta');
    ctaButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const trigger = (e.target as HTMLElement).dataset.trigger;
        if (trigger) {
          this.dispatchSuggestionTrigger(trigger);
        }
      });
    });
  }

  private dispatchSuggestionTrigger(triggerPhrase: string): void {
    // Dispatch a custom event that the app can listen to
    const event = new CustomEvent('ferni:suggestion-triggered', {
      detail: { triggerPhrase },
      bubbles: true,
    });
    document.dispatchEvent(event);
    log.info({ triggerPhrase }, 'Suggestion triggered');
  }

  /**
   * Refresh the insights
   */
  async refresh(): Promise<void> {
    await this.loadData();
    if (this.container?.parentElement) {
      this.container.parentElement.innerHTML = this.buildHTML();
      this.container = document.querySelector('.intelligence-insights');
      this.attachEventListeners();
    }
  }

  /**
   * Check for proactive outreach and show if appropriate
   */
  async checkAndShowOutreach(): Promise<boolean> {
    const result = await triggerOutreachCheck();
    if (result?.triggered && result.suggestedMessage) {
      this.showOutreachToast(result.suggestedMessage);
      return true;
    }
    return false;
  }

  private showOutreachToast(message: string): void {
    // Import toast dynamically to avoid circular deps
    void import('./toast.ui').then(({ toast }) => {
      toast.info(message);
    });
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.styleElement?.remove();
    this.container = null;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: IntelligenceInsightsUI | null = null;

export function getIntelligenceInsights(): IntelligenceInsightsUI {
  if (!instance) {
    instance = new IntelligenceInsightsUI();
  }
  return instance;
}

export function renderIntelligenceInsights(targetId: string): Promise<void> {
  return getIntelligenceInsights().render(targetId);
}

