/**
 * Notification Settings UI
 *
 * Allows users to configure push notification preferences.
 * Brand-aligned settings panel with toggle controls.
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { 
  getPushNotificationsService,
  type NotificationPreferences,
} from '../services/push-notifications.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('NotifySettings');

// ============================================================================
// TYPES
// ============================================================================

export interface NotificationSettingsUICallbacks {
  onClose?: () => void;
  onSave?: (preferences: NotificationPreferences) => void;
}

// ============================================================================
// NOTIFICATION SETTINGS UI
// ============================================================================

class NotificationSettingsUI {
  private panel: HTMLElement | null = null;
  private callbacks: NotificationSettingsUICallbacks = {};
  private styleElement: HTMLStyleElement | null = null;
  private localPrefs: NotificationPreferences | null = null;

  initialize(): void {
    if (this.panel) return;
    this.injectStyles();
    this.createPanel();
  }

  setCallbacks(callbacks: NotificationSettingsUICallbacks): void {
    this.callbacks = callbacks;
  }

  show(): void {
    this.initialize();
    if (!this.panel) return;

    // Load current preferences
    const service = getPushNotificationsService();
    this.localPrefs = service.getPreferences();

    this.renderContent();
    this.panel.classList.add('notif-settings--visible');
  }

  hide(): void {
    if (!this.panel) return;
    this.panel.classList.remove('notif-settings--visible');
    this.callbacks.onClose?.();
  }

  private createPanel(): void {
    this.panel = document.createElement('div');
    this.panel.className = 'notif-settings';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Notification settings');

    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) this.hide();
    });

    document.body.appendChild(this.panel);
  }

  private renderContent(): void {
    if (!this.panel || !this.localPrefs) return;

    this.panel.innerHTML = `
      <div class="notif-settings__card">
        <header class="notif-settings__header">
          <h2>Notification Settings</h2>
          <button class="notif-settings__close" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </header>

        <div class="notif-settings__content">
          <div class="notif-settings__group">
            <div class="notif-settings__row notif-settings__row--main">
              <div class="notif-settings__row-text">
                <span class="notif-settings__label">Enable Notifications</span>
                <span class="notif-settings__desc">Receive push notifications from Ferni</span>
              </div>
              <label class="notif-settings__toggle">
                <input type="checkbox" data-pref="enabled" ${this.localPrefs.enabled ? 'checked' : ''}>
                <span class="notif-settings__toggle-track"></span>
              </label>
            </div>
          </div>

          <div class="notif-settings__group" data-requires="enabled">
            <h3>Notification Types</h3>
            
            <div class="notif-settings__row">
              <div class="notif-settings__row-text">
                <span class="notif-settings__label">Daily Practice Reminders</span>
                <span class="notif-settings__desc">Morning ritual prompts</span>
              </div>
              <label class="notif-settings__toggle">
                <input type="checkbox" data-pref="ritualReminders" ${this.localPrefs.ritualReminders ? 'checked' : ''}>
                <span class="notif-settings__toggle-track"></span>
              </label>
            </div>

            <div class="notif-settings__row">
              <div class="notif-settings__row-text">
                <span class="notif-settings__label">Streak Milestones</span>
                <span class="notif-settings__desc">Celebrate your consistency</span>
              </div>
              <label class="notif-settings__toggle">
                <input type="checkbox" data-pref="streakMilestones" ${this.localPrefs.streakMilestones ? 'checked' : ''}>
                <span class="notif-settings__toggle-track"></span>
              </label>
            </div>

            <div class="notif-settings__row">
              <div class="notif-settings__row-text">
                <span class="notif-settings__label">Prediction Results</span>
                <span class="notif-settings__desc">When outcomes are ready</span>
              </div>
              <label class="notif-settings__toggle">
                <input type="checkbox" data-pref="predictionResults" ${this.localPrefs.predictionResults ? 'checked' : ''}>
                <span class="notif-settings__toggle-track"></span>
              </label>
            </div>

            <div class="notif-settings__row">
              <div class="notif-settings__row-text">
                <span class="notif-settings__label">Team Huddles</span>
                <span class="notif-settings__desc">Multi-persona check-ins</span>
              </div>
              <label class="notif-settings__toggle">
                <input type="checkbox" data-pref="teamHuddles" ${this.localPrefs.teamHuddles ? 'checked' : ''}>
                <span class="notif-settings__toggle-track"></span>
              </label>
            </div>

            <div class="notif-settings__row">
              <div class="notif-settings__row-text">
                <span class="notif-settings__label">Ferni Check-ins</span>
                <span class="notif-settings__desc">Proactive wellness prompts</span>
              </div>
              <label class="notif-settings__toggle">
                <input type="checkbox" data-pref="ferniCheckins" ${this.localPrefs.ferniCheckins ? 'checked' : ''}>
                <span class="notif-settings__toggle-track"></span>
              </label>
            </div>
          </div>

          <div class="notif-settings__group" data-requires="enabled">
            <h3>Quiet Hours</h3>
            <p class="notif-settings__group-desc">No notifications during these hours</p>
            
            <div class="notif-settings__time-row">
              <div class="notif-settings__time-field">
                <label for="quiet-start">From</label>
                <input type="time" id="quiet-start" data-pref="quietHoursStart" value="${this.localPrefs.quietHoursStart || '22:00'}">
              </div>
              <div class="notif-settings__time-field">
                <label for="quiet-end">To</label>
                <input type="time" id="quiet-end" data-pref="quietHoursEnd" value="${this.localPrefs.quietHoursEnd || '08:00'}">
              </div>
            </div>
          </div>
        </div>

        <div class="notif-settings__footer">
          <button class="notif-settings__btn notif-settings__btn--secondary" data-action="cancel">Cancel</button>
          <button class="notif-settings__btn notif-settings__btn--primary" data-action="save">Save Settings</button>
        </div>
      </div>
    `;

    // Bind events
    this.panel.querySelector('.notif-settings__close')?.addEventListener('click', () => this.hide());
    
    this.panel.querySelectorAll('[data-pref]').forEach(input => {
      input.addEventListener('change', () => this.handlePrefChange(input as HTMLInputElement));
    });

    this.panel.querySelector('[data-action="cancel"]')?.addEventListener('click', () => this.hide());
    this.panel.querySelector('[data-action="save"]')?.addEventListener('click', () => this.save());

    // Update disabled state based on master toggle
    this.updateDependentSections();
  }

  private handlePrefChange(input: HTMLInputElement): void {
    if (!this.localPrefs) return;

    const pref = input.dataset.pref as keyof NotificationPreferences;
    
    if (input.type === 'checkbox') {
      (this.localPrefs as unknown as Record<string, unknown>)[pref] = input.checked;
    } else {
      (this.localPrefs as unknown as Record<string, unknown>)[pref] = input.value;
    }

    // Update dependent sections if main toggle changed
    if (pref === 'enabled') {
      this.updateDependentSections();
    }
  }

  private updateDependentSections(): void {
    if (!this.panel || !this.localPrefs) return;

    const dependentGroups = this.panel.querySelectorAll('[data-requires="enabled"]');
    dependentGroups.forEach(group => {
      if (this.localPrefs?.enabled) {
        group.classList.remove('notif-settings__group--disabled');
        group.querySelectorAll('input').forEach(input => {
          (input).disabled = false;
        });
      } else {
        group.classList.add('notif-settings__group--disabled');
        group.querySelectorAll('input').forEach(input => {
          (input).disabled = true;
        });
      }
    });
  }

  private save(): void {
    if (!this.localPrefs) return;

    const service = getPushNotificationsService();
    service.setPreferences(this.localPrefs);

    // Request permission if enabling
    if (this.localPrefs.enabled) {
      void service.requestPermission().then(permission => {
        if (permission !== 'granted') {
          log.warn('[NotificationSettings] Permission not granted');
        }
      });
    }

    this.callbacks.onSave?.(this.localPrefs);
    this.hide();
  }

  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = `
      .notif-settings {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal, 1400);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--ma-rest, 21px);
        background: var(--backdrop-page);
        backdrop-filter: blur(var(--glass-blur-subtle, 8px));
        opacity: 0;
        visibility: hidden;
        transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD}, visibility ${DURATION.SLOW}ms;
      }

      .notif-settings--visible { opacity: 1; visibility: visible; }

      .notif-settings__card {
        width: 100%;
        max-width: 440px;
        max-height: 85vh;
        background: var(--color-background-elevated, #fffdfb);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
        border-radius: var(--radius-xl, 1.5rem);
        box-shadow: var(--shadow-2xl, 0 24px 48px rgba(44, 37, 32, 0.15));
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .notif-settings__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--ma-rest, 21px) var(--ma-silence, 34px);
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .notif-settings__header h2 {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-lg, 1.0625rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
        margin: 0;
      }

      .notif-settings__close {
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

      .notif-settings__close:hover { background: var(--color-background-secondary, #f5f2ed); color: var(--color-text-primary, #2c2520); }
      .notif-settings__close svg { width: 16px; height: 16px; }

      .notif-settings__content {
        flex: 1;
        overflow-y: auto;
        padding: var(--ma-breath, 13px) var(--ma-silence, 34px);
      }

      .notif-settings__group {
        margin-bottom: var(--ma-rest, 21px);
      }

      .notif-settings__group h3 {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
        margin: 0 0 var(--space-2, 8px) 0;
      }

      .notif-settings__group-desc {
        font-family: var(--font-body);
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        margin: 0 0 var(--space-3) 0;
      }

      .notif-settings__group--disabled {
        opacity: 0.5;
        pointer-events: none;
      }

      .notif-settings__row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-3, 12px) 0;
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .notif-settings__row:last-child { border-bottom: none; }

      .notif-settings__row--main {
        padding: var(--space-4, 16px);
        background: var(--color-background-secondary, #f5f2ed);
        border-radius: var(--radius-lg, 0.75rem);
        border-bottom: none;
        margin-bottom: var(--space-3, 12px);
      }

      .notif-settings__row-text { flex: 1; }

      .notif-settings__label {
        display: block;
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary, #2c2520);
      }

      .notif-settings__desc {
        display: block;
        font-family: var(--font-body);
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        margin-top: var(--space-1);
      }

      /* Toggle switch */
      .notif-settings__toggle {
        position: relative;
        width: 48px;
        height: 28px;
        cursor: pointer;
      }

      .notif-settings__toggle input {
        position: absolute;
        opacity: 0;
        width: 100%;
        height: 100%;
        cursor: pointer;
      }

      .notif-settings__toggle-track {
        position: absolute;
        inset: 0;
        background: var(--color-background-tertiary, #ebe6df);
        border-radius: var(--radius-full, 9999px);
        transition: background ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .notif-settings__toggle-track::after {
        content: '';
        position: absolute;
        top: 2px;
        left: 2px;
        width: 24px;
        height: 24px;
        background: white;
        border-radius: 50%;
        box-shadow: var(--shadow-sm, 0 1px 2px rgba(44, 37, 32, 0.1));
        transition: transform ${DURATION.FAST}ms ${EASING.SPRING};
      }

      .notif-settings__toggle input:checked + .notif-settings__toggle-track {
        background: var(--color-accent-primary, #2d5a3d);
      }

      .notif-settings__toggle input:checked + .notif-settings__toggle-track::after {
        transform: translateX(20px);
      }

      /* Time inputs */
      .notif-settings__time-row {
        display: flex;
        gap: var(--space-4, 16px);
      }

      .notif-settings__time-field {
        flex: 1;
      }

      .notif-settings__time-field label {
        display: block;
        font-family: var(--font-body);
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        margin-bottom: var(--space-1);
      }

      .notif-settings__time-field input {
        width: 100%;
        padding: var(--space-2) var(--space-3);
        font-family: var(--font-body);
        font-size: var(--text-sm);
        color: var(--color-text-primary);
        background: var(--color-background-secondary);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-md);
        outline: none;
      }

      .notif-settings__time-field input:focus {
        border-color: var(--color-accent-primary, #2d5a3d);
      }

      /* Footer */
      .notif-settings__footer {
        display: flex;
        justify-content: flex-end;
        gap: var(--space-3, 12px);
        padding: var(--ma-breath, 13px) var(--ma-silence, 34px);
        border-top: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .notif-settings__btn {
        padding: var(--space-3, 12px) var(--space-6, 24px);
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        border: none;
        border-radius: var(--radius-lg, 0.75rem);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .notif-settings__btn--primary {
        background: var(--color-accent-primary, #2d5a3d);
        color: white;
      }

      .notif-settings__btn--primary:hover { background: var(--color-accent-hover, #3a7050); }

      .notif-settings__btn--secondary {
        background: transparent;
        color: var(--color-text-muted, #756a5e);
      }

      .notif-settings__btn--secondary:hover {
        color: var(--color-text-primary, #2c2520);
        background: var(--color-background-secondary, #f5f2ed);
      }

      /* Dark theme - WCAG AA Compliant */
      [data-theme="midnight"] .notif-settings { background: var(--backdrop-page); }
      [data-theme="midnight"] .notif-settings__card { background: var(--color-background-elevated, #70605a); }
      [data-theme="midnight"] .notif-settings__header h2,
      [data-theme="midnight"] .notif-settings__group h3,
      [data-theme="midnight"] .notif-settings__label { color: var(--color-text-primary, #faf6f0); }
      [data-theme="midnight"] .notif-settings__row--main { background: var(--color-background-secondary, #60504a); }
      [data-theme="midnight"] .notif-settings__toggle-track { background: var(--color-background-tertiary, #685852); }
      [data-theme="midnight"] .notif-settings__time-field input { background: var(--color-background-secondary, #60504a); color: var(--color-text-primary, #faf6f0); }
      [data-theme="midnight"] .notif-settings__close { background: var(--color-background-tertiary, #685852); color: var(--color-text-secondary, #f0ebe4); }
      [data-theme="midnight"] .notif-settings__description,
      [data-theme="midnight"] .notif-settings__hint { color: var(--color-text-muted, #e8e2da); }

      @media (prefers-reduced-motion: reduce) {
        .notif-settings { transition: opacity ${DURATION.FAST}ms linear; }
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

let instance: NotificationSettingsUI | null = null;

export function getNotificationSettingsUI(): NotificationSettingsUI {
  if (!instance) instance = new NotificationSettingsUI();
  return instance;
}

export function initNotificationSettingsUI(): void {
  getNotificationSettingsUI().initialize();
}

export function showNotificationSettings(): void {
  getNotificationSettingsUI().show();
}

export function hideNotificationSettings(): void {
  getNotificationSettingsUI().hide();
}

export default NotificationSettingsUI;

