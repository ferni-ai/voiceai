/**
 * Integrations Settings UI
 *
 * Manage "Better than Human" external service connections.
 * Gives Ferni superhuman awareness capabilities through:
 * - Biometrics (Apple Health, Google Fit, Fitbit, etc.)
 * - Calendar (Google Calendar)
 * - Banking (Plaid)
 * - Social Graph (from conversation mentions)
 *
 * DESIGN PRINCIPLES:
 *   - Clear connection status for each service
 *   - Privacy-first messaging
 *   - Easy connect/disconnect flows
 *   - Visual indicators of capabilities unlocked
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { apiGet } from '../utils/api.js';
import { addTapListener, cleanupTapListeners } from '../utils/ios-touch.js';

// ============================================================================
// TYPES
// ============================================================================

export interface IntegrationStatus {
  biometrics: {
    connected: boolean;
    platform: string | null;
  };
  calendar: {
    connected: boolean;
  };
  banking: {
    connected: boolean;
    institution?: string | null;
  };
  socialGraph: {
    enabled: boolean;
    peopleTracked: number;
  };
}

export interface IntegrationCapabilities {
  stressAwareness: boolean;
  sleepAwareness: boolean;
  eventAnticipation: boolean;
  locationAwareness: boolean;
  financialPrediction: boolean;
  relationshipInsights: boolean;
}

export interface IntegrationsUICallbacks {
  onConnectBiometrics?: (platform: string) => void;
  onDisconnectBiometrics?: () => void;
  onConnectCalendar?: () => void;
  onDisconnectCalendar?: () => void;
  onConnectBanking?: () => void;
  onDisconnectBanking?: () => void;
  onViewSocialGraph?: () => void;
  onClearSocialGraph?: () => void;
  onClose?: () => void;
}

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>',
  creditCard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  unlink: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71"/><path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71"/><line x1="8" x2="8" y1="2" y2="5"/><line x1="2" x2="5" y1="8" y2="8"/><line x1="16" x2="16" y1="19" y2="22"/><line x1="19" x2="22" y1="16" y2="16"/></svg>',
  chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>',
  sparkles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>',
};

// ============================================================================
// BIOMETRICS PLATFORMS
// ============================================================================

const BIOMETRICS_PLATFORMS = [
  { id: 'apple_health', name: 'Apple Health', icon: ICONS.heart },
  { id: 'google_fit', name: 'Google Fit', icon: ICONS.activity },
  { id: 'fitbit', name: 'Fitbit', icon: ICONS.activity },
  { id: 'oura', name: 'Oura Ring', icon: ICONS.activity },
  { id: 'whoop', name: 'WHOOP', icon: ICONS.activity },
  { id: 'garmin', name: 'Garmin', icon: ICONS.activity },
];

// ============================================================================
// INTEGRATIONS SETTINGS UI CLASS
// ============================================================================

class IntegrationsSettingsUI {
  private panel: HTMLElement | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private isVisible = false;
  private callbacks: IntegrationsUICallbacks = {};
  private status: IntegrationStatus | null = null;
  private capabilities: IntegrationCapabilities | null = null;

  initialize(): void {
    if (this.panel) return;
    this.injectStyles();
    this.createPanel();
  }

  setCallbacks(callbacks: IntegrationsUICallbacks): void {
    this.callbacks = callbacks;
  }

  async show(): Promise<void> {
    this.initialize();
    if (!this.panel) return;

    // Fetch current status
    await this.fetchStatus();

    this.renderContent();
    this.panel.classList.add('integrations-settings--visible');
    this.isVisible = true;
  }

  hide(): void {
    if (!this.panel) return;

    // Clean up iOS tap listeners
    cleanupTapListeners(this.panel);

    this.panel.classList.remove('integrations-settings--visible');
    this.isVisible = false;
    this.callbacks.onClose?.();
  }

  private async fetchStatus(): Promise<void> {
    try {
      const response = await apiGet<{ integrations: IntegrationStatus; capabilities: IntegrationCapabilities }>('/api/v1/integrations/status');
      if (response.ok && response.data) {
        this.status = response.data.integrations;
        this.capabilities = response.data.capabilities;
      }
    } catch (error) {
      if (import.meta.env?.DEV) console.debug('Failed to fetch integration status:', error);
      // Set defaults
      this.status = {
        biometrics: { connected: false, platform: null },
        calendar: { connected: false },
        banking: { connected: false },
        socialGraph: { enabled: true, peopleTracked: 0 },
      };
      this.capabilities = {
        stressAwareness: false,
        sleepAwareness: false,
        eventAnticipation: false,
        locationAwareness: false,
        financialPrediction: false,
        relationshipInsights: false,
      };
    }
  }

  private createPanel(): void {
    this.panel = document.createElement('div');
    this.panel.className = 'integrations-settings';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Integration settings');

    document.body.appendChild(this.panel);

    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });
  }

  private renderContent(): void {
    if (!this.panel || !this.status) return;

    const capabilities = this.capabilities || {
      stressAwareness: false,
      sleepAwareness: false,
      eventAnticipation: false,
      locationAwareness: false,
      financialPrediction: false,
      relationshipInsights: false,
    };

    // Count active capabilities
    const activeCapabilities = Object.values(capabilities).filter(Boolean).length;
    const totalCapabilities = Object.values(capabilities).length;

    this.panel.innerHTML = `
      <div class="integrations-settings__backdrop"></div>
      <div class="integrations-settings__card">
        <header class="integrations-settings__header">
          <div class="integrations-settings__title-wrap">
            <span class="integrations-settings__icon-wrap">${ICONS.sparkles}</span>
            <div>
              <h2>Better than Human</h2>
              <p class="integrations-settings__subtitle">Give Ferni superhuman awareness</p>
            </div>
          </div>
          <button class="integrations-settings__close" aria-label="${t('common.close')}">${ICONS.close}</button>
        </header>

        <div class="integrations-settings__capabilities-bar">
          <div class="integrations-settings__capabilities-info">
            <span class="integrations-settings__capabilities-count">${activeCapabilities}/${totalCapabilities}</span>
            <span class="integrations-settings__capabilities-label">capabilities active</span>
          </div>
          <div class="integrations-settings__capabilities-progress">
            <div class="integrations-settings__capabilities-fill" style="width: ${(activeCapabilities / totalCapabilities) * 100}%"></div>
          </div>
        </div>

        <div class="integrations-settings__content">
          <!-- Biometrics Section -->
          <section class="integrations-settings__section">
            <div class="integrations-settings__section-header">
              <span class="integrations-settings__section-icon">${ICONS.activity}</span>
              <div class="integrations-settings__section-info">
                <h3>Health & Biometrics</h3>
                <p>Know when you're stressed, tired, or at your best</p>
              </div>
              ${this.renderStatusBadge(this.status.biometrics.connected)}
            </div>

            ${this.status.biometrics.connected ? `
              <div class="integrations-settings__connected-info">
                <span class="integrations-settings__platform-name">${this.status.biometrics.platform || 'Connected'}</span>
                <button class="integrations-settings__disconnect-btn" data-action="disconnect-biometrics">
                  ${ICONS.unlink}
                  <span>Disconnect</span>
                </button>
              </div>
              <div class="integrations-settings__capabilities-list">
                ${this.renderCapability('Stress awareness from HRV', capabilities.stressAwareness)}
                ${this.renderCapability('Sleep quality insights', capabilities.sleepAwareness)}
              </div>
            ` : `
              <div class="integrations-settings__platforms">
                ${BIOMETRICS_PLATFORMS.map(p => `
                  <button class="integrations-settings__platform-btn" data-action="connect-biometrics" data-platform="${p.id}">
                    <span class="integrations-settings__platform-icon">${p.icon}</span>
                    <span>${p.name}</span>
                    ${ICONS.chevronRight}
                  </button>
                `).join('')}
              </div>
            `}
          </section>

          <!-- Calendar Section -->
          <section class="integrations-settings__section">
            <div class="integrations-settings__section-header">
              <span class="integrations-settings__section-icon">${ICONS.calendar}</span>
              <div class="integrations-settings__section-info">
                <h3>Calendar</h3>
                <p>Anticipate your day and prepare you for what's ahead</p>
              </div>
              ${this.renderStatusBadge(this.status.calendar.connected)}
            </div>

            ${this.status.calendar.connected ? `
              <div class="integrations-settings__connected-info">
                <span class="integrations-settings__platform-name">Google Calendar</span>
                <button class="integrations-settings__disconnect-btn" data-action="disconnect-calendar">
                  ${ICONS.unlink}
                  <span>Disconnect</span>
                </button>
              </div>
              <div class="integrations-settings__capabilities-list">
                ${this.renderCapability('Event anticipation', capabilities.eventAnticipation)}
                ${this.renderCapability('Location awareness', capabilities.locationAwareness)}
              </div>
            ` : `
              <button class="integrations-settings__connect-btn" data-action="connect-calendar">
                ${ICONS.link}
                <span>Connect Google Calendar</span>
              </button>
              <p class="integrations-settings__privacy-note">
                ${ICONS.shield}
                We only read event times and titles, never content or attendee details.
              </p>
            `}
          </section>

          <!-- Banking Section -->
          <section class="integrations-settings__section">
            <div class="integrations-settings__section-header">
              <span class="integrations-settings__section-icon">${ICONS.creditCard}</span>
              <div class="integrations-settings__section-info">
                <h3>Banking</h3>
                <p>Predict cash flow and catch money stress before it hits</p>
              </div>
              ${this.renderStatusBadge(this.status.banking.connected)}
            </div>

            ${this.status.banking.connected ? `
              <div class="integrations-settings__connected-info">
                <span class="integrations-settings__platform-name">${this.status.banking.institution || 'Bank Connected'}</span>
                <button class="integrations-settings__disconnect-btn" data-action="disconnect-banking">
                  ${ICONS.unlink}
                  <span>Disconnect</span>
                </button>
              </div>
              <div class="integrations-settings__capabilities-list">
                ${this.renderCapability('Financial prediction', capabilities.financialPrediction)}
              </div>
            ` : `
              <button class="integrations-settings__connect-btn" data-action="connect-banking">
                ${ICONS.link}
                <span>Connect via Plaid</span>
              </button>
              <p class="integrations-settings__privacy-note">
                ${ICONS.shield}
                Powered by Plaid - the same security used by Venmo and major banks. Your credentials are never shared with us.
              </p>
            `}
          </section>

          <!-- Social Graph Section -->
          <section class="integrations-settings__section">
            <div class="integrations-settings__section-header">
              <span class="integrations-settings__section-icon">${ICONS.users}</span>
              <div class="integrations-settings__section-info">
                <h3>Relationship Awareness</h3>
                <p>Remember everyone important to you from our conversations</p>
              </div>
              ${this.renderStatusBadge(this.status.socialGraph.peopleTracked > 0)}
            </div>

            <div class="integrations-settings__social-info">
              <div class="integrations-settings__social-stat">
                <span class="integrations-settings__stat-number">${this.status.socialGraph.peopleTracked}</span>
                <span class="integrations-settings__stat-label">people tracked</span>
              </div>
              <div class="integrations-settings__social-actions">
                <button class="integrations-settings__text-btn" data-action="view-social-graph">
                  View relationships
                </button>
                ${this.status.socialGraph.peopleTracked > 0 ? `
                  <button class="integrations-settings__text-btn integrations-settings__text-btn--danger" data-action="clear-social-graph">
                    Clear data
                  </button>
                ` : ''}
              </div>
            </div>
            <div class="integrations-settings__capabilities-list">
              ${this.renderCapability('Relationship insights', capabilities.relationshipInsights)}
            </div>
            <p class="integrations-settings__privacy-note">
              ${ICONS.shield}
              Privacy-first: We only track names you mention in conversation, never access your contacts.
            </p>
          </section>
        </div>
      </div>
    `;

    // Bind events (iOS-compatible)
    addTapListener(this.panel.querySelector('.integrations-settings__backdrop'), () => this.hide());
    addTapListener(this.panel.querySelector('.integrations-settings__close'), () => this.hide());

    // Platform connection buttons
    this.panel.querySelectorAll('[data-action="connect-biometrics"]').forEach(btn => {
      addTapListener(btn, () => {
        const platform = (btn as HTMLElement).dataset.platform || '';
        this.callbacks.onConnectBiometrics?.(platform);
      });
    });

    // Other actions
    addTapListener(this.panel.querySelector('[data-action="disconnect-biometrics"]'), () => {
      this.callbacks.onDisconnectBiometrics?.();
    });

    addTapListener(this.panel.querySelector('[data-action="connect-calendar"]'), () => {
      this.callbacks.onConnectCalendar?.();
    });

    addTapListener(this.panel.querySelector('[data-action="disconnect-calendar"]'), () => {
      this.callbacks.onDisconnectCalendar?.();
    });

    addTapListener(this.panel.querySelector('[data-action="connect-banking"]'), () => {
      this.callbacks.onConnectBanking?.();
    });

    addTapListener(this.panel.querySelector('[data-action="disconnect-banking"]'), () => {
      this.callbacks.onDisconnectBanking?.();
    });

    addTapListener(this.panel.querySelector('[data-action="view-social-graph"]'), () => {
      this.callbacks.onViewSocialGraph?.();
    });

    addTapListener(this.panel.querySelector('[data-action="clear-social-graph"]'), () => {
      if (confirm('Are you sure you want to clear all relationship data? This cannot be undone.')) {
        this.callbacks.onClearSocialGraph?.();
      }
    });
  }

  private renderStatusBadge(connected: boolean): string {
    if (connected) {
      return `
        <span class="integrations-settings__status integrations-settings__status--connected">
          ${ICONS.check}
          <span>Connected</span>
        </span>
      `;
    }
    return `
      <span class="integrations-settings__status integrations-settings__status--disconnected">
        <span>Not connected</span>
      </span>
    `;
  }

  private renderCapability(name: string, active: boolean): string {
    return `
      <div class="integrations-settings__capability ${active ? 'integrations-settings__capability--active' : ''}">
        <span class="integrations-settings__capability-icon">${active ? ICONS.zap : ''}</span>
        <span>${name}</span>
      </div>
    `;
  }

  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = `
      /* ========================================================================
         INTEGRATIONS SETTINGS MODAL
         ======================================================================== */
      .integrations-settings {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal, 2100);
        pointer-events: none;
        visibility: hidden;
      }

      .integrations-settings--visible {
        pointer-events: auto;
        visibility: visible;
      }

      .integrations-settings__backdrop {
        position: absolute;
        inset: 0;
        background: var(--backdrop-modal, rgba(44, 37, 32, 0.4));
        opacity: 0;
        transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD};
      }

      .integrations-settings--visible .integrations-settings__backdrop {
        opacity: 1;
      }

      .integrations-settings__card {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.95);
        width: 90%;
        max-width: 520px;
        max-height: 85vh;
        background: var(--color-background-elevated, #fffdfb);
        border-radius: var(--radius-xl, 1rem);
        box-shadow: var(--shadow-2xl, 0 25px 50px -12px rgba(44, 37, 32, 0.25));
        display: flex;
        flex-direction: column;
        overflow: hidden;
        opacity: 0;
        transition: all ${DURATION.MODERATE}ms ${EASING.EXPO_OUT};
      }

      .integrations-settings--visible .integrations-settings__card {
        transform: translate(-50%, -50%) scale(1);
        opacity: 1;
      }

      /* Header */
      .integrations-settings__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-5, 20px) var(--space-6, 24px);
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
        flex-shrink: 0;
      }

      .integrations-settings__title-wrap {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
      }

      .integrations-settings__icon-wrap {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, var(--color-accent-primary, #2d5a3d), var(--color-accent-secondary, #4a6741));
        border-radius: var(--radius-lg, 0.75rem);
        color: white;
      }

      .integrations-settings__icon-wrap svg {
        width: 20px;
        height: 20px;
      }

      .integrations-settings__header h2 {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-lg, 1.125rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
        margin: 0;
      }

      .integrations-settings__subtitle {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary, #5c544a);
        margin: 0;
      }

      .integrations-settings__close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        padding: 0;
        background: var(--color-background-tertiary, #ebe6df);
        border: none;
        border-radius: var(--radius-full, 9999px);
        color: var(--color-text-secondary, #5c544a);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .integrations-settings__close:hover {
        background: var(--color-background-secondary, #f5f2ed);
        color: var(--color-text-primary, #2c2520);
      }

      .integrations-settings__close:focus-visible {
        outline: 2px solid var(--color-accent-primary);
        outline-offset: 2px;
      }

      .integrations-settings__close svg {
        width: 18px;
        height: 18px;
      }

      /* Capabilities Bar */
      .integrations-settings__capabilities-bar {
        display: flex;
        align-items: center;
        gap: var(--space-4, 16px);
        padding: var(--space-4, 16px) var(--space-6, 24px);
        background: linear-gradient(135deg, var(--persona-tint, rgba(74, 103, 65, 0.06)), transparent);
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .integrations-settings__capabilities-info {
        display: flex;
        align-items: baseline;
        gap: var(--space-2, 8px);
      }

      .integrations-settings__capabilities-count {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-xl, 1.25rem);
        font-weight: var(--font-weight-bold, 700);
        color: var(--color-accent-text, #2d5a3d);
      }

      .integrations-settings__capabilities-label {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary, #5c544a);
      }

      .integrations-settings__capabilities-progress {
        flex: 1;
        height: 6px;
        background: var(--color-background-tertiary, #ebe6df);
        border-radius: var(--radius-full, 9999px);
        overflow: hidden;
      }

      .integrations-settings__capabilities-fill {
        height: 100%;
        background: linear-gradient(90deg, var(--color-accent-primary, #2d5a3d), var(--color-accent-secondary, #4a6741));
        border-radius: var(--radius-full, 9999px);
        transition: width ${DURATION.SLOW}ms ${EASING.STANDARD};
      }

      /* Content */
      .integrations-settings__content {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-4, 16px) var(--space-6, 24px);
      }

      /* Sections */
      .integrations-settings__section {
        padding: var(--space-4, 16px) 0;
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .integrations-settings__section:last-child {
        border-bottom: none;
      }

      .integrations-settings__section-header {
        display: flex;
        align-items: flex-start;
        gap: var(--space-3, 12px);
        margin-bottom: var(--space-3, 12px);
      }

      .integrations-settings__section-icon {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-background-secondary, #f5f2ed);
        border-radius: var(--radius-md, 0.5rem);
        color: var(--color-accent-primary, #2d5a3d);
        flex-shrink: 0;
      }

      .integrations-settings__section-icon svg {
        width: 18px;
        height: 18px;
      }

      .integrations-settings__section-info {
        flex: 1;
      }

      .integrations-settings__section-info h3 {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-base, 1rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
        margin: 0;
      }

      .integrations-settings__section-info p {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary, #5c544a);
        margin: 0;
      }

      /* Status Badge */
      .integrations-settings__status {
        display: flex;
        align-items: center;
        gap: var(--space-1, 4px);
        padding: var(--space-1, 4px) var(--space-2, 8px);
        border-radius: var(--radius-full, 9999px);
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-weight-medium, 500);
        flex-shrink: 0;
      }

      .integrations-settings__status svg {
        width: 12px;
        height: 12px;
      }

      .integrations-settings__status--connected {
        background: var(--color-semantic-success-bg, rgba(34, 139, 34, 0.1));
        color: var(--color-semantic-success, #228b22);
      }

      .integrations-settings__status--disconnected {
        background: var(--color-background-tertiary, #ebe6df);
        color: var(--color-text-muted, #756a5e);
      }

      /* Connected Info */
      .integrations-settings__connected-info {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-3, 12px);
        background: var(--color-background-secondary, #f5f2ed);
        border-radius: var(--radius-md, 0.5rem);
        margin-bottom: var(--space-3, 12px);
      }

      .integrations-settings__platform-name {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary, #2c2520);
      }

      .integrations-settings__disconnect-btn {
        display: flex;
        align-items: center;
        gap: var(--space-1, 4px);
        padding: var(--space-1, 4px) var(--space-2, 8px);
        background: transparent;
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.2));
        border-radius: var(--radius-md, 0.5rem);
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-secondary, #5c544a);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .integrations-settings__disconnect-btn:hover {
        background: var(--color-semantic-error-bg, rgba(220, 53, 69, 0.1));
        border-color: var(--color-semantic-error, #dc3545);
        color: var(--color-semantic-error, #dc3545);
      }

      .integrations-settings__disconnect-btn:focus-visible {
        outline: 2px solid var(--color-accent-primary);
        outline-offset: 2px;
      }

      .integrations-settings__disconnect-btn svg {
        width: 12px;
        height: 12px;
      }

      /* Platform Buttons */
      .integrations-settings__platforms {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
      }

      .integrations-settings__platform-btn {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        width: 100%;
        padding: var(--space-3, 12px);
        background: var(--color-background-secondary, #f5f2ed);
        border: 1px solid transparent;
        border-radius: var(--radius-md, 0.5rem);
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-primary, #2c2520);
        cursor: pointer;
        text-align: left;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .integrations-settings__platform-btn:hover {
        background: var(--color-background-tertiary, #ebe6df);
        border-color: var(--color-border-subtle, rgba(44, 37, 32, 0.1));
      }

      .integrations-settings__platform-btn:focus-visible {
        outline: 2px solid var(--color-accent-primary);
        outline-offset: 2px;
      }

      .integrations-settings__platform-icon {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-accent-primary, #2d5a3d);
      }

      .integrations-settings__platform-icon svg {
        width: 18px;
        height: 18px;
      }

      .integrations-settings__platform-btn > span:last-of-type {
        flex: 1;
      }

      .integrations-settings__platform-btn > svg:last-child {
        width: 16px;
        height: 16px;
        color: var(--color-text-muted, #756a5e);
      }

      /* Connect Button */
      .integrations-settings__connect-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2, 8px);
        width: 100%;
        padding: var(--space-3, 12px);
        background: var(--color-accent-primary, #2d5a3d);
        border: none;
        border-radius: var(--radius-md, 0.5rem);
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        color: white;
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .integrations-settings__connect-btn:hover {
        background: var(--color-accent-secondary, #4a6741);
      }

      .integrations-settings__connect-btn:focus-visible {
        outline: 2px solid var(--color-accent-primary);
        outline-offset: 2px;
      }

      .integrations-settings__connect-btn svg {
        width: 16px;
        height: 16px;
      }

      /* Privacy Note */
      .integrations-settings__privacy-note {
        display: flex;
        align-items: flex-start;
        gap: var(--space-2, 8px);
        margin-top: var(--space-3, 12px);
        padding: var(--space-3, 12px);
        background: var(--color-background-secondary, #f5f2ed);
        border-radius: var(--radius-md, 0.5rem);
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
        line-height: 1.5;
      }

      .integrations-settings__privacy-note svg {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
        margin-top: 1px;
        color: var(--color-accent-primary, #2d5a3d);
      }

      /* Capabilities List */
      .integrations-settings__capabilities-list {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2, 8px);
        margin-bottom: var(--space-2, 8px);
      }

      .integrations-settings__capability {
        display: flex;
        align-items: center;
        gap: var(--space-1, 4px);
        padding: var(--space-1, 4px) var(--space-2, 8px);
        background: var(--color-background-tertiary, #ebe6df);
        border-radius: var(--radius-full, 9999px);
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
      }

      .integrations-settings__capability--active {
        background: var(--color-semantic-success-bg, rgba(34, 139, 34, 0.1));
        color: var(--color-semantic-success, #228b22);
      }

      .integrations-settings__capability-icon {
        width: 12px;
        height: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .integrations-settings__capability-icon svg {
        width: 10px;
        height: 10px;
      }

      /* Social Graph */
      .integrations-settings__social-info {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-3, 12px);
        background: var(--color-background-secondary, #f5f2ed);
        border-radius: var(--radius-md, 0.5rem);
        margin-bottom: var(--space-3, 12px);
      }

      .integrations-settings__social-stat {
        display: flex;
        align-items: baseline;
        gap: var(--space-2, 8px);
      }

      .integrations-settings__stat-number {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-xl, 1.25rem);
        font-weight: var(--font-weight-bold, 700);
        color: var(--color-accent-text, #2d5a3d);
      }

      .integrations-settings__stat-label {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary, #5c544a);
      }

      .integrations-settings__social-actions {
        display: flex;
        gap: var(--space-2, 8px);
      }

      .integrations-settings__text-btn {
        padding: var(--space-1, 4px) var(--space-2, 8px);
        background: transparent;
        border: none;
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-accent-text, #2d5a3d);
        cursor: pointer;
        text-decoration: underline;
        text-underline-offset: 2px;
        transition: color ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .integrations-settings__text-btn:hover {
        color: var(--color-accent-primary, #2d5a3d);
      }

      .integrations-settings__text-btn:focus-visible {
        outline: 2px solid var(--color-accent-primary);
        outline-offset: 2px;
      }

      .integrations-settings__text-btn--danger {
        color: var(--color-semantic-error, #dc3545);
      }

      .integrations-settings__text-btn--danger:hover {
        color: var(--color-semantic-error-dark, #a71d2a);
      }

      /* ========================================================================
         DARK THEME
         ======================================================================== */
      [data-theme="midnight"] .integrations-settings__backdrop {
        background: var(--backdrop-modal, rgba(0, 0, 0, 0.6));
      }

      [data-theme="midnight"] .integrations-settings__card {
        background: var(--color-background-elevated, #504540);
      }

      [data-theme="midnight"] .integrations-settings__header h2 {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .integrations-settings__subtitle {
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .integrations-settings__close {
        background: var(--color-background-tertiary, #685852);
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .integrations-settings__close:hover {
        background: var(--color-background-secondary, #60504a);
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .integrations-settings__section-icon {
        background: var(--color-background-secondary, #60504a);
        color: var(--color-accent-secondary, #7cb36b);
      }

      [data-theme="midnight"] .integrations-settings__section-info h3 {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .integrations-settings__section-info p {
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .integrations-settings__status--disconnected {
        background: var(--color-background-tertiary, #685852);
        color: var(--color-text-muted, #e8e2da);
      }

      [data-theme="midnight"] .integrations-settings__connected-info {
        background: var(--color-background-secondary, #60504a);
      }

      [data-theme="midnight"] .integrations-settings__platform-name {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .integrations-settings__platform-btn {
        background: var(--color-background-secondary, #60504a);
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .integrations-settings__platform-btn:hover {
        background: var(--color-background-tertiary, #685852);
      }

      [data-theme="midnight"] .integrations-settings__connect-btn {
        background: var(--color-accent-secondary, #7cb36b);
      }

      [data-theme="midnight"] .integrations-settings__connect-btn:hover {
        background: var(--color-accent-primary, #4a6741);
      }

      [data-theme="midnight"] .integrations-settings__privacy-note {
        background: var(--color-background-secondary, #60504a);
        color: var(--color-text-muted, #e8e2da);
      }

      [data-theme="midnight"] .integrations-settings__capability {
        background: var(--color-background-tertiary, #685852);
        color: var(--color-text-muted, #e8e2da);
      }

      [data-theme="midnight"] .integrations-settings__social-info {
        background: var(--color-background-secondary, #60504a);
      }

      [data-theme="midnight"] .integrations-settings__stat-label,
      [data-theme="midnight"] .integrations-settings__capabilities-label {
        color: var(--color-text-secondary, #f0ebe4);
      }

      /* ========================================================================
         RESPONSIVE
         ======================================================================== */
      @media (max-width: 480px) {
        .integrations-settings__card {
          width: 100%;
          max-width: none;
          max-height: 100vh;
          border-radius: 0;
        }

        .integrations-settings__header {
          padding: var(--space-4, 16px);
        }

        .integrations-settings__content {
          padding: var(--space-4, 16px);
        }
      }

      /* ========================================================================
         REDUCED MOTION
         ======================================================================== */
      @media (prefers-reduced-motion: reduce) {
        .integrations-settings__backdrop {
          transition: none !important;
        }

        .integrations-settings__card {
          transition: none !important;
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
    this.styleElement = null;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: IntegrationsSettingsUI | null = null;

export function getIntegrationsSettingsUI(): IntegrationsSettingsUI {
  if (!instance) {
    instance = new IntegrationsSettingsUI();
  }
  return instance;
}

export function initIntegrationsSettingsUI(
  _userId: string, // No longer used - auth handled by apiGet/apiPost
  callbacks: IntegrationsUICallbacks
): void {
  const ui = getIntegrationsSettingsUI();
  ui.setCallbacks(callbacks);
  ui.initialize();
}

export function showIntegrationsSettings(): Promise<void> {
  return getIntegrationsSettingsUI().show();
}

export function hideIntegrationsSettings(): void {
  getIntegrationsSettingsUI().hide();
}

export default IntegrationsSettingsUI;
