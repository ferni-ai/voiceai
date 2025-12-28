/**
 * Notifications & Check-ins UI
 *
 * A consolidated panel for:
 * - Push notification preferences (Settings tab)
 * - Upcoming scheduled check-ins from Ferni (Upcoming tab)
 *
 * Brand-aligned design with warm, human copy.
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { outreachService, type OutreachPreferences } from '../services/outreach.service.js';
import {
  getPushNotificationsService,
  type NotificationPreferences,
} from '../services/push-notifications.service.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

const log = createLogger('NotifySettings');
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

export interface NotificationSettingsUICallbacks {
  onClose?: () => void;
  onSave?: (preferences: NotificationPreferences) => void;
}

interface ScheduledOutreach {
  id: string;
  type: string;
  personaId: string;
  personaName: string;
  channel: 'sms' | 'email' | 'call' | 'push';
  scheduledFor: Date;
  preview: {
    subject?: string;
    body: string;
  };
  reason: string;
  priority: 'high' | 'medium' | 'low';
  canReschedule: boolean;
  canCancel: boolean;
}

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  message: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  sparkles: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
};

const CHANNEL_ICONS: Record<string, string> = {
  sms: ICONS.message,
  email: ICONS.mail,
  call: ICONS.phone,
  push: ICONS.bell,
};

// ============================================================================
// NOTIFICATION SETTINGS UI
// ============================================================================

class NotificationSettingsUI {
  private panel: HTMLElement | null = null;
  private callbacks: NotificationSettingsUICallbacks = {};
  private styleElement: HTMLStyleElement | null = null;
  private localPrefs: NotificationPreferences | null = null;
  private outreachPrefs: OutreachPreferences | null = null;
  private currentTab: 'settings' | 'upcoming' = 'settings';
  private upcomingItems: ScheduledOutreach[] = [];
  private isLoadingUpcoming = false;

  initialize(): void {
    if (this.panel) return;
    this.cleanupOrphanedElements();
    this.injectStyles();
    this.createPanel();
  }

  /**
   * HMR Protection: Remove orphaned elements from previous instances
   */
  private cleanupOrphanedElements(): void {
    document.querySelectorAll('.notif-settings').forEach((el) => el.remove());
    document.querySelectorAll('.notif-settings-styles').forEach((el) => el.remove());
  }

  setCallbacks(callbacks: NotificationSettingsUICallbacks): void {
    this.callbacks = callbacks;
  }

  show(options?: { tab?: 'settings' | 'upcoming' }): void {
    this.initialize();
    if (!this.panel) return;

    // Set initial tab if specified
    if (options?.tab) {
      this.currentTab = options.tab;
    }

    // Load current preferences
    const service = getPushNotificationsService();
    this.localPrefs = service.getPreferences();
    this.outreachPrefs = outreachService.getPreferences();

    this.renderContent();
    this.panel.classList.add('notif-settings--visible');

    // Pre-load upcoming data in background
    void this.loadUpcomingData();
  }

  hide(): void {
    if (!this.panel) return;
    this.panel.classList.remove('notif-settings--visible');
    this.currentTab = 'settings'; // Reset to default
    _clearAllTimeouts();
    this.callbacks.onClose?.();
  }

  private createPanel(): void {
    this.panel = document.createElement('div');
    this.panel.className = 'notif-settings';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Notifications & Check-ins');

    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) this.hide();
    });

    document.body.appendChild(this.panel);
  }

  private async loadUpcomingData(): Promise<void> {
    if (this.isLoadingUpcoming) return;
    this.isLoadingUpcoming = true;

    try {
      const response = await fetch('/api/outreach/upcoming');
      if (response.ok) {
        const data = await response.json();
        this.upcomingItems = (data.upcoming || []).map((item: Record<string, unknown>) => ({
          ...item,
          scheduledFor: new Date(item.scheduledFor as string),
        }));
      } else {
        this.upcomingItems = [];
      }
    } catch (error) {
      log.warn({ error }, 'Failed to load upcoming check-ins');
      this.upcomingItems = [];
    } finally {
      this.isLoadingUpcoming = false;
      // Re-render if we're on the upcoming tab
      if (this.currentTab === 'upcoming' && this.panel) {
        this.renderTabContent();
      }
    }
  }

  private switchTab(tab: 'settings' | 'upcoming'): void {
    this.currentTab = tab;
    this.renderContent();

    if (tab === 'upcoming' && this.upcomingItems.length === 0 && !this.isLoadingUpcoming) {
      void this.loadUpcomingData();
    }
  }

  private renderContent(): void {
    if (!this.panel || !this.localPrefs) return;

    this.panel.innerHTML = `
      <div class="notif-settings__card">
        <header class="notif-settings__header">
          <h2>Notifications & Check-ins</h2>
          <button class="notif-settings__close" aria-label="${t('common.close')}">
            ${ICONS.close}
          </button>
        </header>

        <div class="notif-settings__tabs">
          <button class="notif-settings__tab ${this.currentTab === 'settings' ? 'notif-settings__tab--active' : ''}" data-tab="settings">
            ${ICONS.bell}
            Settings
          </button>
          <button class="notif-settings__tab ${this.currentTab === 'upcoming' ? 'notif-settings__tab--active' : ''}" data-tab="upcoming">
            ${ICONS.calendar}
            Upcoming
          </button>
        </div>

        <div class="notif-settings__content" data-tab-content>
          ${this.renderTabContent()}
        </div>

        ${this.currentTab === 'settings' ? `
          <div class="notif-settings__footer">
            <button aria-label="Cancel" class="notif-settings__btn notif-settings__btn--secondary" data-action="cancel">Cancel</button>
            <button aria-label="Save" class="notif-settings__btn notif-settings__btn--primary" data-action="save">Save Settings</button>
          </div>
        ` : ''}
      </div>
    `;

    this.bindEvents();
  }

  private renderTabContent(): string {
    if (this.currentTab === 'settings') {
      return this.renderSettingsTab();
    }
    return this.renderUpcomingTab();
  }

  private renderSettingsTab(): string {
    if (!this.localPrefs) return '';

    return `
      <div class="notif-settings__group">
        <div class="notif-settings__row notif-settings__row--main">
          <div class="notif-settings__row-text">
            <span class="notif-settings__label">Enable Notifications</span>
            <span class="notif-settings__desc">Receive push notifications from Ferni</span>
          </div>
          <label class="notif-settings__toggle">
            <input type="checkbox" data-pref="enabled" ${this.localPrefs.enabled ? 'checked' : ''}>
            <span class="notif-settings__toggle-track" role="switch" tabindex="0"></span>
          </label>
        </div>
      </div>

      <div class="notif-settings__group" data-requires="enabled">
        <h3>What I'll remind you about</h3>
        
        <div class="notif-settings__row">
          <div class="notif-settings__row-text">
            <span class="notif-settings__label">Daily Practice Reminders</span>
            <span class="notif-settings__desc">Morning ritual prompts</span>
          </div>
          <label class="notif-settings__toggle">
            <input type="checkbox" data-pref="ritualReminders" ${this.localPrefs.ritualReminders ? 'checked' : ''}>
            <span class="notif-settings__toggle-track" role="switch" tabindex="0"></span>
          </label>
        </div>

        <div class="notif-settings__row">
          <div class="notif-settings__row-text">
            <span class="notif-settings__label">Streak Milestones</span>
            <span class="notif-settings__desc">Celebrate your consistency</span>
          </div>
          <label class="notif-settings__toggle">
            <input type="checkbox" data-pref="streakMilestones" ${this.localPrefs.streakMilestones ? 'checked' : ''}>
            <span class="notif-settings__toggle-track" role="switch" tabindex="0"></span>
          </label>
        </div>

        <div class="notif-settings__row">
          <div class="notif-settings__row-text">
            <span class="notif-settings__label">Prediction Results</span>
            <span class="notif-settings__desc">When outcomes are ready</span>
          </div>
          <label class="notif-settings__toggle">
            <input type="checkbox" data-pref="predictionResults" ${this.localPrefs.predictionResults ? 'checked' : ''}>
            <span class="notif-settings__toggle-track" role="switch" tabindex="0"></span>
          </label>
        </div>

        <div class="notif-settings__row">
          <div class="notif-settings__row-text">
            <span class="notif-settings__label">Team Huddles</span>
            <span class="notif-settings__desc">Multi-persona check-ins</span>
          </div>
          <label class="notif-settings__toggle">
            <input type="checkbox" data-pref="teamHuddles" ${this.localPrefs.teamHuddles ? 'checked' : ''}>
            <span class="notif-settings__toggle-track" role="switch" tabindex="0"></span>
          </label>
        </div>

        <div class="notif-settings__row">
          <div class="notif-settings__row-text">
            <span class="notif-settings__label">Ferni Check-ins</span>
            <span class="notif-settings__desc">Proactive wellness prompts</span>
          </div>
          <label class="notif-settings__toggle">
            <input type="checkbox" data-pref="ferniCheckins" ${this.localPrefs.ferniCheckins ? 'checked' : ''}>
            <span class="notif-settings__toggle-track" role="switch" tabindex="0"></span>
          </label>
        </div>
      </div>

      <div class="notif-settings__group" data-requires="enabled">
        <h3>Quiet Hours</h3>
        <p class="notif-settings__group-desc">I won't disturb you during these hours</p>
        
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

      <div class="notif-settings__group">
        <h3>Email & SMS</h3>
        <p class="notif-settings__group-desc">Reach beyond the app</p>
        
        <div class="notif-settings__row">
          <div class="notif-settings__row-text">
            <span class="notif-settings__label">Email Updates</span>
            <span class="notif-settings__desc">Milestone celebrations and recaps</span>
          </div>
          <label class="notif-settings__toggle">
            <input type="checkbox" data-outreach="emailEnabled" ${this.outreachPrefs?.emailEnabled ? 'checked' : ''}>
            <span class="notif-settings__toggle-track" role="switch" tabindex="0"></span>
          </label>
        </div>

        <div class="notif-settings__row">
          <div class="notif-settings__row-text">
            <span class="notif-settings__label">SMS Messages</span>
            <span class="notif-settings__desc">Streak reminders and celebrations</span>
          </div>
          <label class="notif-settings__toggle">
            <input type="checkbox" data-outreach="smsEnabled" ${this.outreachPrefs?.smsEnabled ? 'checked' : ''}>
            <span class="notif-settings__toggle-track" role="switch" tabindex="0"></span>
          </label>
        </div>

        <div class="notif-settings__row">
          <div class="notif-settings__row-text">
            <span class="notif-settings__label">Milestone Celebrations</span>
            <span class="notif-settings__desc">Email/SMS for big moments</span>
          </div>
          <label class="notif-settings__toggle">
            <input type="checkbox" data-outreach="milestoneNotifications" ${this.outreachPrefs?.milestoneNotifications ? 'checked' : ''}>
            <span class="notif-settings__toggle-track" role="switch" tabindex="0"></span>
          </label>
        </div>

        <div class="notif-settings__row">
          <div class="notif-settings__row-text">
            <span class="notif-settings__label">Weekly Recap</span>
            <span class="notif-settings__desc">Summary of our conversations</span>
          </div>
          <label class="notif-settings__toggle">
            <input type="checkbox" data-outreach="weeklyRecap" ${this.outreachPrefs?.weeklyRecap ? 'checked' : ''}>
            <span class="notif-settings__toggle-track" role="switch" tabindex="0"></span>
          </label>
        </div>
      </div>
    `;
  }

  private renderUpcomingTab(): string {
    if (this.isLoadingUpcoming) {
      return `
        <div class="notif-settings__loading">
          <div class="notif-settings__loading-spinner"></div>
          <span>Looking for upcoming check-ins...</span>
        </div>
      `;
    }

    if (this.upcomingItems.length === 0) {
      return `
        <div class="notif-settings__empty">
          <div class="notif-settings__empty-icon">${ICONS.sparkles}</div>
          <h3>No upcoming check-ins yet</h3>
          <p>The more we chat, the better I understand when to reach out. Keep talking with me, and I'll start scheduling thoughtful check-ins based on what matters to you.</p>
          <div class="notif-settings__empty-tip">
            ${ICONS.heart}
            <span>Tip: Enable "Ferni Check-ins" in Settings to let me proactively reach out</span>
          </div>
        </div>
      `;
    }

    const itemsHtml = this.upcomingItems.map((item) => this.renderUpcomingItem(item)).join('');

    return `
      <div class="notif-settings__upcoming-intro">
        <p>Here's when I'm planning to check in with you</p>
      </div>
      <div class="notif-settings__upcoming-list">
        ${itemsHtml}
      </div>
    `;
  }

  private renderUpcomingItem(item: ScheduledOutreach): string {
    const initial = (item.personaName || 'F').charAt(0);
    const channelIcon = CHANNEL_ICONS[item.channel] || CHANNEL_ICONS.push;
    const timeStr = this.formatTime(item.scheduledFor);

    return `
      <div class="notif-settings__upcoming-item" data-outreach-id="${item.id}" data-persona="${item.personaId || 'ferni'}">
        <div class="notif-settings__upcoming-header">
          <div class="notif-settings__upcoming-avatar">${initial}</div>
          <div class="notif-settings__upcoming-info">
            <span class="notif-settings__upcoming-persona">${item.personaName || 'Ferni'}</span>
            <span class="notif-settings__upcoming-meta">
              <span class="notif-settings__upcoming-channel">${channelIcon}</span>
              <span class="notif-settings__upcoming-time">${ICONS.clock} ${timeStr}</span>
            </span>
          </div>
          <span class="notif-settings__upcoming-priority notif-settings__upcoming-priority--${item.priority}">${item.priority}</span>
        </div>
        <p class="notif-settings__upcoming-preview">${item.preview?.body || item.reason}</p>
        ${item.canReschedule || item.canCancel ? `
          <div class="notif-settings__upcoming-actions">
            ${item.canReschedule ? `
              <button class="notif-settings__upcoming-btn" data-action="reschedule" data-id="${item.id}">
                ${ICONS.edit} Reschedule
              </button>
            ` : ''}
            ${item.canCancel ? `
              <button class="notif-settings__upcoming-btn notif-settings__upcoming-btn--danger" data-action="cancel" data-id="${item.id}">
                ${ICONS.trash} Cancel
              </button>
            ` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }

  private formatTime(date: Date): string {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const isToday = date.toDateString() === now.toDateString();
    const isTomorrow = date.toDateString() === tomorrow.toDateString();

    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    if (isToday) {
      return `Today at ${timeStr}`;
    } else if (isTomorrow) {
      return `Tomorrow at ${timeStr}`;
    } else {
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    }
  }

  private bindEvents(): void {
    if (!this.panel) return;

    // Close button
    this.panel.querySelector('.notif-settings__close')?.addEventListener('click', () => this.hide());

    // Tab switching
    this.panel.querySelectorAll('.notif-settings__tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const tabId = (tab as HTMLElement).dataset.tab as 'settings' | 'upcoming';
        this.switchTab(tabId);
      });
    });

    // Preference changes
    this.panel.querySelectorAll('[data-pref]').forEach((input) => {
      input.addEventListener('change', () => this.handlePrefChange(input as HTMLInputElement));
    });

    this.panel.querySelectorAll('[data-outreach]').forEach((input) => {
      input.addEventListener('change', () => this.handleOutreachChange(input as HTMLInputElement));
    });

    // Footer buttons
    this.panel.querySelector('[data-action="cancel"]')?.addEventListener('click', () => this.hide());
    this.panel.querySelector('[data-action="save"]')?.addEventListener('click', () => this.save());

    // Upcoming item actions
    this.panel.querySelectorAll('[data-action="reschedule"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) void this.handleReschedule(id);
      });
    });

    this.panel.querySelectorAll('[data-action="cancel"]').forEach((btn) => {
      if ((btn as HTMLElement).dataset.id) {
        btn.addEventListener('click', () => {
          const id = (btn as HTMLElement).dataset.id;
          if (id) void this.handleCancelOutreach(id);
        });
      }
    });

    // Update disabled state based on master toggle
    this.updateDependentSections();
  }

  private handleOutreachChange(input: HTMLInputElement): void {
    if (!this.outreachPrefs) return;

    const pref = input.dataset.outreach as keyof OutreachPreferences;

    if (input.type === 'checkbox') {
      (this.outreachPrefs as unknown as Record<string, unknown>)[pref] = input.checked;
    }
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
    dependentGroups.forEach((group) => {
      if (this.localPrefs?.enabled) {
        group.classList.remove('notif-settings__group--disabled');
        group.querySelectorAll('input').forEach((input) => {
          input.disabled = false;
        });
      } else {
        group.classList.add('notif-settings__group--disabled');
        group.querySelectorAll('input').forEach((input) => {
          input.disabled = true;
        });
      }
    });
  }

  private async handleReschedule(outreachId: string): Promise<void> {
    // Simple reschedule dialog
    const options = [
      { label: 'In 1 hour', offset: 3600000 },
      { label: 'In 3 hours', offset: 3 * 3600000 },
      { label: 'Tomorrow morning', time: '09:00' },
    ];

    const choice = await this.showRescheduleDialog(options);
    if (!choice) return;

    try {
      const response = await fetch('/api/outreach/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggerId: outreachId, newTime: choice }),
      });

      if (response.ok) {
        log.info({ outreachId }, 'Rescheduled outreach');
        void this.loadUpcomingData();
      }
    } catch (error) {
      log.error({ error, outreachId }, 'Failed to reschedule');
    }
  }

  private showRescheduleDialog(options: Array<{ label: string; offset?: number; time?: string }>): Promise<string | null> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'notif-settings__dialog-overlay';

      const now = new Date();
      const optionsHtml = options.map((opt) => {
        let targetTime: Date;
        if (opt.offset) {
          targetTime = new Date(now.getTime() + opt.offset);
        } else if (opt.time) {
          targetTime = new Date(now);
          targetTime.setDate(targetTime.getDate() + 1);
          const [h, m] = opt.time.split(':').map(Number);
          targetTime.setHours(h, m, 0, 0);
        } else {
          targetTime = now;
        }

        return `
          <button class="notif-settings__dialog-option" data-time="${targetTime.toISOString()}">
            ${opt.label}
          </button>
        `;
      }).join('');

      overlay.innerHTML = `
        <div class="notif-settings__dialog">
          <h3>Reschedule check-in</h3>
          <div class="notif-settings__dialog-options">
            ${optionsHtml}
          </div>
          <button class="notif-settings__dialog-cancel">Cancel</button>
        </div>
      `;

      const close = (result: string | null) => {
        overlay.classList.remove('notif-settings__dialog-overlay--visible');
        trackedTimeout(() => overlay.remove(), 200);
        resolve(result);
      };

      overlay.querySelector('.notif-settings__dialog-cancel')?.addEventListener('click', () => close(null));
      overlay.querySelectorAll('.notif-settings__dialog-option').forEach((btn) => {
        btn.addEventListener('click', () => {
          const time = (btn as HTMLElement).dataset.time;
          close(time || null);
        });
      });

      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('notif-settings__dialog-overlay--visible'));
    });
  }

  private async handleCancelOutreach(outreachId: string): Promise<void> {
    if (!confirm('Are you sure you want to cancel this check-in?')) {
      return;
    }

    try {
      const response = await fetch(`/api/outreach/pending/${outreachId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        log.info({ outreachId }, 'Cancelled outreach');
        void this.loadUpcomingData();
      }
    } catch (error) {
      log.error({ error, outreachId }, 'Failed to cancel outreach');
    }
  }

  private save(): void {
    if (!this.localPrefs) return;

    const service = getPushNotificationsService();
    service.setPreferences(this.localPrefs);

    // Request permission if enabling
    if (this.localPrefs.enabled) {
      void service.requestPermission().then((permission) => {
        if (permission !== 'granted') {
          log.warn('Permission not granted');
        }
      });
    }

    // Save outreach preferences
    if (this.outreachPrefs) {
      void outreachService.updatePreferences(this.outreachPrefs);
      log.info('Outreach preferences saved');
    }

    this.callbacks.onSave?.(this.localPrefs);
    this.hide();
  }

  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.className = 'notif-settings-styles';
    this.styleElement.textContent = `
      .notif-settings {
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

      .notif-settings--visible { opacity: 1; visibility: visible; }

      .notif-settings__card {
        width: 100%;
        max-width: clamp(360px, 90vw, 520px);
        max-height: 85vh;
        background: var(--color-bg-elevated, #FFFDFB);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
        border-radius: var(--radius-xl, 20px);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transform: scale(0.95);
        transition: transform ${DURATION.SLOW}ms ${EASING.SPRING};
      }

      .notif-settings--visible .notif-settings__card { transform: scale(1); }

      .notif-settings__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-5, 20px) var(--space-6, 24px);
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .notif-settings__header h2 {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-lg, 1.125rem);
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

      /* Tabs */
      .notif-settings__tabs {
        display: flex;
        gap: var(--space-2, 8px);
        padding: var(--space-3, 12px) var(--space-6, 24px);
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .notif-settings__tab {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2, 8px);
        padding: var(--space-3, 12px) var(--space-4, 16px);
        background: transparent;
        border: none;
        border-radius: var(--radius-lg, 12px);
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-secondary, #5c544a);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .notif-settings__tab svg {
        width: 18px;
        height: 18px;
      }

      .notif-settings__tab:hover { background: var(--color-background-secondary, #f5f2ed); }

      .notif-settings__tab--active {
        background: var(--persona-primary, #4a6741);
        color: white;
      }

      .notif-settings__tab--active:hover { background: var(--persona-secondary, #3d5a35); }

      .notif-settings__content {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-4, 16px) var(--space-6, 24px);
      }

      .notif-settings__group {
        margin-bottom: var(--space-6, 24px);
      }

      .notif-settings__group:last-child { margin-bottom: 0; }

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
        flex-shrink: 0;
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
        padding: var(--space-4, 16px) var(--space-6, 24px);
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

      /* Loading state */
      .notif-settings__loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--space-12, 48px) var(--space-6, 24px);
        color: var(--color-text-muted);
        gap: var(--space-3, 12px);
      }

      .notif-settings__loading-spinner {
        width: 24px;
        height: 24px;
        border: 2px solid var(--color-border-subtle);
        border-top-color: var(--persona-primary, #4a6741);
        border-radius: 50%;
        animation: notif-spin 0.8s linear infinite;
      }

      @keyframes notif-spin {
        to { transform: rotate(360deg); }
      }

      /* Empty state */
      .notif-settings__empty {
        text-align: center;
        padding: var(--space-8, 32px) var(--space-4, 16px);
      }

      .notif-settings__empty-icon {
        width: 48px;
        height: 48px;
        margin: 0 auto var(--space-4, 16px);
        color: var(--persona-primary, #4a6741);
        opacity: 0.6;
      }

      .notif-settings__empty-icon svg {
        width: 100%;
        height: 100%;
      }

      .notif-settings__empty h3 {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-base, 1rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0 0 var(--space-3, 12px);
      }

      .notif-settings__empty p {
        font-family: var(--font-body);
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        line-height: 1.6;
        margin: 0 0 var(--space-6, 24px);
        max-width: 320px;
        margin-left: auto;
        margin-right: auto;
      }

      .notif-settings__empty-tip {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2, 8px);
        padding: var(--space-3, 12px) var(--space-4, 16px);
        background: var(--color-background-secondary, #f5f2ed);
        border-radius: var(--radius-lg, 12px);
        font-size: var(--text-xs);
        color: var(--color-text-secondary);
      }

      .notif-settings__empty-tip svg {
        width: 16px;
        height: 16px;
        color: var(--persona-primary, #4a6741);
        flex-shrink: 0;
      }

      /* Upcoming list */
      .notif-settings__upcoming-intro {
        margin-bottom: var(--space-4, 16px);
      }

      .notif-settings__upcoming-intro p {
        font-family: var(--font-body);
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        margin: 0;
      }

      .notif-settings__upcoming-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-3, 12px);
      }

      .notif-settings__upcoming-item {
        padding: var(--space-4, 16px);
        background: var(--color-background-secondary, #f5f2ed);
        border-radius: var(--radius-lg, 12px);
        transition: transform ${DURATION.FAST}ms ${EASING.STANDARD}, box-shadow ${DURATION.FAST}ms;
      }

      .notif-settings__upcoming-item:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-md);
      }

      .notif-settings__upcoming-header {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        margin-bottom: var(--space-3, 12px);
      }

      .notif-settings__upcoming-avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: var(--text-sm);
        font-weight: var(--font-weight-semibold);
        color: white;
        background: var(--persona-primary, #4a6741);
        flex-shrink: 0;
      }

      .notif-settings__upcoming-info {
        flex: 1;
        min-width: 0;
      }

      .notif-settings__upcoming-persona {
        display: block;
        font-family: var(--font-display);
        font-size: var(--text-sm);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-primary);
      }

      .notif-settings__upcoming-meta {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        margin-top: var(--space-1);
      }

      .notif-settings__upcoming-channel,
      .notif-settings__upcoming-time {
        display: flex;
        align-items: center;
        gap: var(--space-1);
      }

      .notif-settings__upcoming-channel svg,
      .notif-settings__upcoming-time svg {
        width: 12px;
        height: 12px;
      }

      .notif-settings__upcoming-priority {
        font-size: 10px;
        font-weight: var(--font-weight-semibold);
        padding: 2px 6px;
        border-radius: var(--radius-sm);
        text-transform: uppercase;
      }

      .notif-settings__upcoming-priority--high {
        background: var(--color-semantic-error-glow, rgba(239, 68, 68, 0.1));
        color: var(--color-semantic-error, #dc2626);
      }

      .notif-settings__upcoming-priority--medium {
        background: var(--color-semantic-warning-glow, rgba(245, 158, 11, 0.1));
        color: var(--color-semantic-warning, #d97706);
      }

      .notif-settings__upcoming-priority--low {
        background: var(--color-semantic-success-glow, rgba(34, 197, 94, 0.1));
        color: var(--color-semantic-success, #16a34a);
      }

      .notif-settings__upcoming-preview {
        font-family: var(--font-body);
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        line-height: 1.5;
        margin: 0 0 var(--space-3, 12px);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .notif-settings__upcoming-actions {
        display: flex;
        gap: var(--space-2, 8px);
      }

      .notif-settings__upcoming-btn {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2, 8px);
        padding: var(--space-2, 8px) var(--space-3, 12px);
        background: var(--color-background-elevated, #fffdfb);
        border: none;
        border-radius: var(--radius-md);
        font-family: var(--font-display);
        font-size: var(--text-xs);
        font-weight: var(--font-weight-medium);
        color: var(--color-text-secondary);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .notif-settings__upcoming-btn svg {
        width: 14px;
        height: 14px;
      }

      .notif-settings__upcoming-btn:hover {
        background: var(--color-background-tertiary);
        color: var(--color-text-primary);
      }

      .notif-settings__upcoming-btn--danger:hover {
        background: var(--color-semantic-error-glow);
        color: var(--color-semantic-error);
      }

      /* Reschedule dialog */
      .notif-settings__dialog-overlay {
        position: fixed;
        inset: 0;
        z-index: calc(var(--z-modal, 1400) + 10);
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(44, 37, 32, 0.5);
        opacity: 0;
        transition: opacity ${DURATION.NORMAL}ms;
      }

      .notif-settings__dialog-overlay--visible { opacity: 1; }

      .notif-settings__dialog {
        width: 90%;
        max-width: 320px;
        background: var(--color-background-elevated);
        border-radius: var(--radius-xl);
        padding: var(--space-6, 24px);
        box-shadow: var(--shadow-2xl);
        transform: scale(0.95);
        transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
      }

      .notif-settings__dialog-overlay--visible .notif-settings__dialog {
        transform: scale(1);
      }

      .notif-settings__dialog h3 {
        font-family: var(--font-display);
        font-size: var(--text-base);
        font-weight: var(--font-weight-semibold);
        text-align: center;
        margin: 0 0 var(--space-4, 16px);
      }

      .notif-settings__dialog-options {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
      }

      .notif-settings__dialog-option {
        padding: var(--space-3, 12px) var(--space-4, 16px);
        background: var(--color-background-secondary);
        border: none;
        border-radius: var(--radius-md);
        font-family: var(--font-body);
        font-size: var(--text-sm);
        color: var(--color-text-primary);
        cursor: pointer;
        text-align: left;
        transition: background ${DURATION.FAST}ms;
      }

      .notif-settings__dialog-option:hover {
        background: var(--color-background-tertiary);
      }

      .notif-settings__dialog-cancel {
        width: 100%;
        margin-top: var(--space-4, 16px);
        padding: var(--space-2, 8px);
        background: none;
        border: none;
        font-family: var(--font-body);
        font-size: var(--text-sm);
        color: var(--color-text-muted);
        cursor: pointer;
      }

      /* Dark theme */
      [data-theme="midnight"] .notif-settings { background: var(--backdrop-page); }
      [data-theme="midnight"] .notif-settings__card { background: var(--color-background-elevated, #70605a); }
      [data-theme="midnight"] .notif-settings__header h2,
      [data-theme="midnight"] .notif-settings__group h3,
      [data-theme="midnight"] .notif-settings__label { color: var(--color-text-primary, #faf6f0); }
      [data-theme="midnight"] .notif-settings__row--main,
      [data-theme="midnight"] .notif-settings__upcoming-item { background: var(--color-background-secondary, #60504a); }
      [data-theme="midnight"] .notif-settings__toggle-track { background: var(--color-background-tertiary, #685852); }
      [data-theme="midnight"] .notif-settings__time-field input { background: var(--color-background-secondary, #60504a); color: var(--color-text-primary, #faf6f0); }
      [data-theme="midnight"] .notif-settings__close { background: var(--color-background-tertiary, #685852); color: var(--color-text-secondary, #f0ebe4); }
      [data-theme="midnight"] .notif-settings__tab { color: var(--color-text-secondary, #f0ebe4); }
      [data-theme="midnight"] .notif-settings__tab:hover { background: var(--color-background-secondary, #60504a); }
      [data-theme="midnight"] .notif-settings__empty-tip { background: var(--color-background-secondary, #60504a); }
      [data-theme="midnight"] .notif-settings__upcoming-btn { background: var(--color-background-tertiary, #685852); }
      [data-theme="midnight"] .notif-settings__dialog { background: var(--color-background-elevated, #70605a); }
      [data-theme="midnight"] .notif-settings__dialog-option { background: var(--color-background-secondary, #60504a); color: var(--color-text-primary, #faf6f0); }

      @media (prefers-reduced-motion: reduce) {
        .notif-settings { transition: opacity ${DURATION.FAST}ms linear; }
        .notif-settings__card { transition: none; }
        .notif-settings__loading-spinner { animation: none; }
      }

      @media (max-width: 480px) {
        .notif-settings__card {
          max-width: 100%;
          max-height: 100%;
          border-radius: 0;
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
    _clearAllTimeouts();
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

export function showNotificationSettings(options?: { tab?: 'settings' | 'upcoming' }): void {
  getNotificationSettingsUI().show(options);
}

export function hideNotificationSettings(): void {
  getNotificationSettingsUI().hide();
}

export default NotificationSettingsUI;
