/**
 * Next Check-in Widget
 *
 * A small, embeddable widget that shows when Ferni will next check in.
 * Can be placed in the main conversation UI or settings.
 *
 * Features:
 * - Shows next scheduled outreach
 * - Displays persona who will reach out
 * - Click to open full schedule modal
 *
 * @module NextCheckinUI
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { apiGet } from '../utils/api.js';
import { showNotificationSettings } from './notification-settings.ui.js';

const log = createLogger('NextCheckin');

// ============================================================================
// TYPES
// ============================================================================

interface NextOutreach {
  id: string;
  personaId: string;
  personaName: string;
  scheduledFor: Date;
  type: string;
  channel: 'sms' | 'email' | 'call' | 'push';
  preview?: string;
}

interface NextCheckinOptions {
  container?: HTMLElement;
  compact?: boolean;
  showPersona?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PERSONA_COLORS: Record<string, string> = {
  ferni: '#4a6741',
  maya: '#a67a6a',
  peter: '#3a6b73',
  alex: '#5a6b8a',
  jordan: '#c4856a',
  nayan: '#8a7a6a',
};

const ICONS = {
  calendar: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`,
  clock: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  chevronRight: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
  heart: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
};

// ============================================================================
// STYLES
// ============================================================================

const STYLES = `
.next-checkin-widget {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  padding: var(--space-3, 12px) var(--space-4, 16px);
  background: var(--color-background-secondary, #f5f2ed);
  border-radius: var(--radius-lg, 12px);
  cursor: pointer;
  transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
}

.next-checkin-widget:hover {
  background: var(--color-background-tertiary, #eae7e2);
  transform: translateY(-1px);
}

.next-checkin-widget--compact {
  padding: var(--space-2, 8px) var(--space-3, 12px);
  gap: var(--space-2, 8px);
}

.next-checkin-icon {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full, 9999px);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
}

.next-checkin-widget--compact .next-checkin-icon {
  width: 24px;
  height: 24px;
}

.next-checkin-icon svg {
  width: 16px;
  height: 16px;
}

.next-checkin-widget--compact .next-checkin-icon svg {
  width: 12px;
  height: 12px;
}

.next-checkin-content {
  flex: 1;
  min-width: 0;
}

.next-checkin-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--color-text-muted, #8a8078);
  margin-bottom: 2px;
}

.next-checkin-widget--compact .next-checkin-label {
  display: none;
}

.next-checkin-time {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary, #2C2520);
  display: flex;
  align-items: center;
  gap: 6px;
}

.next-checkin-time svg {
  width: 14px;
  height: 14px;
  color: var(--color-text-muted, #8a8078);
}

.next-checkin-widget--compact .next-checkin-time {
  font-size: 13px;
}

.next-checkin-persona {
  font-size: 12px;
  color: var(--color-text-secondary, #5c544a);
  margin-top: 2px;
}

.next-checkin-arrow {
  color: var(--color-text-muted, #8a8078);
  flex-shrink: 0;
}

.next-checkin-empty {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  padding: var(--space-3, 12px) var(--space-4, 16px);
  background: var(--color-background-secondary, #f5f2ed);
  border-radius: var(--radius-lg, 12px);
  color: var(--color-text-muted, #8a8078);
  font-size: 13px;
}

.next-checkin-empty svg {
  opacity: 0.6;
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .next-checkin-widget {
    background: rgba(255, 255, 255, 0.05);
  }
  .next-checkin-widget:hover {
    background: rgba(255, 255, 255, 0.08);
  }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .next-checkin-widget {
    transition: none;
  }
}
`;

// ============================================================================
// WIDGET CLASS
// ============================================================================

class NextCheckinWidget {
  private container: HTMLElement | null = null;
  private element: HTMLElement | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private nextOutreach: NextOutreach | null = null;
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private options: NextCheckinOptions = {};

  /**
   * Initialize and mount the widget
   */
  mount(options: NextCheckinOptions = {}): HTMLElement {
    this.options = options;
    this.cleanup();
    this.injectStyles();

    // Create element
    this.element = document.createElement('div');
    this.element.className = 'next-checkin-container';

    // Mount to container or return element
    if (options.container) {
      options.container.appendChild(this.element);
      this.container = options.container;
    }

    // Initial render
    this.render();

    // Fetch data
    this.fetchNextOutreach();

    // Refresh every 5 minutes
    this.refreshInterval = setInterval(
      () => {
        this.fetchNextOutreach();
      },
      5 * 60 * 1000
    );

    log.debug('Next check-in widget mounted');
    return this.element;
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    if (this.element && this.container) {
      this.container.removeChild(this.element);
    }
    this.element = null;
    this.container = null;
  }

  /**
   * Inject styles
   */
  private injectStyles(): void {
    if (this.styleElement) return;
    if (document.querySelector('.next-checkin-styles')) return;

    this.styleElement = document.createElement('style');
    this.styleElement.className = 'next-checkin-styles';
    this.styleElement.textContent = STYLES;
    document.head.appendChild(this.styleElement);
  }

  /**
   * Fetch next outreach from API
   */
  private async fetchNextOutreach(): Promise<void> {
    try {
      interface OutreachItem {
        id: string;
        personaId?: string;
        personaName?: string;
        scheduledFor: string;
        type: string;
        channel: 'sms' | 'email' | 'call' | 'push';
        preview?: { body?: string };
      }
      const response = await apiGet<{ upcoming?: OutreachItem[] }>('/api/outreach/upcoming?limit=1');
      if (response.ok && response.data) {
        const upcoming = response.data.upcoming;
        const item = upcoming?.[0];
        if (item) {
          this.nextOutreach = {
            id: item.id,
            personaId: item.personaId || 'ferni',
            personaName: item.personaName || getPersonaName(item.personaId || 'ferni'),
            scheduledFor: new Date(item.scheduledFor),
            type: item.type,
            channel: item.channel,
            preview: item.preview?.body,
          };
        } else {
          this.nextOutreach = null;
        }
        this.render();
      }
    } catch (error) {
      log.debug({ error }, 'Could not fetch next outreach');
      // Keep existing state, don't clear on error
    }
  }

  /**
   * Render the widget
   */
  private render(): void {
    if (!this.element) return;

    const compact = this.options.compact;

    if (!this.nextOutreach) {
      this.element.innerHTML = `
        <div class="next-checkin-empty">
          ${ICONS.heart}
          <span>Ferni will check in when there's something to share</span>
        </div>
      `;
      return;
    }

    const color = PERSONA_COLORS[this.nextOutreach.personaId] || PERSONA_COLORS.ferni;
    const initial = this.nextOutreach.personaName.charAt(0);
    const timeStr = formatRelativeTime(this.nextOutreach.scheduledFor);

    this.element.innerHTML = `
      <div class="next-checkin-widget ${compact ? 'next-checkin-widget--compact' : ''}" role="button" tabindex="0" aria-label="${t('accessibility.viewOutreachSchedule')}">
        <div class="next-checkin-icon" style="background: ${color}">
          ${initial}
        </div>
        <div class="next-checkin-content">
          <div class="next-checkin-label">Next check-in</div>
          <div class="next-checkin-time">
            ${ICONS.clock}
            ${timeStr}
          </div>
          ${
            this.options.showPersona !== false
              ? `
            <div class="next-checkin-persona">
              from ${this.nextOutreach.personaName}
            </div>
          `
              : ''
          }
        </div>
        <div class="next-checkin-arrow">
          ${ICONS.chevronRight}
        </div>
      </div>
    `;

    // Bind click handler - opens the consolidated Notifications panel with Upcoming tab
    const widget = this.element.querySelector('.next-checkin-widget');
    widget?.addEventListener('click', () => {
      showNotificationSettings({ tab: 'upcoming' });
    });
    widget?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        e.preventDefault();
        showNotificationSettings({ tab: 'upcoming' });
      }
    });
  }

  /**
   * Force refresh
   */
  refresh(): void {
    this.fetchNextOutreach();
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function getPersonaName(personaId: string): string {
  const names: Record<string, string> = {
    ferni: 'Ferni',
    'maya-santos': 'Maya',
    maya: 'Maya',
    'peter-john': 'Peter',
    peter: 'Peter',
    'alex-chen': 'Alex',
    alex: 'Alex',
    'jordan-taylor': 'Jordan',
    jordan: 'Jordan',
    nayan: 'Nayan',
  };
  return names[personaId] || 'Ferni';
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMs < 0) {
    return 'Soon';
  } else if (diffMins < 60) {
    return `in ${diffMins} min`;
  } else if (diffHours < 24) {
    return `in ${diffHours}h`;
  } else if (diffDays === 1) {
    return 'Tomorrow';
  } else if (diffDays < 7) {
    return `in ${diffDays} days`;
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const nextCheckinWidget = new NextCheckinWidget();

export function mountNextCheckinWidget(options?: NextCheckinOptions): HTMLElement {
  return nextCheckinWidget.mount(options);
}

export function unmountNextCheckinWidget(): void {
  nextCheckinWidget.cleanup();
}

export function refreshNextCheckin(): void {
  nextCheckinWidget.refresh();
}

export default nextCheckinWidget;
