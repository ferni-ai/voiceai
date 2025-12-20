/**
 * Calendar Conflicts UI
 *
 * Modal for viewing and resolving calendar sync conflicts.
 * Allows users to choose which version to keep or merge.
 *
 * @module ui/calendar-conflicts
 */

import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { apiGet, apiPost, apiDelete, apiPut } from '../utils/api.js';
import { t } from '../i18n/index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface CalendarConflict {
  id: string;
  eventId: string;
  provider: 'google' | 'apple' | 'outlook';
  ferniEvent: ConflictEventData;
  providerEvent: ConflictEventData;
  conflictType: 'modified' | 'deleted' | 'both-modified';
  detectedAt: string;
}

export interface ConflictEventData {
  id?: string;
  title?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  description?: string;
  isAllDay?: boolean;
  status?: string;
}

export type ConflictResolution = 'ferni-wins' | 'provider-wins' | 'newest-wins' | 'manual';

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
};

// ============================================================================
// CALENDAR CONFLICTS UI CLASS
// ============================================================================

class CalendarConflictsUI {
  private panel: HTMLElement | null = null;
  private wrapper: HTMLElement | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private isVisible = false;
  private conflicts: CalendarConflict[] = [];
  private isLoading = false;
  private preferredResolution: ConflictResolution = 'manual';

  /**
   * Initialize the conflicts panel
   */
  initialize(): void {
    if (this.panel) return;

    // HMR protection
    document.querySelectorAll('.calendar-conflicts').forEach((el) => el.remove());

    this.injectStyles();
    this.createPanel();
  }

  /**
   * Show the conflicts panel
   */
  async show(): Promise<void> {
    this.initialize();
    if (!this.panel || !this.wrapper) return;

    this.renderLoading();
    this.panel.classList.add('calendar-conflicts--visible');
    this.isVisible = true;

    await this.loadConflicts();
  }

  /**
   * Hide the panel
   */
  hide(): void {
    if (!this.panel) return;
    this.panel.classList.remove('calendar-conflicts--visible');
    this.isVisible = false;
  }

  /**
   * Toggle visibility
   */
  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private createPanel(): void {
    this.panel = document.createElement('div');
    this.panel.className = 'calendar-conflicts';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Calendar Conflicts');

    this.wrapper = document.createElement('div');
    this.wrapper.className = 'calendar-conflicts__wrapper';
    this.panel.appendChild(this.wrapper);

    // Close on backdrop click
    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) this.hide();
    });

    document.body.appendChild(this.panel);
  }

  private async loadConflicts(): Promise<void> {
    try {
      const response = await apiGet<{ success: boolean; conflicts: CalendarConflict[]; preference: ConflictResolution }>(
        '/api/calendar/conflicts'
      );

      if (response.data?.success) {
        this.conflicts = response.data.conflicts;
        this.preferredResolution = response.data.preference || 'manual';
      } else {
        this.conflicts = [];
      }

      this.renderContent();
    } catch {
      this.conflicts = [];
      this.renderContent();
    }
  }

  private renderLoading(): void {
    if (!this.wrapper) return;

    this.wrapper.innerHTML = `
      <header class="calendar-conflicts__header">
        <div class="calendar-conflicts__icon">${ICONS.alert}</div>
        <h2 class="calendar-conflicts__title">Sync Conflicts</h2>
        <button class="calendar-conflicts__close" aria-label="${t('common.close')}">${ICONS.close}</button>
      </header>
      <div class="calendar-conflicts__loading">
        <div class="calendar-conflicts__spinner"></div>
        <p>Checking for conflicts...</p>
      </div>
    `;

    this.bindCloseButton();
  }

  private renderContent(): void {
    if (!this.wrapper) return;

    const hasConflicts = this.conflicts.length > 0;

    this.wrapper.innerHTML = `
      <header class="calendar-conflicts__header">
        <div class="calendar-conflicts__icon">${ICONS.alert}</div>
        <h2 class="calendar-conflicts__title">Sync Conflicts</h2>
        <button class="calendar-conflicts__close" aria-label="${t('common.close')}">${ICONS.close}</button>
      </header>
      <div class="calendar-conflicts__content">
        ${
          hasConflicts
            ? this.renderConflictsList()
            : `
          <div class="calendar-conflicts__empty">
            <div class="calendar-conflicts__empty-icon">${ICONS.check}</div>
            <p>No conflicts found</p>
            <span class="calendar-conflicts__empty-desc">Your calendars are in sync!</span>
          </div>
        `
        }

        <div class="calendar-conflicts__settings">
          <h3>Default Resolution</h3>
          <p>How should future conflicts be handled automatically?</p>
          <select class="calendar-conflicts__select" id="conflict-preference">
            <option value="manual" ${this.preferredResolution === 'manual' ? 'selected' : ''}>
              Ask me each time
            </option>
            <option value="ferni-wins" ${this.preferredResolution === 'ferni-wins' ? 'selected' : ''}>
              Always use Ferni's version
            </option>
            <option value="provider-wins" ${this.preferredResolution === 'provider-wins' ? 'selected' : ''}>
              Always use provider's version
            </option>
            <option value="newest-wins" ${this.preferredResolution === 'newest-wins' ? 'selected' : ''}>
              Keep the newest version
            </option>
          </select>
        </div>

        ${
          hasConflicts
            ? `
          <div class="calendar-conflicts__actions">
            <button class="calendar-conflicts__btn calendar-conflicts__btn--secondary" data-action="auto-resolve">
              ${ICONS.refresh}
              <span>Auto-resolve All</span>
            </button>
          </div>
        `
            : ''
        }
      </div>
    `;

    this.bindCloseButton();
    this.bindActions();
  }

  private renderConflictsList(): string {
    return `
      <div class="calendar-conflicts__list">
        ${this.conflicts.map((conflict) => this.renderConflictCard(conflict)).join('')}
      </div>
    `;
  }

  private renderConflictCard(conflict: CalendarConflict): string {
    const providerName = this.getProviderName(conflict.provider);
    const ferniTitle = conflict.ferniEvent.title || '(No title)';
    const providerTitle = conflict.providerEvent.title || '(No title)';

    const ferniTime = this.formatDateTime(conflict.ferniEvent.startTime, conflict.ferniEvent.endTime);
    const providerTime = this.formatDateTime(conflict.providerEvent.startTime, conflict.providerEvent.endTime);

    return `
      <div class="calendar-conflicts__card" data-conflict-id="${conflict.id}">
        <div class="calendar-conflicts__card-header">
          <span class="calendar-conflicts__conflict-type">${this.getConflictTypeLabel(conflict.conflictType)}</span>
          <span class="calendar-conflicts__detected">Detected ${this.formatTimeAgo(conflict.detectedAt)}</span>
        </div>

        <div class="calendar-conflicts__comparison">
          <div class="calendar-conflicts__version calendar-conflicts__version--ferni">
            <span class="calendar-conflicts__version-label">Ferni Calendar</span>
            <div class="calendar-conflicts__event-title">${this.escapeHtml(ferniTitle)}</div>
            <div class="calendar-conflicts__event-time">${ferniTime}</div>
            ${conflict.ferniEvent.location ? `<div class="calendar-conflicts__event-location">${this.escapeHtml(conflict.ferniEvent.location)}</div>` : ''}
          </div>

          <div class="calendar-conflicts__vs">vs</div>

          <div class="calendar-conflicts__version calendar-conflicts__version--provider">
            <span class="calendar-conflicts__version-label">${providerName}</span>
            <div class="calendar-conflicts__event-title">${this.escapeHtml(providerTitle)}</div>
            <div class="calendar-conflicts__event-time">${providerTime}</div>
            ${conflict.providerEvent.location ? `<div class="calendar-conflicts__event-location">${this.escapeHtml(conflict.providerEvent.location)}</div>` : ''}
          </div>
        </div>

        <div class="calendar-conflicts__card-actions">
          <button class="calendar-conflicts__resolve-btn" data-action="resolve" data-resolution="ferni-wins" data-id="${conflict.id}">
            Keep Ferni
          </button>
          <button class="calendar-conflicts__resolve-btn" data-action="resolve" data-resolution="provider-wins" data-id="${conflict.id}">
            Keep ${providerName}
          </button>
          <button class="calendar-conflicts__resolve-btn calendar-conflicts__resolve-btn--dismiss" data-action="dismiss" data-id="${conflict.id}">
            Dismiss
          </button>
        </div>
      </div>
    `;
  }

  private bindCloseButton(): void {
    this.wrapper?.querySelector('.calendar-conflicts__close')?.addEventListener('click', () => {
      this.hide();
    });
  }

  private bindActions(): void {
    // Preference change
    const select = this.wrapper?.querySelector('#conflict-preference') as HTMLSelectElement;
    select?.addEventListener('change', async () => {
      await this.savePreference(select.value as ConflictResolution);
    });

    // Resolve buttons
    this.wrapper?.querySelectorAll('[data-action="resolve"]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const target = e.currentTarget as HTMLElement;
        const conflictId = target.dataset.id;
        const resolution = target.dataset.resolution as ConflictResolution;
        if (conflictId && resolution) {
          await this.resolveConflict(conflictId, resolution);
        }
      });
    });

    // Dismiss buttons
    this.wrapper?.querySelectorAll('[data-action="dismiss"]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const target = e.currentTarget as HTMLElement;
        const conflictId = target.dataset.id;
        if (conflictId) {
          await this.dismissConflict(conflictId);
        }
      });
    });

    // Auto-resolve all
    this.wrapper?.querySelector('[data-action="auto-resolve"]')?.addEventListener('click', async () => {
      await this.autoResolveAll();
    });
  }

  private async resolveConflict(conflictId: string, resolution: ConflictResolution): Promise<void> {
    if (this.isLoading) return;
    this.isLoading = true;

    const card = this.wrapper?.querySelector(`[data-conflict-id="${conflictId}"]`);
    if (card) {
      card.classList.add('calendar-conflicts__card--resolving');
    }

    try {
      const userId = this.getUserId();
      await apiPost(`/api/calendar/conflicts/${conflictId}/resolve`, {
        user_id: userId,
        strategy: resolution,
      });

      // Remove from list
      this.conflicts = this.conflicts.filter((c) => c.id !== conflictId);
      this.renderContent();
    } catch (error) {
      card?.classList.remove('calendar-conflicts__card--resolving');
      console.error('Failed to resolve conflict:', error);
    } finally {
      this.isLoading = false;
    }
  }

  private async dismissConflict(conflictId: string): Promise<void> {
    if (this.isLoading) return;
    this.isLoading = true;

    try {
      const userId = this.getUserId();
      await apiDelete(`/api/calendar/conflicts/${conflictId}?user_id=${encodeURIComponent(userId)}`);

      this.conflicts = this.conflicts.filter((c) => c.id !== conflictId);
      this.renderContent();
    } catch (error) {
      console.error('Failed to dismiss conflict:', error);
    } finally {
      this.isLoading = false;
    }
  }

  private async autoResolveAll(): Promise<void> {
    if (this.isLoading || this.conflicts.length === 0) return;
    this.isLoading = true;

    const btn = this.wrapper?.querySelector('[data-action="auto-resolve"]') as HTMLButtonElement;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `${ICONS.refresh}<span>Resolving...</span>`;
    }

    try {
      const userId = this.getUserId();
      await apiPost('/api/calendar/conflicts/auto-resolve', {
        user_id: userId,
        strategy: this.preferredResolution,
      });

      // Reload conflicts
      await this.loadConflicts();
    } catch (error) {
      console.error('Failed to auto-resolve conflicts:', error);
    } finally {
      this.isLoading = false;
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `${ICONS.refresh}<span>Auto-resolve All</span>`;
      }
    }
  }

  private async savePreference(preference: ConflictResolution): Promise<void> {
    try {
      const userId = this.getUserId();
      await apiPut('/api/calendar/conflicts/preference', {
        user_id: userId,
        strategy: preference,
      });
      this.preferredResolution = preference;
    } catch (error) {
      console.error('Failed to save preference:', error);
    }
  }

  private getProviderName(provider: string): string {
    const names: Record<string, string> = {
      google: 'Google',
      apple: 'Apple',
      outlook: 'Outlook',
    };
    return names[provider] || provider;
  }

  private getConflictTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      modified: 'Modified',
      deleted: 'Deleted',
      'both-modified': 'Both Changed',
    };
    return labels[type] || type;
  }

  private formatDateTime(start?: string, end?: string): string {
    if (!start) return 'No time set';

    try {
      const startDate = new Date(start);
      const options: Intl.DateTimeFormatOptions = {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      };

      let result = startDate.toLocaleString('en-US', options);

      if (end) {
        const endDate = new Date(end);
        const endTime = endDate.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        });
        result += ` - ${endTime}`;
      }

      return result;
    } catch {
      return start;
    }
  }

  private formatTimeAgo(dateString: string): string {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      return `${diffDays}d ago`;
    } catch {
      return dateString;
    }
  }

  private getUserId(): string {
    return localStorage.getItem('ferni_user_id') || 'anonymous';
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
      .calendar-conflicts {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal, 1400);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--ma-rest, 21px);
        background: var(--backdrop-page, rgba(44, 37, 32, 0.4));
        backdrop-filter: blur(var(--glass-blur-subtle, 8px));
        -webkit-backdrop-filter: blur(var(--glass-blur-subtle, 8px));
        opacity: 0;
        visibility: hidden;
        transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD}, visibility ${DURATION.SLOW}ms;
      }

      .calendar-conflicts--visible {
        opacity: 1;
        visibility: visible;
      }

      .calendar-conflicts__wrapper {
        width: 100%;
        max-width: 560px;
        max-height: 80vh;
        overflow-y: auto;
        background: var(--color-background-elevated, #fffdfb);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
        border-radius: var(--radius-xl, 1.5rem);
        box-shadow: var(--shadow-2xl, 0 24px 48px rgba(44, 37, 32, 0.15));
        transform: ${prefersReducedMotion() ? 'none' : 'scale(0.95)'};
        transition: transform ${DURATION.SLOW}ms ${EASING.SPRING};
      }

      .calendar-conflicts--visible .calendar-conflicts__wrapper {
        transform: scale(1);
      }

      .calendar-conflicts__header {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--ma-rest, 21px) var(--ma-silence, 34px);
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
        position: sticky;
        top: 0;
        background: var(--color-background-elevated, #fffdfb);
        z-index: 1;
      }

      .calendar-conflicts__icon {
        width: 24px;
        height: 24px;
        color: var(--color-semantic-warning, #c4856a);
      }

      .calendar-conflicts__icon svg {
        width: 100%;
        height: 100%;
      }

      .calendar-conflicts__title {
        flex: 1;
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-lg, 1.125rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
        margin: 0;
      }

      .calendar-conflicts__close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        padding: 0;
        background: var(--color-background-tertiary, #ebe6df);
        border: none;
        border-radius: var(--radius-full, 9999px);
        color: var(--color-text-secondary, #5c544a);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .calendar-conflicts__close:hover {
        background: var(--color-background-secondary, #f5f2ed);
        color: var(--color-text-primary, #2c2520);
      }

      .calendar-conflicts__close svg {
        width: 16px;
        height: 16px;
      }

      .calendar-conflicts__content {
        padding: var(--ma-rest, 21px) var(--ma-silence, 34px);
      }

      .calendar-conflicts__loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: var(--ma-vastness, 89px) var(--ma-rest, 21px);
      }

      .calendar-conflicts__spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--color-border-subtle, rgba(44, 37, 32, 0.1));
        border-top-color: var(--color-accent-primary, #2d5a3d);
        border-radius: 50%;
        animation: conflicts-spin 0.8s linear infinite;
        margin-bottom: var(--ma-breath, 13px);
      }

      @keyframes conflicts-spin {
        to { transform: rotate(360deg); }
      }

      .calendar-conflicts__loading p {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-muted, #756a5e);
        margin: 0;
      }

      .calendar-conflicts__empty {
        text-align: center;
        padding: var(--ma-rest, 21px);
      }

      .calendar-conflicts__empty-icon {
        width: 48px;
        height: 48px;
        margin: 0 auto var(--ma-breath, 13px);
        color: var(--color-semantic-success, #4a6741);
      }

      .calendar-conflicts__empty-icon svg {
        width: 100%;
        height: 100%;
      }

      .calendar-conflicts__empty p {
        font-family: var(--font-display);
        font-size: var(--text-base, 1rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
        margin: 0 0 var(--space-1, 4px) 0;
      }

      .calendar-conflicts__empty-desc {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-muted, #756a5e);
      }

      .calendar-conflicts__list {
        display: flex;
        flex-direction: column;
        gap: var(--space-4, 16px);
        margin-bottom: var(--ma-rest, 21px);
      }

      .calendar-conflicts__card {
        background: var(--color-background-secondary, #f5f2ed);
        border-radius: var(--radius-lg, 12px);
        padding: var(--space-4, 16px);
        transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD};
      }

      .calendar-conflicts__card--resolving {
        opacity: 0.5;
        pointer-events: none;
      }

      .calendar-conflicts__card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-3, 12px);
      }

      .calendar-conflicts__conflict-type {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-semantic-warning, #c4856a);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .calendar-conflicts__detected {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
      }

      .calendar-conflicts__comparison {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        gap: var(--space-3, 12px);
        align-items: start;
        margin-bottom: var(--space-4, 16px);
      }

      .calendar-conflicts__version {
        padding: var(--space-3, 12px);
        background: var(--color-background-elevated, #fffdfb);
        border-radius: var(--radius-md, 8px);
      }

      .calendar-conflicts__version-label {
        display: block;
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-muted, #756a5e);
        margin-bottom: var(--space-2, 8px);
      }

      .calendar-conflicts__version--ferni .calendar-conflicts__version-label {
        color: var(--color-ferni, #4a6741);
      }

      .calendar-conflicts__event-title {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary, #2c2520);
        margin-bottom: var(--space-1, 4px);
      }

      .calendar-conflicts__event-time,
      .calendar-conflicts__event-location {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-secondary, #5c544a);
      }

      .calendar-conflicts__vs {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
        padding-top: var(--space-6, 24px);
      }

      .calendar-conflicts__card-actions {
        display: flex;
        gap: var(--space-2, 8px);
        flex-wrap: wrap;
      }

      .calendar-conflicts__resolve-btn {
        flex: 1;
        min-width: 80px;
        padding: var(--space-2, 8px) var(--space-3, 12px);
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-weight-medium, 500);
        background: var(--color-accent-primary, #2d5a3d);
        color: white;
        border: none;
        border-radius: var(--radius-md, 8px);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .calendar-conflicts__resolve-btn:hover {
        background: var(--color-accent-secondary, #3d7a52);
      }

      .calendar-conflicts__resolve-btn--dismiss {
        background: transparent;
        color: var(--color-text-muted, #756a5e);
        flex: 0;
      }

      .calendar-conflicts__resolve-btn--dismiss:hover {
        background: var(--color-background-tertiary, #ebe6df);
        color: var(--color-text-secondary, #5c544a);
      }

      .calendar-conflicts__settings {
        padding: var(--space-4, 16px);
        background: var(--color-background-secondary, #f5f2ed);
        border-radius: var(--radius-lg, 12px);
        margin-bottom: var(--ma-breath, 13px);
      }

      .calendar-conflicts__settings h3 {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary, #2c2520);
        margin: 0 0 var(--space-1, 4px) 0;
      }

      .calendar-conflicts__settings p {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
        margin: 0 0 var(--space-3, 12px) 0;
      }

      .calendar-conflicts__select {
        width: 100%;
        padding: var(--space-2, 8px) var(--space-3, 12px);
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-primary, #2c2520);
        background: var(--color-background-elevated, #fffdfb);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.1));
        border-radius: var(--radius-md, 8px);
        cursor: pointer;
      }

      .calendar-conflicts__select:focus {
        outline: none;
        border-color: var(--color-accent-primary, #2d5a3d);
      }

      .calendar-conflicts__actions {
        display: flex;
        justify-content: center;
      }

      .calendar-conflicts__btn {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        padding: var(--space-3, 12px) var(--space-4, 16px);
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        border: none;
        border-radius: var(--radius-lg, 12px);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .calendar-conflicts__btn svg {
        width: 16px;
        height: 16px;
      }

      .calendar-conflicts__btn--secondary {
        background: var(--color-background-tertiary, #ebe6df);
        color: var(--color-text-primary, #2c2520);
      }

      .calendar-conflicts__btn--secondary:hover {
        background: var(--color-background-secondary, #f5f2ed);
      }

      .calendar-conflicts__btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      /* Dark theme */
      [data-theme="midnight"] .calendar-conflicts__wrapper {
        background: var(--color-background-elevated, #70605a);
      }

      [data-theme="midnight"] .calendar-conflicts__header {
        background: var(--color-background-elevated, #70605a);
      }

      [data-theme="midnight"] .calendar-conflicts__title,
      [data-theme="midnight"] .calendar-conflicts__empty p,
      [data-theme="midnight"] .calendar-conflicts__event-title,
      [data-theme="midnight"] .calendar-conflicts__settings h3 {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .calendar-conflicts__card,
      [data-theme="midnight"] .calendar-conflicts__settings {
        background: var(--color-background-tertiary, #685852);
      }

      [data-theme="midnight"] .calendar-conflicts__version {
        background: var(--color-background-secondary, #60504a);
      }

      [data-theme="midnight"] .calendar-conflicts__select {
        background: var(--color-background-secondary, #60504a);
        border-color: var(--color-border-subtle, rgba(255, 255, 255, 0.1));
        color: var(--color-text-primary, #faf6f0);
      }

      @media (max-width: 480px) {
        .calendar-conflicts__wrapper {
          max-width: 100%;
          max-height: 90vh;
          border-radius: var(--radius-xl, 16px) var(--radius-xl, 16px) 0 0;
          margin-top: auto;
        }

        .calendar-conflicts__comparison {
          grid-template-columns: 1fr;
        }

        .calendar-conflicts__vs {
          display: none;
        }

        .calendar-conflicts__card-actions {
          flex-direction: column;
        }

        .calendar-conflicts__resolve-btn {
          flex: none;
          width: 100%;
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

let instance: CalendarConflictsUI | null = null;

export function getCalendarConflictsUI(): CalendarConflictsUI {
  if (!instance) {
    instance = new CalendarConflictsUI();
  }
  return instance;
}

export function showCalendarConflicts(): void {
  getCalendarConflictsUI().show();
}

export function hideCalendarConflicts(): void {
  getCalendarConflictsUI().hide();
}

export default CalendarConflictsUI;

