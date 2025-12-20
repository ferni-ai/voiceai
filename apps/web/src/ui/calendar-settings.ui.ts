/**
 * Calendar Settings UI
 *
 * Settings panel for managing Google Calendar integration.
 * Allows users to connect/disconnect their calendar and manage preferences.
 *
 * DESIGN PRINCIPLES:
 *   - Centered floating modal (brand-compliant)
 *   - Clear connection status indicator
 *   - Simple connect/disconnect flow
 *   - Warmth-focused animations
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { apiGet, apiPost } from '../utils/api.js';

// ============================================================================
// TYPES
// ============================================================================

export interface CalendarStatus {
  connected: boolean;
  email?: string;
  calendarName?: string;
  lastSynced?: string;
  scopes?: string[];
}

export interface CalendarSettingsCallbacks {
  onClose?: () => void;
  onConnectionChange?: (connected: boolean) => void;
}

// ============================================================================
// ICONS (Lucide-style, 2px stroke, rounded)
// ============================================================================

const ICONS = {
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>`,
  mail: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect width="20" height="16" x="2" y="4" rx="2"/>
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
  </svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>`,
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>`,
  unlink: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71"/>
    <path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71"/>
    <line x1="8" y1="2" x2="8" y2="5"/>
    <line x1="2" y1="8" x2="5" y2="8"/>
    <line x1="16" y1="19" x2="16" y2="22"/>
    <line x1="19" y1="16" x2="22" y2="16"/>
  </svg>`,
  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
    <path d="M21 3v5h-5"/>
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
    <path d="M8 16H3v5"/>
  </svg>`,
};

// ============================================================================
// CALENDAR SETTINGS UI CLASS
// ============================================================================

class CalendarSettingsUI {
  private panel: HTMLElement | null = null;
  private wrapper: HTMLElement | null = null;
  private callbacks: CalendarSettingsCallbacks = {};
  private styleElement: HTMLStyleElement | null = null;
  private isVisible = false;
  private status: CalendarStatus | null = null;
  private isLoading = false;

  /**
   * Initialize the settings panel
   */
  initialize(): void {
    if (this.panel) return;

    // HMR protection
    document.querySelectorAll('.calendar-settings').forEach((el) => el.remove());

    this.injectStyles();
    this.createPanel();
  }

  /**
   * Set callbacks
   */
  setCallbacks(callbacks: CalendarSettingsCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Show the settings panel
   */
  async show(): Promise<void> {
    this.initialize();
    if (!this.panel || !this.wrapper) return;

    this.renderLoading();
    this.panel.classList.add('calendar-settings--visible');
    this.isVisible = true;

    // Fetch current status
    await this.loadStatus();
  }

  /**
   * Hide the settings panel
   */
  hide(): void {
    if (!this.panel) return;

    this.panel.classList.remove('calendar-settings--visible');
    this.isVisible = false;
    this.callbacks.onClose?.();
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
    this.panel.className = 'calendar-settings';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Calendar Settings');

    this.wrapper = document.createElement('div');
    this.wrapper.className = 'calendar-settings__wrapper';
    this.panel.appendChild(this.wrapper);

    // Close on backdrop click
    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) this.hide();
    });

    document.body.appendChild(this.panel);
  }

  private async loadStatus(): Promise<void> {
    try {
      const response = await apiGet<{ success: boolean; status: CalendarStatus }>(
        '/api/calendar/status'
      );

      if (response.data?.success) {
        this.status = response.data.status;
        this.renderContent();
      } else {
        this.renderError('Unable to load calendar status');
      }
    } catch {
      // Assume not connected if API fails
      this.status = { connected: false };
      this.renderContent();
    }
  }

  private renderLoading(): void {
    if (!this.wrapper) return;

    this.wrapper.innerHTML = `
      <header class="calendar-settings__header">
        <div class="calendar-settings__icon">${ICONS.calendar}</div>
        <h2 class="calendar-settings__title">Calendar</h2>
        <button class="calendar-settings__close" aria-label="${t('common.close')}">
          ${ICONS.close}
        </button>
      </header>
      <div class="calendar-settings__loading">
        <div class="calendar-settings__spinner"></div>
        <p>Loading calendar settings...</p>
      </div>
    `;

    this.bindCloseButton();
  }

  private renderContent(): void {
    if (!this.wrapper || !this.status) return;

    const connectedContent = this.status.connected
      ? `
        <div class="calendar-settings__status calendar-settings__status--connected">
          <div class="calendar-settings__status-icon">${ICONS.check}</div>
          <div class="calendar-settings__status-text">
            <span class="calendar-settings__status-label">Google Connected</span>
            ${this.status.email ? `<span class="calendar-settings__status-detail">${this.escapeHtml(this.status.email)}</span>` : ''}
          </div>
        </div>

        <div class="calendar-settings__services">
          <div class="calendar-settings__service">
            <div class="calendar-settings__service-icon">${ICONS.calendar}</div>
            <div class="calendar-settings__service-name">Calendar</div>
            <div class="calendar-settings__service-status calendar-settings__service-status--active">Active</div>
          </div>
          <div class="calendar-settings__service">
            <div class="calendar-settings__service-icon">${ICONS.mail}</div>
            <div class="calendar-settings__service-name">Gmail (read-only)</div>
            <div class="calendar-settings__service-status calendar-settings__service-status--active">Active</div>
          </div>
        </div>

        ${
          this.status.calendarName
            ? `
          <div class="calendar-settings__info">
            <span class="calendar-settings__info-label">Primary Calendar</span>
            <span class="calendar-settings__info-value">${this.escapeHtml(this.status.calendarName)}</span>
          </div>
        `
            : ''
        }

        ${
          this.status.lastSynced
            ? `
          <div class="calendar-settings__info">
            <span class="calendar-settings__info-label">Last synced</span>
            <span class="calendar-settings__info-value">${this.formatDate(this.status.lastSynced)}</span>
          </div>
        `
            : ''
        }

        <div class="calendar-settings__actions">
          <button class="calendar-settings__btn calendar-settings__btn--secondary" data-action="sync">
            ${ICONS.refresh}
            <span>Sync Now</span>
          </button>
          <button class="calendar-settings__btn calendar-settings__btn--danger" data-action="disconnect">
            ${ICONS.unlink}
            <span>Disconnect</span>
          </button>
        </div>
      `
      : `
        <div class="calendar-settings__status calendar-settings__status--disconnected">
          <div class="calendar-settings__status-icon">${ICONS.calendar}</div>
          <div class="calendar-settings__status-text">
            <span class="calendar-settings__status-label">Not connected</span>
            <span class="calendar-settings__status-detail">Connect your calendar to enable smart scheduling</span>
          </div>
        </div>

        <div class="calendar-settings__benefits">
          <h3>What you'll unlock:</h3>
          <ul>
            <li>Calendar: Smart scheduling through voice</li>
            <li>Calendar: Context-aware coaching based on your schedule</li>
            <li>Gmail: Inbox triage and email summaries (read-only)</li>
            <li>Gmail: Help prioritizing what needs your attention</li>
          </ul>
        </div>

        <div class="calendar-settings__actions">
          <button class="calendar-settings__btn calendar-settings__btn--primary" data-action="connect">
            ${ICONS.link}
            <span>Connect Google Account</span>
          </button>
        </div>

        <p class="calendar-settings__privacy">
          We only read your calendar and inbox to help you. Your data stays private. We never send emails on your behalf.
        </p>
      `;

    this.wrapper.innerHTML = `
      <header class="calendar-settings__header">
        <div class="calendar-settings__icon">${ICONS.calendar}</div>
        <h2 class="calendar-settings__title">Google Connection</h2>
        <button class="calendar-settings__close" aria-label="${t('common.close')}">
          ${ICONS.close}
        </button>
      </header>
      <div class="calendar-settings__content">
        ${connectedContent}
      </div>
    `;

    this.bindCloseButton();
    this.bindActions();
  }

  private renderError(message: string): void {
    if (!this.wrapper) return;

    this.wrapper.innerHTML = `
      <header class="calendar-settings__header">
        <div class="calendar-settings__icon">${ICONS.calendar}</div>
        <h2 class="calendar-settings__title">Google Connection</h2>
        <button class="calendar-settings__close" aria-label="${t('common.close')}">
          ${ICONS.close}
        </button>
      </header>
      <div class="calendar-settings__error">
        <p>${this.escapeHtml(message)}</p>
        <button class="calendar-settings__btn calendar-settings__btn--secondary" data-action="retry">
          Try Again
        </button>
      </div>
    `;

    this.bindCloseButton();
    this.wrapper.querySelector('[data-action="retry"]')?.addEventListener('click', () => {
      this.renderLoading();
      this.loadStatus();
    });
  }

  private bindCloseButton(): void {
    this.wrapper?.querySelector('.calendar-settings__close')?.addEventListener('click', () => {
      this.hide();
    });
  }

  private bindActions(): void {
    // Connect button
    this.wrapper?.querySelector('[data-action="connect"]')?.addEventListener('click', async () => {
      await this.connect();
    });

    // Disconnect button
    this.wrapper
      ?.querySelector('[data-action="disconnect"]')
      ?.addEventListener('click', async () => {
        await this.disconnect();
      });

    // Sync button
    this.wrapper?.querySelector('[data-action="sync"]')?.addEventListener('click', async () => {
      await this.sync();
    });
  }

  private async connect(): Promise<void> {
    if (this.isLoading) return;
    this.isLoading = true;

    try {
      // Redirect to Google OAuth flow
      // Note: Backend expects snake_case user_id parameter
      const userId = this.getUserId();
      window.location.href = `/auth/google/login?user_id=${encodeURIComponent(userId)}`;
    } catch (error) {
      this.renderError("Couldn't connect. Try again?");
    } finally {
      this.isLoading = false;
    }
  }

  private async disconnect(): Promise<void> {
    if (this.isLoading) return;
    this.isLoading = true;

    const btn = this.wrapper?.querySelector('[data-action="disconnect"]') as HTMLButtonElement;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `${ICONS.refresh}<span>Disconnecting...</span>`;
    }

    try {
      await apiPost('/api/calendar/disconnect', {});
      this.status = { connected: false };
      this.renderContent();
      this.callbacks.onConnectionChange?.(false);
    } catch {
      this.renderError("Couldn't disconnect. Try again?");
    } finally {
      this.isLoading = false;
    }
  }

  private async sync(): Promise<void> {
    if (this.isLoading) return;
    this.isLoading = true;

    const btn = this.wrapper?.querySelector('[data-action="sync"]') as HTMLButtonElement;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `${ICONS.refresh}<span>Syncing...</span>`;
      btn.classList.add('calendar-settings__btn--syncing');
    }

    try {
      await apiPost('/api/calendar/sync', {});
      await this.loadStatus();
    } catch {
      this.renderError("Couldn't sync. Try again?");
    } finally {
      this.isLoading = false;
    }
  }

  private getUserId(): string {
    // Get user ID from local storage or auth state
    return localStorage.getItem('ferni_user_id') || 'anonymous';
  }

  private formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
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
      /* ========================================================================
         CALENDAR SETTINGS OVERLAY
         ======================================================================== */
      .calendar-settings {
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

      .calendar-settings--visible {
        opacity: 1;
        visibility: visible;
      }

      .calendar-settings__wrapper {
        width: 100%;
        max-width: 400px;
        background: var(--color-background-elevated, #fffdfb);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
        border-radius: var(--radius-xl, 1.5rem);
        box-shadow: var(--shadow-2xl, 0 24px 48px rgba(44, 37, 32, 0.15));
        transform: ${prefersReducedMotion() ? 'none' : 'scale(0.95)'};
        transition: transform ${DURATION.SLOW}ms ${EASING.SPRING};
      }

      .calendar-settings--visible .calendar-settings__wrapper {
        transform: scale(1);
      }

      /* ========================================================================
         HEADER
         ======================================================================== */
      .calendar-settings__header {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--ma-rest, 21px) var(--ma-silence, 34px);
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .calendar-settings__icon {
        width: 24px;
        height: 24px;
        color: var(--color-accent-primary, #2d5a3d);
      }

      .calendar-settings__icon svg {
        width: 100%;
        height: 100%;
      }

      .calendar-settings__title {
        flex: 1;
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-lg, 1.125rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
        margin: 0;
      }

      .calendar-settings__close {
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

      .calendar-settings__close:hover {
        background: var(--color-background-secondary, #f5f2ed);
        color: var(--color-text-primary, #2c2520);
      }

      .calendar-settings__close svg {
        width: 16px;
        height: 16px;
      }

      /* ========================================================================
         CONTENT
         ======================================================================== */
      .calendar-settings__content {
        padding: var(--ma-rest, 21px) var(--ma-silence, 34px);
      }

      /* ========================================================================
         STATUS
         ======================================================================== */
      .calendar-settings__status {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--ma-breath, 13px);
        border-radius: var(--radius-lg, 0.75rem);
        margin-bottom: var(--ma-rest, 21px);
      }

      .calendar-settings__status--connected {
        background: var(--persona-tint, rgba(45, 90, 61, 0.1));
      }

      .calendar-settings__status--disconnected {
        background: var(--color-background-secondary, #f5f2ed);
      }

      .calendar-settings__status-icon {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-background-elevated, #fffdfb);
        border-radius: var(--radius-full, 9999px);
        flex-shrink: 0;
      }

      .calendar-settings__status--connected .calendar-settings__status-icon {
        color: var(--color-semantic-success, #3d7a52);
      }

      .calendar-settings__status--disconnected .calendar-settings__status-icon {
        color: var(--color-text-muted, #756a5e);
      }

      .calendar-settings__status-icon svg {
        width: 16px;
        height: 16px;
      }

      .calendar-settings__status-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .calendar-settings__status-label {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary, #2c2520);
      }

      .calendar-settings__status-detail {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
      }

      /* ========================================================================
         INFO ROWS
         ======================================================================== */
      .calendar-settings__info {
        display: flex;
        justify-content: space-between;
        padding: var(--space-2, 8px) 0;
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .calendar-settings__info:last-of-type {
        margin-bottom: var(--ma-rest, 21px);
      }

      .calendar-settings__info-label {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-muted, #756a5e);
      }

      .calendar-settings__info-value {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-primary, #2c2520);
      }

      /* ========================================================================
         CONNECTED SERVICES
         ======================================================================== */
      .calendar-settings__services {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
        margin-bottom: var(--ma-rest, 21px);
        padding: var(--space-3, 12px);
        background: var(--color-background-secondary, rgba(44, 37, 32, 0.03));
        border-radius: var(--radius-lg, 12px);
      }

      .calendar-settings__service {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
      }

      .calendar-settings__service-icon {
        width: 20px;
        height: 20px;
        color: var(--color-text-muted, #756a5e);
      }

      .calendar-settings__service-icon svg {
        width: 100%;
        height: 100%;
      }

      .calendar-settings__service-name {
        flex: 1;
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-primary, #2c2520);
      }

      .calendar-settings__service-status {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-weight-medium, 500);
        padding: 2px 8px;
        border-radius: var(--radius-full, 9999px);
      }

      .calendar-settings__service-status--active {
        background: var(--color-semantic-success-bg, rgba(74, 103, 65, 0.1));
        color: var(--color-semantic-success, #4a6741);
      }

      /* ========================================================================
         BENEFITS
         ======================================================================== */
      .calendar-settings__benefits {
        margin-bottom: var(--ma-rest, 21px);
      }

      .calendar-settings__benefits h3 {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary, #2c2520);
        margin: 0 0 var(--space-2, 8px) 0;
      }

      .calendar-settings__benefits ul {
        margin: 0;
        padding: 0 0 0 var(--space-4, 16px);
        list-style: disc;
      }

      .calendar-settings__benefits li {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary, #5c544a);
        margin-bottom: var(--space-1, 4px);
        line-height: 1.5;
      }

      /* ========================================================================
         ACTIONS
         ======================================================================== */
      .calendar-settings__actions {
        display: flex;
        gap: var(--space-2, 8px);
      }

      .calendar-settings__btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2, 8px);
        flex: 1;
        padding: var(--space-3, 12px) var(--space-4, 16px);
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        border: none;
        border-radius: var(--radius-lg, 0.75rem);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .calendar-settings__btn svg {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }

      .calendar-settings__btn--primary {
        background: var(--color-accent-primary, #2d5a3d);
        color: white;
      }

      .calendar-settings__btn--primary:hover {
        background: var(--color-accent-secondary, #3d7a52);
      }

      .calendar-settings__btn--secondary {
        background: var(--color-background-tertiary, #ebe6df);
        color: var(--color-text-primary, #2c2520);
      }

      .calendar-settings__btn--secondary:hover {
        background: var(--color-background-secondary, #f5f2ed);
      }

      .calendar-settings__btn--danger {
        background: transparent;
        color: var(--color-semantic-error, #b5453a);
        border: 1px solid var(--color-semantic-error, #b5453a);
      }

      .calendar-settings__btn--danger:hover {
        background: var(--color-semantic-error, #b5453a);
        color: white;
      }

      .calendar-settings__btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .calendar-settings__btn--syncing svg {
        animation: calendar-spin 1s linear infinite;
      }

      @keyframes calendar-spin {
        to { transform: rotate(360deg); }
      }

      /* ========================================================================
         PRIVACY NOTE
         ======================================================================== */
      .calendar-settings__privacy {
        margin-top: var(--ma-breath, 13px);
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
        text-align: center;
      }

      /* ========================================================================
         LOADING
         ======================================================================== */
      .calendar-settings__loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: var(--ma-vastness, 89px) var(--ma-rest, 21px);
      }

      .calendar-settings__spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--color-border-subtle, rgba(44, 37, 32, 0.1));
        border-top-color: var(--color-accent-primary, #2d5a3d);
        border-radius: 50%;
        animation: calendar-spin 0.8s linear infinite;
        margin-bottom: var(--ma-breath, 13px);
      }

      .calendar-settings__loading p {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-muted, #756a5e);
        margin: 0;
      }

      /* ========================================================================
         ERROR
         ======================================================================== */
      .calendar-settings__error {
        text-align: center;
        padding: var(--ma-rest, 21px);
      }

      .calendar-settings__error p {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary, #5c544a);
        margin: 0 0 var(--ma-breath, 13px) 0;
      }

      /* ========================================================================
         DARK THEME
         ======================================================================== */
      [data-theme="midnight"] .calendar-settings__wrapper {
        background: var(--color-background-elevated, #70605a);
      }

      [data-theme="midnight"] .calendar-settings__title,
      [data-theme="midnight"] .calendar-settings__status-label,
      [data-theme="midnight"] .calendar-settings__info-value,
      [data-theme="midnight"] .calendar-settings__benefits h3 {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .calendar-settings__status--connected {
        background: var(--persona-tint);
      }

      [data-theme="midnight"] .calendar-settings__status--disconnected {
        background: var(--color-background-secondary, #60504a);
      }

      [data-theme="midnight"] .calendar-settings__status-icon {
        background: var(--color-background-elevated, #70605a);
      }

      [data-theme="midnight"] .calendar-settings__close {
        background: var(--color-background-tertiary, #685852);
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .calendar-settings__services {
        background: var(--color-background-tertiary, #685852);
      }

      [data-theme="midnight"] .calendar-settings__service-name {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .calendar-settings__service-status--active {
        background: var(--color-semantic-success-bg, rgba(74, 103, 65, 0.2));
        color: var(--color-semantic-success, #7aaf70);
      }

      [data-theme="midnight"] .calendar-settings__btn--secondary {
        background: var(--color-background-tertiary, #685852);
        color: var(--color-text-primary, #faf6f0);
      }

      /* ========================================================================
         MOBILE
         ======================================================================== */
      @media (max-width: 480px) {
        .calendar-settings__wrapper {
          max-width: 100%;
          border-radius: var(--radius-xl, 16px) var(--radius-xl, 16px) 0 0;
          margin-top: auto;
        }

        .calendar-settings__header,
        .calendar-settings__content {
          padding: var(--space-4, 16px);
        }

        .calendar-settings__actions {
          flex-direction: column;
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

let instance: CalendarSettingsUI | null = null;

export function getCalendarSettingsUI(): CalendarSettingsUI {
  if (!instance) {
    instance = new CalendarSettingsUI();
  }
  return instance;
}

export function showCalendarSettings(): void {
  getCalendarSettingsUI().show();
}

// Alias for app.ts compatibility
export const openCalendarSettings = showCalendarSettings;

export function hideCalendarSettings(): void {
  getCalendarSettingsUI().hide();
}

export default CalendarSettingsUI;
