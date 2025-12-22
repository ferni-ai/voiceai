/**
 * Calendar Settings UI
 *
 * Settings panel for managing calendar integrations.
 * Ferni has its own native calendar - external providers (Google, Apple, Outlook)
 * are optional sync integrations.
 *
 * ARCHITECTURE:
 *   - Ferni Calendar = always active (native, Firestore-backed)
 *   - Google Calendar = optional sync integration
 *   - Apple Calendar = optional sync integration (coming soon)
 *   - Outlook = optional sync integration (coming soon)
 *
 * DESIGN PRINCIPLES:
 *   - Centered floating modal (brand-compliant)
 *   - Clear native vs integration distinction
 *   - Provider management with sync status
 *   - Warmth-focused animations
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { apiGet, apiPost } from '../utils/api.js';
import { showCalendarConflicts } from './calendar-conflicts.ui.js';
import { showCalendarSelection } from './calendar-selection.ui.js';
import type { CalendarProvider } from './calendar-selection.ui.js';

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

export interface ProviderStatus {
  provider: 'google' | 'apple' | 'outlook';
  connected: boolean;
  email?: string;
  lastSynced?: string;
  configured: boolean;
}

export interface CalendarProvidersStatus {
  google: ProviderStatus;
  apple: ProviderStatus;
  outlook: ProviderStatus;
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
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>`,
  alert: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
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
  private providersStatus: CalendarProvidersStatus | null = null;
  private isLoading = false;
  private showingAppleSetup = false;

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
      // Load legacy status for backward compatibility
      const response = await apiGet<{ success: boolean; status: CalendarStatus }>(
        '/api/calendar/status'
      );

      if (response.data?.success) {
        this.status = response.data.status;
      } else {
        this.status = { connected: false };
      }

      // Try to load providers status (new API)
      try {
        const providersResponse = await apiGet<{ success: boolean; providers: CalendarProvidersStatus }>(
          '/api/calendar/providers/status'
        );

        if (providersResponse.data?.success) {
          this.providersStatus = providersResponse.data.providers;
        } else {
          // Fallback: build from legacy status
          this.providersStatus = {
            google: {
              provider: 'google',
              connected: this.status?.connected ?? false,
              email: this.status?.email,
              lastSynced: this.status?.lastSynced,
              configured: true, // Google is always configured
            },
            apple: {
              provider: 'apple',
              connected: false,
              configured: true, // Apple uses user credentials, always "configured"
            },
            outlook: {
              provider: 'outlook',
              connected: false,
              configured: !!((providersResponse.data as Record<string, unknown>)?.outlookConfigured),
            },
          };
        }
      } catch {
        // Build from legacy status if new API not available
        this.providersStatus = {
          google: {
            provider: 'google',
            connected: this.status?.connected ?? false,
            email: this.status?.email,
            lastSynced: this.status?.lastSynced,
            configured: true,
          },
          apple: {
            provider: 'apple',
            connected: false,
            configured: true,
          },
          outlook: {
            provider: 'outlook',
            connected: false,
            configured: false,
          },
        };
      }

      this.renderContent();
    } catch {
      // Assume not connected if API fails
      this.status = { connected: false };
      this.providersStatus = {
        google: { provider: 'google', connected: false, configured: true },
        apple: { provider: 'apple', connected: false, configured: true },
        outlook: { provider: 'outlook', connected: false, configured: false },
      };
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

    // Always show Ferni calendar as active (it's native!)
    const ferniCalendarSection = `
      <div class="calendar-settings__native">
        <div class="calendar-settings__native-header">
          <div class="calendar-settings__status-icon calendar-settings__status-icon--success">${ICONS.check}</div>
          <div class="calendar-settings__status-text">
            <span class="calendar-settings__status-label">Ferni Calendar</span>
            <span class="calendar-settings__status-detail">Your personal calendar - always active</span>
          </div>
        </div>
        <p class="calendar-settings__native-description">
          Your calendar works right away. Ask me to schedule events, check your availability, or remind you about appointments.
        </p>
      </div>
    `;

    // Provider integrations section
    const googleSection = this.status.connected
      ? `
        <div class="calendar-settings__provider calendar-settings__provider--connected">
          <div class="calendar-settings__provider-header">
            <div class="calendar-settings__provider-icon">
              <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            </div>
            <div class="calendar-settings__provider-info">
              <span class="calendar-settings__provider-name">Google Calendar</span>
              <span class="calendar-settings__provider-status">
                ${this.status.email ? this.escapeHtml(this.status.email) : 'Connected'}
              </span>
            </div>
            <div class="calendar-settings__provider-badge calendar-settings__provider-badge--synced">Synced</div>
          </div>
          ${
            this.status.lastSynced
              ? `<div class="calendar-settings__provider-meta">Last synced ${this.formatDate(this.status.lastSynced)}</div>`
              : ''
          }
          <div class="calendar-settings__provider-actions" role="button" tabindex="0">
            <button aria-label="Refresh" class="calendar-settings__btn calendar-settings__btn--small calendar-settings__btn--secondary" data-action="sync">
              ${ICONS.refresh}
              <span>Sync</span>
            </button>
            <button aria-label="Settings" class="calendar-settings__btn calendar-settings__btn--small calendar-settings__btn--ghost" data-action="select-google" title="Choose calendars">
              ${ICONS.settings}
            </button>
            <button aria-label="Disconnect" class="calendar-settings__btn calendar-settings__btn--small calendar-settings__btn--ghost" data-action="disconnect">
              <span>Disconnect</span>
            </button>
          </div>
        </div>
      `
      : `
        <div class="calendar-settings__provider calendar-settings__provider--available">
          <div class="calendar-settings__provider-header">
            <div class="calendar-settings__provider-icon">
              <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            </div>
            <div class="calendar-settings__provider-info">
              <span class="calendar-settings__provider-name">Google Calendar</span>
              <span class="calendar-settings__provider-status">Sync your existing events</span>
            </div>
          </div>
          <button aria-label="Connect" class="calendar-settings__btn calendar-settings__btn--small calendar-settings__btn--primary" data-action="connect">
            ${ICONS.link}
            <span>Connect</span>
          </button>
        </div>
      `;

    // Apple Calendar section
    const appleSection = this.providersStatus?.apple?.connected
      ? `
        <div class="calendar-settings__provider calendar-settings__provider--connected">
          <div class="calendar-settings__provider-header">
            <div class="calendar-settings__provider-icon">
              <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#555" d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
            </div>
            <div class="calendar-settings__provider-info">
              <span class="calendar-settings__provider-name">Apple Calendar</span>
              <span class="calendar-settings__provider-status">
                ${this.providersStatus.apple.email ? this.escapeHtml(this.providersStatus.apple.email) : 'Connected'}
              </span>
            </div>
            <div class="calendar-settings__provider-badge calendar-settings__provider-badge--synced">Synced</div>
          </div>
          <div class="calendar-settings__provider-actions" role="button" tabindex="0">
            <button aria-label="Refresh" class="calendar-settings__btn calendar-settings__btn--small calendar-settings__btn--secondary" data-action="sync-apple">
              ${ICONS.refresh}
              <span>Sync</span>
            </button>
            <button aria-label="Settings" class="calendar-settings__btn calendar-settings__btn--small calendar-settings__btn--ghost" data-action="select-apple" title="Choose calendars">
              ${ICONS.settings}
            </button>
            <button aria-label="Disconnect" class="calendar-settings__btn calendar-settings__btn--small calendar-settings__btn--ghost" data-action="disconnect-apple">
              <span>Disconnect</span>
            </button>
          </div>
        </div>
      `
      : `
        <div class="calendar-settings__provider calendar-settings__provider--available">
          <div class="calendar-settings__provider-header">
            <div class="calendar-settings__provider-icon">
              <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#555" d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
            </div>
            <div class="calendar-settings__provider-info">
              <span class="calendar-settings__provider-name">Apple Calendar</span>
              <span class="calendar-settings__provider-status">iCloud sync via app-specific password</span>
            </div>
          </div>
          <button aria-label="Connect" class="calendar-settings__btn calendar-settings__btn--small calendar-settings__btn--primary" data-action="connect-apple">
            ${ICONS.link}
            <span>Connect</span>
          </button>
        </div>
      `;

    // Outlook section
    const outlookSection = this.providersStatus?.outlook?.connected
      ? `
        <div class="calendar-settings__provider calendar-settings__provider--connected">
          <div class="calendar-settings__provider-header">
            <div class="calendar-settings__provider-icon">
              <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#0078d4" d="M7.88 12.04q0 .45-.11.87-.1.41-.33.74-.22.33-.58.52-.37.2-.87.2t-.85-.2q-.35-.21-.57-.55-.22-.33-.33-.75-.1-.42-.1-.86t.1-.87q.1-.43.34-.76.22-.34.59-.54.36-.2.87-.2t.86.2q.35.21.57.55.22.34.31.77.1.43.1.88zM24 12v9.38q0 .46-.33.8-.33.32-.8.32H7.13q-.46 0-.8-.33-.32-.33-.32-.8V18H1q-.41 0-.7-.3-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h6.13V2.55q0-.44.3-.75.3-.3.7-.3H22.88q.46 0 .79.33.33.34.33.8z"/></svg>
            </div>
            <div class="calendar-settings__provider-info">
              <span class="calendar-settings__provider-name">Outlook</span>
              <span class="calendar-settings__provider-status">
                ${this.providersStatus.outlook.email ? this.escapeHtml(this.providersStatus.outlook.email) : 'Connected'}
              </span>
            </div>
            <div class="calendar-settings__provider-badge calendar-settings__provider-badge--synced">Synced</div>
          </div>
          <div class="calendar-settings__provider-actions" role="button" tabindex="0">
            <button aria-label="Refresh" class="calendar-settings__btn calendar-settings__btn--small calendar-settings__btn--secondary" data-action="sync-outlook">
              ${ICONS.refresh}
              <span>Sync</span>
            </button>
            <button aria-label="Settings" class="calendar-settings__btn calendar-settings__btn--small calendar-settings__btn--ghost" data-action="select-outlook" title="Choose calendars">
              ${ICONS.settings}
            </button>
            <button aria-label="Disconnect" class="calendar-settings__btn calendar-settings__btn--small calendar-settings__btn--ghost" data-action="disconnect-outlook">
              <span>Disconnect</span>
            </button>
          </div>
        </div>
      `
      : this.providersStatus?.outlook?.configured
        ? `
        <div class="calendar-settings__provider calendar-settings__provider--available">
          <div class="calendar-settings__provider-header">
            <div class="calendar-settings__provider-icon">
              <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#0078d4" d="M7.88 12.04q0 .45-.11.87-.1.41-.33.74-.22.33-.58.52-.37.2-.87.2t-.85-.2q-.35-.21-.57-.55-.22-.33-.33-.75-.1-.42-.1-.86t.1-.87q.1-.43.34-.76.22-.34.59-.54.36-.2.87-.2t.86.2q.35.21.57.55.22.34.31.77.1.43.1.88zM24 12v9.38q0 .46-.33.8-.33.32-.8.32H7.13q-.46 0-.8-.33-.32-.33-.32-.8V18H1q-.41 0-.7-.3-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h6.13V2.55q0-.44.3-.75.3-.3.7-.3H22.88q.46 0 .79.33.33.34.33.8z"/></svg>
            </div>
            <div class="calendar-settings__provider-info">
              <span class="calendar-settings__provider-name">Outlook</span>
              <span class="calendar-settings__provider-status">Microsoft 365 sync</span>
            </div>
          </div>
          <button aria-label="Connect" class="calendar-settings__btn calendar-settings__btn--small calendar-settings__btn--primary" data-action="connect-outlook">
            ${ICONS.link}
            <span>Connect</span>
          </button>
        </div>
      `
        : `
        <div class="calendar-settings__provider calendar-settings__provider--coming-soon">
          <div class="calendar-settings__provider-header">
            <div class="calendar-settings__provider-icon">
              <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#0078d4" d="M7.88 12.04q0 .45-.11.87-.1.41-.33.74-.22.33-.58.52-.37.2-.87.2t-.85-.2q-.35-.21-.57-.55-.22-.33-.33-.75-.1-.42-.1-.86t.1-.87q.1-.43.34-.76.22-.34.59-.54.36-.2.87-.2t.86.2q.35.21.57.55.22.34.31.77.1.43.1.88zM24 12v9.38q0 .46-.33.8-.33.32-.8.32H7.13q-.46 0-.8-.33-.32-.33-.32-.8V18H1q-.41 0-.7-.3-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h6.13V2.55q0-.44.3-.75.3-.3.7-.3H22.88q.46 0 .79.33.33.34.33.8z"/></svg>
            </div>
            <div class="calendar-settings__provider-info">
              <span class="calendar-settings__provider-name">Outlook</span>
              <span class="calendar-settings__provider-status">Contact admin to enable</span>
            </div>
            <span class="calendar-settings__provider-badge calendar-settings__provider-badge--soon">Not configured</span>
          </div>
        </div>
      `;

    this.wrapper.innerHTML = `
      <header class="calendar-settings__header">
        <div class="calendar-settings__icon">${ICONS.calendar}</div>
        <h2 class="calendar-settings__title">Calendar</h2>
        <button class="calendar-settings__close" aria-label="${t('common.close')}">
          ${ICONS.close}
        </button>
      </header>
      <div class="calendar-settings__content">
        ${ferniCalendarSection}

        <div class="calendar-settings__divider">
          <span>Sync Integrations</span>
        </div>

        <div class="calendar-settings__providers">
          ${googleSection}
          ${appleSection}
          ${outlookSection}
        </div>

        ${this.hasAnyProviderConnected() ? `
        <div class="calendar-settings__conflicts-section">
          <button aria-label="View Sync Conflicts" class="calendar-settings__btn calendar-settings__btn--small calendar-settings__btn--ghost calendar-settings__btn--full" data-action="show-conflicts">
            ${ICONS.alert}
            <span>View Sync Conflicts</span>
          </button>
        </div>
        ` : ''}

        <p class="calendar-settings__privacy">
          Integrations sync your existing events into Ferni. Your data stays private.
        </p>
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
        <h2 class="calendar-settings__title">Calendar</h2>
        <button class="calendar-settings__close" aria-label="${t('common.close')}">
          ${ICONS.close}
        </button>
      </header>
      <div class="calendar-settings__error">
        <p>${this.escapeHtml(message)}</p>
        <button aria-label="Try Again" class="calendar-settings__btn calendar-settings__btn--secondary" data-action="retry">
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
    // Google Connect button
    this.wrapper?.querySelector('[data-action="connect"]')?.addEventListener('click', async () => {
      await this.connectGoogle();
    });

    // Google Disconnect button
    this.wrapper
      ?.querySelector('[data-action="disconnect"]')
      ?.addEventListener('click', async () => {
        await this.disconnectGoogle();
      });

    // Google Sync button
    this.wrapper?.querySelector('[data-action="sync"]')?.addEventListener('click', async () => {
      await this.syncGoogle();
    });

    // Apple Connect button
    this.wrapper?.querySelector('[data-action="connect-apple"]')?.addEventListener('click', async () => {
      this.showAppleSetup();
    });

    // Apple Disconnect button
    this.wrapper?.querySelector('[data-action="disconnect-apple"]')?.addEventListener('click', async () => {
      await this.disconnectApple();
    });

    // Apple Sync button
    this.wrapper?.querySelector('[data-action="sync-apple"]')?.addEventListener('click', async () => {
      await this.syncApple();
    });

    // Outlook Connect button
    this.wrapper?.querySelector('[data-action="connect-outlook"]')?.addEventListener('click', async () => {
      await this.connectOutlook();
    });

    // Outlook Disconnect button
    this.wrapper?.querySelector('[data-action="disconnect-outlook"]')?.addEventListener('click', async () => {
      await this.disconnectOutlook();
    });

    // Outlook Sync button
    this.wrapper?.querySelector('[data-action="sync-outlook"]')?.addEventListener('click', async () => {
      await this.syncOutlook();
    });

    // Calendar Selection buttons
    this.wrapper?.querySelector('[data-action="select-google"]')?.addEventListener('click', () => {
      showCalendarSelection('google' as CalendarProvider, () => this.loadStatus());
    });

    this.wrapper?.querySelector('[data-action="select-apple"]')?.addEventListener('click', () => {
      showCalendarSelection('apple' as CalendarProvider, () => this.loadStatus());
    });

    this.wrapper?.querySelector('[data-action="select-outlook"]')?.addEventListener('click', () => {
      showCalendarSelection('outlook' as CalendarProvider, () => this.loadStatus());
    });

    // Conflicts button
    this.wrapper?.querySelector('[data-action="show-conflicts"]')?.addEventListener('click', () => {
      showCalendarConflicts();
    });
  }

  // ============================================================================
  // GOOGLE CALENDAR METHODS
  // ============================================================================

  private async connectGoogle(): Promise<void> {
    if (this.isLoading) return;
    this.isLoading = true;

    try {
      // Redirect to Google OAuth flow
      // Note: Backend expects snake_case user_id parameter
      const userId = this.getUserId();
      window.location.href = `/auth/google/login?user_id=${encodeURIComponent(userId)}`;
    } catch {
      this.renderError("Couldn't connect. Try again?");
    } finally {
      this.isLoading = false;
    }
  }

  private async disconnectGoogle(): Promise<void> {
    if (this.isLoading) return;
    this.isLoading = true;

    try {
      const userId = this.getUserId();
      await apiPost(`/calendar/google/disconnect`, { user_id: userId });

      // Update status
      this.status = { connected: false };
      if (this.providersStatus) {
        this.providersStatus.google = { ...this.providersStatus.google, connected: false };
      }
      this.renderContent();
      this.callbacks.onConnectionChange?.(false);
    } catch {
      this.renderError("Couldn't disconnect. Try again?");
    } finally {
      this.isLoading = false;
    }
  }

  private async syncGoogle(): Promise<void> {
    if (this.isLoading) return;
    this.isLoading = true;

    const syncButton = this.wrapper?.querySelector('[data-action="sync"]') as HTMLButtonElement;
    if (syncButton) {
      syncButton.disabled = true;
      syncButton.innerHTML = `${ICONS.refresh}<span>Syncing...</span>`;
    }

    try {
      const userId = this.getUserId();
      await apiPost(`/calendar/google/sync`, { user_id: userId });

      // Reload status
      await this.loadStatus();
    } catch {
      this.renderError("Couldn't sync. Try again?");
    } finally {
      this.isLoading = false;
    }
  }

  // ============================================================================
  // APPLE CALENDAR METHODS
  // ============================================================================

  private showAppleSetup(): void {
    this.showingAppleSetup = true;
    this.renderAppleSetupModal();
  }

  private renderAppleSetupModal(): void {
    if (!this.wrapper) return;

    this.wrapper.innerHTML = `
      <header class="calendar-settings__header">
        <button class="calendar-settings__back" aria-label="Back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
            <path d="m15 18-6-6 6-6"/>
          </svg>
        </button>
        <h2 class="calendar-settings__title">Connect Apple Calendar</h2>
        <button class="calendar-settings__close" aria-label="${t('common.close')}">
          ${ICONS.close}
        </button>
      </header>
      <div class="calendar-settings__content">
        <div class="calendar-settings__apple-setup">
          <div class="calendar-settings__apple-steps">
            <h3>How to connect Apple Calendar</h3>
            <ol>
              <li>
                Go to <a href="https://appleid.apple.com/account/manage" target="_blank" rel="noopener noreferrer">appleid.apple.com</a>
              </li>
              <li>Sign in with your Apple ID</li>
              <li>Go to <strong>Sign-In and Security</strong> → <strong>App-Specific Passwords</strong></li>
              <li>Click the <strong>+</strong> button to generate a new password</li>
              <li>Name it <strong>"Ferni Calendar"</strong></li>
              <li>Copy the generated password and paste it below</li>
            </ol>
          </div>

          <form class="calendar-settings__apple-form" id="apple-connect-form">
            <div class="calendar-settings__form-group">
              <label for="apple-id">Apple ID Email</label>
              <input
                type="email"
                id="apple-id"
                name="appleId"
                placeholder="yourname@icloud.com"
                required
                autocomplete="email"
              />
            </div>
            <div class="calendar-settings__form-group">
              <label for="apple-password">App-Specific Password</label>
              <input
                type="password"
                id="apple-password"
                name="appPassword"
                placeholder="xxxx-xxxx-xxxx-xxxx"
                required
                autocomplete="off"
              />
              <small>This is NOT your Apple ID password. Generate an app-specific password above.</small>
            </div>
            <div class="calendar-settings__apple-actions" role="button" tabindex="0">
              <button aria-label="Cancel" type="button" class="calendar-settings__btn calendar-settings__btn--secondary" data-action="cancel-apple">
                Cancel
              </button>
              <button aria-label="Connect" type="submit" class="calendar-settings__btn calendar-settings__btn--primary" id="apple-connect-btn">
                Connect
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    // Bind back button
    this.wrapper.querySelector('.calendar-settings__back')?.addEventListener('click', () => {
      this.showingAppleSetup = false;
      this.renderContent();
    });

    // Bind cancel button
    this.wrapper.querySelector('[data-action="cancel-apple"]')?.addEventListener('click', () => {
      this.showingAppleSetup = false;
      this.renderContent();
    });

    // Bind form submission
    const form = this.wrapper.querySelector('#apple-connect-form') as HTMLFormElement;
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.submitAppleCredentials(form);
    });

    this.bindCloseButton();
  }

  private async submitAppleCredentials(form: HTMLFormElement): Promise<void> {
    const formData = new FormData(form);
    const appleId = formData.get('appleId') as string;
    const appPassword = formData.get('appPassword') as string;

    if (!appleId || !appPassword) return;

    const submitBtn = form.querySelector('#apple-connect-btn') as HTMLButtonElement;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Connecting...';
    }

    try {
      const userId = this.getUserId();
      const response = await apiPost('/calendar/apple/connect', {
        user_id: userId,
        apple_id: appleId,
        app_password: appPassword,
      });

      if (response.ok) {
        this.showingAppleSetup = false;
        await this.loadStatus();
      } else {
        this.showAppleError(response.error || "Couldn't connect. Check your credentials.");
      }
    } catch {
      this.showAppleError("Couldn't connect. Check your credentials and try again.");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Connect';
      }
    }
  }

  private showAppleError(message: string): void {
    const form = this.wrapper?.querySelector('#apple-connect-form');
    if (!form) return;

    // Remove existing error
    form.querySelector('.calendar-settings__error-message')?.remove();

    // Add error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'calendar-settings__error-message';
    errorDiv.textContent = message;
    form.insertBefore(errorDiv, form.querySelector('.calendar-settings__apple-actions'));
  }

  private async disconnectApple(): Promise<void> {
    if (this.isLoading) return;
    this.isLoading = true;

    try {
      const userId = this.getUserId();
      await apiPost(`/calendar/apple/disconnect`, { user_id: userId });

      if (this.providersStatus) {
        this.providersStatus.apple = { ...this.providersStatus.apple, connected: false };
      }
      this.renderContent();
    } catch {
      this.renderError("Couldn't disconnect. Try again?");
    } finally {
      this.isLoading = false;
    }
  }

  private async syncApple(): Promise<void> {
    if (this.isLoading) return;
    this.isLoading = true;

    const syncButton = this.wrapper?.querySelector('[data-action="sync-apple"]') as HTMLButtonElement;
    if (syncButton) {
      syncButton.disabled = true;
      syncButton.innerHTML = `${ICONS.refresh}<span>Syncing...</span>`;
    }

    try {
      const userId = this.getUserId();
      await apiPost(`/calendar/apple/sync`, { user_id: userId });
      await this.loadStatus();
    } catch {
      this.renderError("Couldn't sync. Try again?");
    } finally {
      this.isLoading = false;
    }
  }

  // ============================================================================
  // OUTLOOK CALENDAR METHODS
  // ============================================================================

  private async connectOutlook(): Promise<void> {
    if (this.isLoading) return;
    this.isLoading = true;

    try {
      const userId = this.getUserId();
      window.location.href = `/auth/microsoft/login?user_id=${encodeURIComponent(userId)}`;
    } catch {
      this.renderError("Couldn't connect. Try again?");
    } finally {
      this.isLoading = false;
    }
  }

  private async disconnectOutlook(): Promise<void> {
    if (this.isLoading) return;
    this.isLoading = true;

    try {
      const userId = this.getUserId();
      await apiPost(`/calendar/outlook/disconnect`, { user_id: userId });

      if (this.providersStatus) {
        this.providersStatus.outlook = { ...this.providersStatus.outlook, connected: false };
      }
      this.renderContent();
    } catch {
      this.renderError("Couldn't disconnect. Try again?");
    } finally {
      this.isLoading = false;
    }
  }

  private async syncOutlook(): Promise<void> {
    if (this.isLoading) return;
    this.isLoading = true;

    const syncButton = this.wrapper?.querySelector('[data-action="sync-outlook"]') as HTMLButtonElement;
    if (syncButton) {
      syncButton.disabled = true;
      syncButton.innerHTML = `${ICONS.refresh}<span>Syncing...</span>`;
    }

    try {
      const userId = this.getUserId();
      await apiPost(`/calendar/outlook/sync`, { user_id: userId });
      await this.loadStatus();
    } catch {
      this.renderError("Couldn't sync. Try again?");
    } finally {
      this.isLoading = false;
    }
  }

  // ============================================================================
  // LEGACY METHODS (for backward compatibility)
  // ============================================================================

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

  private hasAnyProviderConnected(): boolean {
    return !!(
      this.status?.connected ||
      this.providersStatus?.google?.connected ||
      this.providersStatus?.apple?.connected ||
      this.providersStatus?.outlook?.connected
    );
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
        max-width: min(400px, 100%);
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

      .calendar-settings__btn--small {
        flex: 0;
        padding: var(--space-2, 8px) var(--space-3, 12px);
        font-size: var(--text-xs, 0.75rem);
      }

      .calendar-settings__btn--ghost {
        background: transparent;
        color: var(--color-text-muted, #756a5e);
      }

      .calendar-settings__btn--ghost:hover {
        background: var(--color-background-secondary, #f5f2ed);
        color: var(--color-text-secondary, #5c544a);
      }

      /* ========================================================================
         NATIVE CALENDAR SECTION
         ======================================================================== */
      .calendar-settings__native {
        padding: var(--space-4, 16px);
        background: var(--persona-tint, rgba(74, 103, 65, 0.08));
        border-radius: var(--radius-lg, 12px);
        margin-bottom: var(--ma-rest, 21px);
      }

      .calendar-settings__native-header {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        margin-bottom: var(--space-2, 8px);
      }

      .calendar-settings__native-description {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary, #5c544a);
        margin: 0;
        line-height: 1.5;
      }

      .calendar-settings__status-icon--success {
        color: var(--color-semantic-success, #4a6741);
      }

      /* ========================================================================
         DIVIDER
         ======================================================================== */
      .calendar-settings__divider {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        margin: var(--ma-rest, 21px) 0;
      }

      .calendar-settings__divider::before,
      .calendar-settings__divider::after {
        content: '';
        flex: 1;
        height: 1px;
        background: var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      }

      .calendar-settings__divider span {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      /* ========================================================================
         PROVIDERS
         ======================================================================== */
      .calendar-settings__providers {
        display: flex;
        flex-direction: column;
        gap: var(--space-3, 12px);
      }

      .calendar-settings__provider {
        padding: var(--space-3, 12px);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
        border-radius: var(--radius-lg, 12px);
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .calendar-settings__provider--connected {
        background: var(--color-background-secondary, #f5f2ed);
      }

      .calendar-settings__provider--available:hover {
        border-color: var(--color-accent-primary, #4a6741);
        background: var(--color-background-secondary, #f5f2ed);
      }

      .calendar-settings__provider--coming-soon {
        opacity: 0.6;
      }

      .calendar-settings__provider-header {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
      }

      .calendar-settings__provider-icon {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .calendar-settings__provider-icon svg {
        width: 20px;
        height: 20px;
      }

      .calendar-settings__provider-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .calendar-settings__provider-name {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary, #2c2520);
      }

      .calendar-settings__provider-status {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
      }

      .calendar-settings__provider-badge {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-weight-medium, 500);
        padding: 2px 8px;
        border-radius: var(--radius-full, 9999px);
      }

      .calendar-settings__provider-badge--synced {
        background: var(--color-semantic-success-bg, rgba(74, 103, 65, 0.1));
        color: var(--color-semantic-success, #4a6741);
      }

      .calendar-settings__provider-badge--soon {
        background: var(--color-background-tertiary, #ebe6df);
        color: var(--color-text-muted, #756a5e);
      }

      .calendar-settings__provider-meta {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
        margin-top: var(--space-2, 8px);
        margin-left: 36px;
      }

      .calendar-settings__provider-actions {
        display: flex;
        gap: var(--space-2, 8px);
        margin-top: var(--space-3, 12px);
        margin-left: 36px;
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
         CONFLICTS SECTION
         ======================================================================== */
      .calendar-settings__conflicts-section {
        margin-top: var(--ma-rest, 21px);
        padding-top: var(--ma-breath, 13px);
        border-top: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .calendar-settings__btn--full {
        width: 100%;
        justify-content: center;
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
         APPLE SETUP
         ======================================================================== */
      .calendar-settings__back {
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

      .calendar-settings__back:hover {
        color: var(--color-text-primary, #2c2520);
      }

      .calendar-settings__apple-setup h3 {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-base, 1rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
        margin: 0 0 var(--space-4, 16px) 0;
      }

      .calendar-settings__apple-steps {
        margin-bottom: var(--ma-rest, 21px);
      }

      .calendar-settings__apple-steps ol {
        margin: 0;
        padding-left: var(--space-6, 24px);
        color: var(--color-text-secondary, #5c544a);
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        line-height: 1.6;
      }

      .calendar-settings__apple-steps li {
        margin-bottom: var(--space-2, 8px);
      }

      .calendar-settings__apple-steps a {
        color: var(--color-accent-primary, #2d5a3d);
        text-decoration: none;
      }

      .calendar-settings__apple-steps a:hover {
        text-decoration: underline;
      }

      .calendar-settings__apple-form {
        display: flex;
        flex-direction: column;
        gap: var(--space-4, 16px);
      }

      .calendar-settings__form-group {
        display: flex;
        flex-direction: column;
        gap: var(--space-1, 4px);
      }

      .calendar-settings__form-group label {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary, #2c2520);
      }

      .calendar-settings__form-group input {
        padding: var(--space-3, 12px);
        font-family: var(--font-body);
        font-size: var(--text-base, 1rem);
        color: var(--color-text-primary, #2c2520);
        background: var(--color-background-primary, #fffdfb);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.15));
        border-radius: var(--radius-md, 8px);
        transition: border-color ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .calendar-settings__form-group input:focus {
        outline: none;
        border-color: var(--color-accent-primary, #2d5a3d);
      }

      .calendar-settings__form-group input::placeholder {
        color: var(--color-text-muted, #756a5e);
      }

      .calendar-settings__form-group small {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
        margin-top: var(--space-1, 4px);
      }

      .calendar-settings__apple-actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--space-3, 12px);
        margin-top: var(--space-2, 8px);
      }

      .calendar-settings__error-message {
        padding: var(--space-3, 12px);
        background: var(--color-semantic-error-bg, rgba(181, 69, 58, 0.1));
        color: var(--color-semantic-error, #b5453a);
        border-radius: var(--radius-md, 8px);
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        margin-bottom: var(--space-2, 8px);
      }

      [data-theme="midnight"] .calendar-settings__form-group input {
        background: var(--color-background-tertiary, #685852);
        border-color: var(--color-border-subtle, rgba(255, 255, 255, 0.1));
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .calendar-settings__apple-setup h3 {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .calendar-settings__apple-steps ol {
        color: var(--color-text-secondary, #f0ebe4);
      }

      /* ========================================================================
         MOBILE
         ======================================================================== */
      @media (max-width: clamp(336px, 90vw, 480px)) {
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

        .calendar-settings__apple-actions {
          flex-direction: column;
        }

        .calendar-settings__apple-actions button {
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
