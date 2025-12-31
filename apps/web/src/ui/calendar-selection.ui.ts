/**
 * Calendar Selection UI
 *
 * Modal for selecting which calendars to sync from external providers.
 * Users can choose specific calendars to sync rather than all of them.
 *
 * @module ui/calendar-selection
 */

import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { apiGet, apiPost } from '../utils/api.js';
import { t } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('CalendarSelection');

// ============================================================================
// TYPES
// ============================================================================

export interface CalendarItem {
  id: string;
  name: string;
  primary: boolean;
  selected: boolean;
  color?: string;
}

export type CalendarProvider = 'google' | 'apple' | 'outlook';

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`,
};

// ============================================================================
// PROVIDER ICONS
// ============================================================================

const PROVIDER_ICONS: Record<CalendarProvider, string> = {
  google: `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>`,
  apple: `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="#555" d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>`,
  outlook: `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="#0078d4" d="M7.88 12.04q0 .45-.11.87-.1.41-.33.74-.22.33-.58.52-.37.2-.87.2t-.85-.2q-.35-.21-.57-.55-.22-.33-.33-.75-.1-.42-.1-.86t.1-.87q.1-.43.34-.76.22-.34.59-.54.36-.2.87-.2t.86.2q.35.21.57.55.22.34.31.77.1.43.1.88zM24 12v9.38q0 .46-.33.8-.33.32-.8.32H7.13q-.46 0-.8-.33-.32-.33-.32-.8V18H1q-.41 0-.7-.3-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h6.13V2.55q0-.44.3-.75.3-.3.7-.3H22.88q.46 0 .79.33.33.34.33.8z"/></svg>`,
};

// ============================================================================
// CALENDAR SELECTION UI CLASS
// ============================================================================

class CalendarSelectionUI {
  private panel: HTMLElement | null = null;
  private wrapper: HTMLElement | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private isVisible = false;
  private calendars: CalendarItem[] = [];
  private currentProvider: CalendarProvider | null = null;
  private isLoading = false;
  private onClose: (() => void) | null = null;

  /**
   * Initialize the selection panel
   */
  initialize(): void {
    if (this.panel) return;

    // HMR protection
    document.querySelectorAll('.calendar-selection').forEach((el) => el.remove());

    this.injectStyles();
    this.createPanel();
  }

  /**
   * Show the selection panel for a specific provider
   */
  async show(provider: CalendarProvider, onClose?: () => void): Promise<void> {
    this.initialize();
    if (!this.panel || !this.wrapper) return;

    this.currentProvider = provider;
    this.onClose = onClose || null;

    this.renderLoading();
    this.panel.classList.add('calendar-selection--visible');
    this.isVisible = true;

    await this.loadCalendars(provider);
  }

  /**
   * Hide the panel
   */
  hide(): void {
    if (!this.panel) return;
    this.panel.classList.remove('calendar-selection--visible');
    this.isVisible = false;
    this.onClose?.();
  }

  /**
   * Toggle visibility
   */
  toggle(provider: CalendarProvider): void {
    if (this.isVisible && this.currentProvider === provider) {
      this.hide();
    } else {
      this.show(provider);
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private createPanel(): void {
    this.panel = document.createElement('div');
    this.panel.className = 'calendar-selection';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Calendar Selection');

    this.wrapper = document.createElement('div');
    this.wrapper.className = 'calendar-selection__wrapper';
    this.panel.appendChild(this.wrapper);

    // Close on backdrop click
    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) this.hide();
    });

    document.body.appendChild(this.panel);
  }

  private async loadCalendars(provider: CalendarProvider): Promise<void> {
    try {
      const userId = this.getUserId();
      const response = await apiGet<{ success: boolean; calendars: CalendarItem[] }>(
        `/api/calendar/${provider}/calendars?user_id=${encodeURIComponent(userId)}`
      );

      if (response.data?.success) {
        this.calendars = response.data.calendars;
      } else {
        this.calendars = [];
      }

      this.renderContent();
    } catch {
      this.calendars = [];
      this.renderContent();
    }
  }

  private renderLoading(): void {
    if (!this.wrapper || !this.currentProvider) return;

    const providerName = this.getProviderName(this.currentProvider);

    this.wrapper.innerHTML = `
      <header class="calendar-selection__header">
        <button class="calendar-selection__back" aria-label="${t('accessibility.back')}">${ICONS.back}</button>
        <div class="calendar-selection__provider-icon">${PROVIDER_ICONS[this.currentProvider]}</div>
        <h2 class="calendar-selection__title">${providerName} Calendars</h2>
        <button class="calendar-selection__close" aria-label="${t('common.close')}">${ICONS.close}</button>
      </header>
      <div class="calendar-selection__loading">
        <div class="calendar-selection__spinner"></div>
        <p>Loading calendars...</p>
      </div>
    `;

    this.bindCloseButton();
  }

  private renderContent(): void {
    if (!this.wrapper || !this.currentProvider) return;

    const providerName = this.getProviderName(this.currentProvider);
    const hasCalendars = this.calendars.length > 0;
    const selectedCount = this.calendars.filter((c) => c.selected).length;

    this.wrapper.innerHTML = `
      <header class="calendar-selection__header">
        <button class="calendar-selection__back" aria-label="${t('accessibility.back')}">${ICONS.back}</button>
        <div class="calendar-selection__provider-icon">${PROVIDER_ICONS[this.currentProvider]}</div>
        <h2 class="calendar-selection__title">${providerName} Calendars</h2>
        <button class="calendar-selection__close" aria-label="${t('common.close')}">${ICONS.close}</button>
      </header>
      <div class="calendar-selection__content">
        ${
          hasCalendars
            ? `
          <p class="calendar-selection__description">
            Choose which calendars to sync with Ferni. Selected calendars will appear in your unified calendar.
          </p>

          <div class="calendar-selection__select-all">
            <label class="calendar-selection__checkbox-label">
              <input type="checkbox" id="select-all" ${selectedCount === this.calendars.length ? 'checked' : ''} />
              <span class="calendar-selection__checkmark">${ICONS.check}</span>
              <span>Select All (${selectedCount}/${this.calendars.length})</span>
            </label>
          </div>

          <div class="calendar-selection__list">
            ${this.calendars.map((cal) => this.renderCalendarItem(cal)).join('')}
          </div>

          <div class="calendar-selection__actions" role="button" tabindex="0">
            <button aria-label="${t('accessibility.cancel')}" class="calendar-selection__btn calendar-selection__btn--secondary" data-action="cancel">
              Cancel
            </button>
            <button aria-label="${t('accessibility.saveSelection')}" class="calendar-selection__btn calendar-selection__btn--primary" data-action="save">
              Save Selection
            </button>
          </div>
        `
            : `
          <div class="calendar-selection__empty">
            <div class="calendar-selection__empty-icon">${ICONS.calendar}</div>
            <p>No calendars found</p>
            <span class="calendar-selection__empty-desc">
              Make sure your account has calendars configured.
            </span>
          </div>
        `
        }
      </div>
    `;

    this.bindCloseButton();
    this.bindActions();
  }

  private renderCalendarItem(calendar: CalendarItem): string {
    const colorStyle = calendar.color ? `background-color: ${calendar.color}` : '';

    return `
      <label class="calendar-selection__item" data-calendar-id="${calendar.id}">
        <input
          type="checkbox"
          name="calendar"
          value="${calendar.id}"
          ${calendar.selected ? 'checked' : ''}
        />
        <span class="calendar-selection__checkmark">${ICONS.check}</span>
        <span class="calendar-selection__color-dot" style="${colorStyle}"></span>
        <span class="calendar-selection__item-name">${this.escapeHtml(calendar.name)}</span>
        ${calendar.primary ? '<span class="calendar-selection__primary-badge">Primary</span>' : ''}
      </label>
    `;
  }

  private bindCloseButton(): void {
    this.wrapper?.querySelector('.calendar-selection__close')?.addEventListener('click', () => {
      this.hide();
    });

    this.wrapper?.querySelector('.calendar-selection__back')?.addEventListener('click', () => {
      this.hide();
    });
  }

  private bindActions(): void {
    // Select all checkbox
    const selectAll = this.wrapper?.querySelector('#select-all') as HTMLInputElement;
    selectAll?.addEventListener('change', () => {
      const checkboxes = this.wrapper?.querySelectorAll('input[name="calendar"]') as NodeListOf<HTMLInputElement>;
      checkboxes.forEach((cb) => {
        cb.checked = selectAll.checked;
      });
      this.updateSelectAllState();
    });

    // Individual checkboxes
    this.wrapper?.querySelectorAll('input[name="calendar"]').forEach((cb) => {
      cb.addEventListener('change', () => {
        this.updateSelectAllState();
      });
    });

    // Cancel button
    this.wrapper?.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
      this.hide();
    });

    // Save button
    this.wrapper?.querySelector('[data-action="save"]')?.addEventListener('click', async () => {
      await this.saveSelection();
    });
  }

  private updateSelectAllState(): void {
    const checkboxes = this.wrapper?.querySelectorAll('input[name="calendar"]') as NodeListOf<HTMLInputElement>;
    const selectAll = this.wrapper?.querySelector('#select-all') as HTMLInputElement;

    if (!checkboxes || !selectAll) return;

    const checkedCount = Array.from(checkboxes).filter((cb) => cb.checked).length;
    const totalCount = checkboxes.length;

    selectAll.checked = checkedCount === totalCount;
    selectAll.indeterminate = checkedCount > 0 && checkedCount < totalCount;

    // Update label
    const label = selectAll.parentElement?.querySelector('span:last-child');
    if (label) {
      label.textContent = `Select All (${checkedCount}/${totalCount})`;
    }
  }

  private async saveSelection(): Promise<void> {
    if (this.isLoading || !this.currentProvider) return;
    this.isLoading = true;

    const saveBtn = this.wrapper?.querySelector('[data-action="save"]') as HTMLButtonElement;
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = t('calendar.saving');
    }

    try {
      const checkboxes = this.wrapper?.querySelectorAll('input[name="calendar"]:checked') as NodeListOf<HTMLInputElement>;
      const selectedIds = Array.from(checkboxes).map((cb) => cb.value);

      const userId = this.getUserId();
      await apiPost(`/api/calendar/${this.currentProvider}/calendars/select`, {
        user_id: userId,
        calendar_ids: selectedIds,
      });

      this.hide();
    } catch (error) {
      log.error('Failed to save calendar selection:', error);
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = t('calendar.saveSelection');
      }
    } finally {
      this.isLoading = false;
    }
  }

  private getProviderName(provider: CalendarProvider): string {
    const names: Record<CalendarProvider, string> = {
      google: 'Google',
      apple: 'Apple',
      outlook: 'Outlook',
    };
    return names[provider] || provider;
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
      .calendar-selection {
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

      .calendar-selection--visible {
        opacity: 1;
        visibility: visible;
      }

      .calendar-selection__wrapper {
        width: 100%;
        max-width: clamp(294px, 90vw, 420px);
        max-height: 80vh;
        overflow-y: auto;
        background: var(--color-background-elevated, #fffdfb);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
        border-radius: var(--radius-xl, 1.5rem);
        box-shadow: var(--shadow-2xl, 0 24px 48px rgba(44, 37, 32, 0.15));
        transform: ${prefersReducedMotion() ? 'none' : 'scale(0.95)'};
        transition: transform ${DURATION.SLOW}ms ${EASING.SPRING};
      }

      .calendar-selection--visible .calendar-selection__wrapper {
        transform: scale(1);
      }

      .calendar-selection__header {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--ma-rest, 21px) var(--ma-silence, 34px);
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
        position: sticky;
        top: 0;
        background: var(--color-background-elevated, #fffdfb);
        z-index: var(--z-docked);
      }

      .calendar-selection__back {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        padding: 0;
        background: transparent;
        border: none;
        color: var(--color-text-secondary, #5c544a);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .calendar-selection__back:hover {
        color: var(--color-text-primary, #2c2520);
      }

      .calendar-selection__back svg {
        width: 20px;
        height: 20px;
      }

      .calendar-selection__provider-icon {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .calendar-selection__title {
        flex: 1;
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-lg, 1.125rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
        margin: 0;
      }

      .calendar-selection__close {
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

      .calendar-selection__close:hover {
        background: var(--color-background-secondary, #f5f2ed);
        color: var(--color-text-primary, #2c2520);
      }

      .calendar-selection__close svg {
        width: 16px;
        height: 16px;
      }

      .calendar-selection__content {
        padding: var(--ma-rest, 21px) var(--ma-silence, 34px);
      }

      .calendar-selection__loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: var(--ma-vastness, 89px) var(--ma-rest, 21px);
      }

      .calendar-selection__spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--color-border-subtle, rgba(44, 37, 32, 0.1));
        border-top-color: var(--color-accent-primary, #2d5a3d);
        border-radius: 50%;
        animation: selection-spin 0.8s linear infinite;
        margin-bottom: var(--ma-breath, 13px);
      }

      @keyframes selection-spin {
        to { transform: rotate(360deg); }
      }

      .calendar-selection__loading p {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-muted, #756a5e);
        margin: 0;
      }

      .calendar-selection__description {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary, #5c544a);
        margin: 0 0 var(--ma-breath, 13px) 0;
        line-height: 1.5;
      }

      .calendar-selection__select-all {
        padding: var(--space-3, 12px);
        background: var(--color-background-secondary, #f5f2ed);
        border-radius: var(--radius-md, 8px);
        margin-bottom: var(--space-3, 12px);
      }

      .calendar-selection__checkbox-label {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        cursor: pointer;
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-primary, #2c2520);
      }

      .calendar-selection__checkbox-label input[type="checkbox"] {
        position: absolute;
        opacity: 0;
        width: 0;
        height: 0;
      }

      .calendar-selection__checkmark {
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-background-elevated, #fffdfb);
        border: 2px solid var(--color-border-subtle, rgba(44, 37, 32, 0.2));
        border-radius: var(--radius-sm, 4px);
        color: transparent;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .calendar-selection__checkmark svg {
        width: 14px;
        height: 14px;
      }

      .calendar-selection__checkbox-label input:checked + .calendar-selection__checkmark {
        background: var(--color-accent-primary, #2d5a3d);
        border-color: var(--color-accent-primary, #2d5a3d);
        color: white;
      }

      .calendar-selection__checkbox-label input:focus-visible + .calendar-selection__checkmark {
        outline: 2px solid var(--color-accent-primary, #2d5a3d);
        outline-offset: 2px;
      }

      .calendar-selection__list {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
        margin-bottom: var(--ma-rest, 21px);
      }

      .calendar-selection__item {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--space-3, 12px);
        background: var(--color-background-secondary, #f5f2ed);
        border-radius: var(--radius-md, 8px);
        cursor: pointer;
        transition: background ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .calendar-selection__item:hover {
        background: var(--color-background-tertiary, #ebe6df);
      }

      .calendar-selection__item input[type="checkbox"] {
        position: absolute;
        opacity: 0;
        width: 0;
        height: 0;
      }

      .calendar-selection__color-dot {
        width: 12px;
        height: 12px;
        border-radius: var(--radius-full, 9999px);
        background: var(--color-accent-primary, #2d5a3d);
        flex-shrink: 0;
      }

      .calendar-selection__item-name {
        flex: 1;
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-primary, #2c2520);
      }

      .calendar-selection__primary-badge {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-weight-medium, 500);
        padding: 2px 8px;
        background: var(--color-accent-primary, #2d5a3d);
        color: white;
        border-radius: var(--radius-full, 9999px);
      }

      .calendar-selection__empty {
        text-align: center;
        padding: var(--ma-rest, 21px);
      }

      .calendar-selection__empty-icon {
        width: 48px;
        height: 48px;
        margin: 0 auto var(--ma-breath, 13px);
        color: var(--color-text-muted, #756a5e);
      }

      .calendar-selection__empty-icon svg {
        width: 100%;
        height: 100%;
      }

      .calendar-selection__empty p {
        font-family: var(--font-display);
        font-size: var(--text-base, 1rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
        margin: 0 0 var(--space-1, 4px) 0;
      }

      .calendar-selection__empty-desc {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-muted, #756a5e);
      }

      .calendar-selection__actions {
        display: flex;
        gap: var(--space-3, 12px);
        justify-content: flex-end;
      }

      .calendar-selection__btn {
        padding: var(--space-3, 12px) var(--space-4, 16px);
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        border: none;
        border-radius: var(--radius-lg, 12px);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .calendar-selection__btn--primary {
        background: var(--color-accent-primary, #2d5a3d);
        color: white;
      }

      .calendar-selection__btn--primary:hover {
        background: var(--color-accent-secondary, #3d7a52);
      }

      .calendar-selection__btn--secondary {
        background: transparent;
        color: var(--color-text-muted, #756a5e);
      }

      .calendar-selection__btn--secondary:hover {
        background: var(--color-background-secondary, #f5f2ed);
        color: var(--color-text-secondary, #5c544a);
      }

      .calendar-selection__btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      /* Dark theme */
      [data-theme="midnight"] .calendar-selection__wrapper {
        background: var(--color-background-elevated, #70605a);
      }

      [data-theme="midnight"] .calendar-selection__header {
        background: var(--color-background-elevated, #70605a);
      }

      [data-theme="midnight"] .calendar-selection__title,
      [data-theme="midnight"] .calendar-selection__empty p,
      [data-theme="midnight"] .calendar-selection__item-name,
      [data-theme="midnight"] .calendar-selection__checkbox-label {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .calendar-selection__select-all,
      [data-theme="midnight"] .calendar-selection__item {
        background: var(--color-background-tertiary, #685852);
      }

      [data-theme="midnight"] .calendar-selection__item:hover {
        background: var(--color-background-secondary, #60504a);
      }

      [data-theme="midnight"] .calendar-selection__checkmark {
        background: var(--color-background-secondary, #60504a);
        border-color: var(--color-border-subtle, rgba(255, 255, 255, 0.2));
      }

      @media (max-width: clamp(336px, 90vw, 480px)) {
        .calendar-selection__wrapper {
          max-width: 100%;
          max-height: 90vh;
          border-radius: var(--radius-xl, 16px) var(--radius-xl, 16px) 0 0;
          margin-top: auto;
        }

        .calendar-selection__actions {
          flex-direction: column;
        }

        .calendar-selection__btn {
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

let instance: CalendarSelectionUI | null = null;

export function getCalendarSelectionUI(): CalendarSelectionUI {
  if (!instance) {
    instance = new CalendarSelectionUI();
  }
  return instance;
}

export function showCalendarSelection(provider: CalendarProvider, onClose?: () => void): void {
  getCalendarSelectionUI().show(provider, onClose);
}

export function hideCalendarSelection(): void {
  getCalendarSelectionUI().hide();
}

export default CalendarSelectionUI;

