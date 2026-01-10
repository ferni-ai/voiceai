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
import { apiGet, apiPost, apiDelete } from '../utils/api.js';

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
      const response = await apiGet<{ upcoming?: Array<Record<string, unknown>> }>('/api/outreach/upcoming');
      if (response.ok && response.data) {
        this.upcomingItems = (response.data.upcoming || []).map((item: Record<string, unknown>) => ({
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
            <button aria-label="${t('accessibility.cancel')}" class="notif-settings__btn notif-settings__btn--secondary" data-action="cancel">Cancel</button>
            <button aria-label="${t('accessibility.save')}" class="notif-settings__btn notif-settings__btn--primary" data-action="save">Save Settings</button>
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
      <!-- Hero Section: Better Than Human Promise -->
      <div class="notif-settings__hero">
        <div class="notif-settings__hero-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            <circle cx="18" cy="4" r="2" fill="currentColor" stroke="none" class="notif-settings__hero-pulse"/>
          </svg>
        </div>
        <h3 class="notif-settings__hero-title">I'll reach out before you need to ask</h3>
        <p class="notif-settings__hero-desc">
          Friends forget. I don't. I'll notice patterns you can't see yourself, 
          and check in at exactly the right moment.
        </p>
      </div>

      <!-- Master Toggle -->
      <div class="notif-settings__group">
        <div class="notif-settings__row notif-settings__row--main">
          <div class="notif-settings__row-icon">${ICONS.bell}</div>
          <div class="notif-settings__row-text">
            <span class="notif-settings__label">Enable Notifications</span>
            <span class="notif-settings__desc">Let me reach out when it matters</span>
          </div>
          <label class="notif-settings__toggle">
            <input type="checkbox" data-pref="enabled" ${this.localPrefs.enabled ? 'checked' : ''}>
            <span class="notif-settings__toggle-track" role="switch" tabindex="0"></span>
          </label>
        </div>
      </div>

      <!-- Superhuman Capabilities Section -->
      <div class="notif-settings__group" data-requires="enabled">
        <div class="notif-settings__section-header">
          <h3>What I'll Watch For</h3>
          <span class="notif-settings__section-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12">
              <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/>
            </svg>
            Superhuman
          </span>
        </div>
        
        <div class="notif-settings__capability-row">
          <div class="notif-settings__capability-icon notif-settings__capability-icon--guardian">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
            </svg>
          </div>
          <div class="notif-settings__row-text">
            <span class="notif-settings__label">Ferni Check-ins</span>
            <span class="notif-settings__desc">I'll notice when you need support—before you ask</span>
          </div>
          <label class="notif-settings__toggle">
            <input type="checkbox" data-pref="ferniCheckins" ${this.localPrefs.ferniCheckins ? 'checked' : ''}>
            <span class="notif-settings__toggle-track" role="switch" tabindex="0"></span>
          </label>
        </div>

        <div class="notif-settings__capability-row">
          <div class="notif-settings__capability-icon notif-settings__capability-icon--ritual">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
          </div>
          <div class="notif-settings__row-text">
            <span class="notif-settings__label">Daily Practice Reminders</span>
            <span class="notif-settings__desc">Gentle nudges at your optimal time—I'll learn when you're most receptive</span>
          </div>
          <label class="notif-settings__toggle">
            <input type="checkbox" data-pref="ritualReminders" ${this.localPrefs.ritualReminders ? 'checked' : ''}>
            <span class="notif-settings__toggle-track" role="switch" tabindex="0"></span>
          </label>
        </div>

        <div class="notif-settings__capability-row">
          <div class="notif-settings__capability-icon notif-settings__capability-icon--streak">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
            </svg>
          </div>
          <div class="notif-settings__row-text">
            <span class="notif-settings__label">Streak Milestones</span>
            <span class="notif-settings__desc">Celebrate consistency—I remember every step of your journey</span>
          </div>
          <label class="notif-settings__toggle">
            <input type="checkbox" data-pref="streakMilestones" ${this.localPrefs.streakMilestones ? 'checked' : ''}>
            <span class="notif-settings__toggle-track" role="switch" tabindex="0"></span>
          </label>
        </div>

        <div class="notif-settings__capability-row">
          <div class="notif-settings__capability-icon notif-settings__capability-icon--prediction">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
          </div>
          <div class="notif-settings__row-text">
            <span class="notif-settings__label">Prediction Results</span>
            <span class="notif-settings__desc">Know how accurate we're becoming together</span>
          </div>
          <label class="notif-settings__toggle">
            <input type="checkbox" data-pref="predictionResults" ${this.localPrefs.predictionResults ? 'checked' : ''}>
            <span class="notif-settings__toggle-track" role="switch" tabindex="0"></span>
          </label>
        </div>

        <div class="notif-settings__capability-row">
          <div class="notif-settings__capability-icon notif-settings__capability-icon--team">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="8" r="5"/>
              <path d="M20 21a8 8 0 1 0-16 0"/>
            </svg>
          </div>
          <div class="notif-settings__row-text">
            <span class="notif-settings__label">Team Huddles</span>
            <span class="notif-settings__desc">When multiple perspectives see something important</span>
          </div>
          <label class="notif-settings__toggle">
            <input type="checkbox" data-pref="teamHuddles" ${this.localPrefs.teamHuddles ? 'checked' : ''}>
            <span class="notif-settings__toggle-track" role="switch" tabindex="0"></span>
          </label>
        </div>
      </div>

      <!-- Quiet Hours: Guardian Respects Boundaries -->
      <div class="notif-settings__group" data-requires="enabled">
        <div class="notif-settings__section-header">
          <h3>Quiet Hours</h3>
        </div>
        <p class="notif-settings__group-desc">
          I respect your peace. Non-urgent messages wait until morning.
        </p>
        
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
        
        <div class="notif-settings__quiet-note">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14">
            <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
            <path d="M12 6v6l4 2"/>
          </svg>
          <span>If you're awake at 2am and reach out, I'm here with the same presence as noon.</span>
        </div>
      </div>

      <!-- Extended Reach Section -->
      <div class="notif-settings__group">
        <div class="notif-settings__section-header">
          <h3>Beyond the App</h3>
        </div>
        <p class="notif-settings__group-desc">
          When moments matter, I'll meet you where you are.
        </p>
        
        <div class="notif-settings__capability-row">
          <div class="notif-settings__capability-icon notif-settings__capability-icon--email">
            ${ICONS.mail}
          </div>
          <div class="notif-settings__row-text">
            <span class="notif-settings__label">Email Updates</span>
            <span class="notif-settings__desc">Milestone celebrations and weekly recaps</span>
          </div>
          <label class="notif-settings__toggle">
            <input type="checkbox" data-outreach="emailEnabled" ${this.outreachPrefs?.emailEnabled ? 'checked' : ''}>
            <span class="notif-settings__toggle-track" role="switch" tabindex="0"></span>
          </label>
        </div>

        <div class="notif-settings__capability-row">
          <div class="notif-settings__capability-icon notif-settings__capability-icon--sms">
            ${ICONS.message}
          </div>
          <div class="notif-settings__row-text">
            <span class="notif-settings__label">SMS Messages</span>
            <span class="notif-settings__desc">Quick check-ins when I notice something</span>
          </div>
          <label class="notif-settings__toggle">
            <input type="checkbox" data-outreach="smsEnabled" ${this.outreachPrefs?.smsEnabled ? 'checked' : ''}>
            <span class="notif-settings__toggle-track" role="switch" tabindex="0"></span>
          </label>
        </div>

        <div class="notif-settings__capability-row">
          <div class="notif-settings__capability-icon notif-settings__capability-icon--milestone">
            ${ICONS.sparkles}
          </div>
          <div class="notif-settings__row-text">
            <span class="notif-settings__label">Milestone Celebrations</span>
            <span class="notif-settings__desc">Big moments deserve recognition</span>
          </div>
          <label class="notif-settings__toggle">
            <input type="checkbox" data-outreach="milestoneNotifications" ${this.outreachPrefs?.milestoneNotifications ? 'checked' : ''}>
            <span class="notif-settings__toggle-track" role="switch" tabindex="0"></span>
          </label>
        </div>

        <div class="notif-settings__capability-row">
          <div class="notif-settings__capability-icon notif-settings__capability-icon--recap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>
            </svg>
          </div>
          <div class="notif-settings__row-text">
            <span class="notif-settings__label">Weekly Recap</span>
            <span class="notif-settings__desc">Reflect on our conversations and your growth</span>
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
      return this.renderUpcomingEmptyState();
    }

    const itemsHtml = this.upcomingItems.map((item) => this.renderUpcomingItem(item)).join('');

    return `
      <div class="notif-settings__upcoming-intro">
        <div class="notif-settings__upcoming-intro-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
          </svg>
        </div>
        <p>I'm watching out for you. Here's when I'll check in.</p>
      </div>
      <div class="notif-settings__upcoming-list">
        ${itemsHtml}
      </div>
    `;
  }

  /**
   * Better Than Human empty state for the Upcoming tab
   * Shows what proactive check-ins WILL look like with superhuman capabilities
   */
  private renderUpcomingEmptyState(): string {
    return `
      <div class="notif-settings__empty-hero">
        <!-- Animated Guardian Icon -->
        <div class="notif-settings__guardian-visual">
          <div class="notif-settings__guardian-ring notif-settings__guardian-ring--outer"></div>
          <div class="notif-settings__guardian-ring notif-settings__guardian-ring--inner"></div>
          <div class="notif-settings__guardian-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
              <circle cx="12" cy="10" r="2" fill="currentColor" stroke="none"/>
            </svg>
          </div>
        </div>

        <h3 class="notif-settings__empty-title">I'm learning when you need me</h3>
        <p class="notif-settings__empty-subtitle">
          The more we talk, the better I understand your rhythms, patterns, and needs.
        </p>
      </div>

      <!-- Preview Badge -->
      <div class="notif-settings__preview-badge">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12">
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        <span>What this will look like</span>
      </div>

      <!-- Sample Upcoming Check-ins Preview -->
      <div class="notif-settings__sample-checkins">
        <div class="notif-settings__sample-checkin" style="animation-delay: 100ms">
          <div class="notif-settings__sample-avatar notif-settings__sample-avatar--ferni">F</div>
          <div class="notif-settings__sample-content">
            <span class="notif-settings__sample-persona">Ferni</span>
            <span class="notif-settings__sample-time">Tomorrow at 8:15 AM</span>
            <p class="notif-settings__sample-preview">"You mentioned feeling overwhelmed yesterday. How are you holding up?"</p>
          </div>
          <div class="notif-settings__sample-reason">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
            </svg>
            Noticed concern
          </div>
        </div>

        <div class="notif-settings__sample-checkin" style="animation-delay: 200ms">
          <div class="notif-settings__sample-avatar notif-settings__sample-avatar--maya">M</div>
          <div class="notif-settings__sample-content">
            <span class="notif-settings__sample-persona">Maya</span>
            <span class="notif-settings__sample-time">Friday at 7:00 AM</span>
            <p class="notif-settings__sample-preview">"Your meditation streak is at 6 days! Ready for day 7?"</p>
          </div>
          <div class="notif-settings__sample-reason">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12">
              <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
            </svg>
            Streak support
          </div>
        </div>

        <div class="notif-settings__sample-checkin notif-settings__sample-checkin--watching" style="animation-delay: 300ms">
          <div class="notif-settings__sample-avatar notif-settings__sample-avatar--peter">P</div>
          <div class="notif-settings__sample-content">
            <span class="notif-settings__sample-persona">Peter</span>
            <span class="notif-settings__sample-time">Next Monday</span>
            <p class="notif-settings__sample-preview">"That big presentation is coming up. Want to prep together?"</p>
          </div>
          <div class="notif-settings__sample-reason">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12">
              <rect width="18" height="18" x="3" y="4" rx="2"/>
              <line x1="16" x2="16" y1="2" y2="6"/>
              <line x1="8" x2="8" y1="2" y2="6"/>
            </svg>
            Calendar aware
          </div>
        </div>
      </div>

      <!-- Four Superhuman Capabilities -->
      <div class="notif-settings__capabilities">
        <div class="notif-settings__capability" style="animation-delay: 150ms">
          <div class="notif-settings__capability-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
          </div>
          <span class="notif-settings__capability-name">Perfect Timing</span>
          <span class="notif-settings__capability-desc">I learn when you're most receptive</span>
        </div>

        <div class="notif-settings__capability" style="animation-delay: 250ms">
          <div class="notif-settings__capability-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </div>
          <span class="notif-settings__capability-name">Pattern Detection</span>
          <span class="notif-settings__capability-desc">I notice what you can't see</span>
        </div>

        <div class="notif-settings__capability" style="animation-delay: 350ms">
          <div class="notif-settings__capability-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
            </svg>
          </div>
          <span class="notif-settings__capability-name">Guardian Presence</span>
          <span class="notif-settings__capability-desc">Watching out for you 24/7</span>
        </div>

        <div class="notif-settings__capability" style="animation-delay: 450ms">
          <div class="notif-settings__capability-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </div>
          <span class="notif-settings__capability-name">No Agenda</span>
          <span class="notif-settings__capability-desc">Just checking because I care</span>
        </div>
      </div>

      <!-- Call to Action -->
      <div class="notif-settings__empty-cta">
        <p class="notif-settings__empty-cta-text">
          Keep talking with me. Every conversation helps me understand when and how to support you best.
        </p>
        <div class="notif-settings__empty-tip">
          ${ICONS.sparkles}
          <span>Enable "Ferni Check-ins" in Settings to unlock proactive support</span>
        </div>
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
      const response = await apiPost<{ success?: boolean }>('/api/outreach/reschedule', {
        triggerId: outreachId,
        newTime: choice,
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
          const timeParts = opt.time.split(':').map(Number);
          const h = timeParts[0] ?? 8;
          const m = timeParts[1] ?? 0;
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
      const response = await apiDelete<{ success?: boolean }>(`/api/outreach/pending/${outreachId}`);

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

      /* Hero Section */
      .notif-settings__hero {
        text-align: center;
        padding: var(--space-4, 16px) var(--space-2, 8px) var(--space-6, 24px);
        margin-bottom: var(--space-4, 16px);
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .notif-settings__hero-icon {
        width: 56px;
        height: 56px;
        margin: 0 auto var(--space-3, 12px);
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, var(--persona-tint, rgba(74, 103, 65, 0.12)), var(--persona-tint, rgba(74, 103, 65, 0.04)));
        border-radius: var(--radius-full);
        color: var(--persona-primary, #4a6741);
      }

      .notif-settings__hero-icon svg {
        width: 28px;
        height: 28px;
      }

      .notif-settings__hero-pulse {
        animation: heroPulse 2s ease-in-out infinite;
      }

      @keyframes heroPulse {
        0%, 100% { opacity: 0.4; transform: scale(1); }
        50% { opacity: 1; transform: scale(1.2); }
      }

      .notif-settings__hero-title {
        font-family: var(--font-display);
        font-size: var(--text-base, 1rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0 0 var(--space-2, 8px);
      }

      .notif-settings__hero-desc {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary);
        line-height: var(--leading-relaxed, 1.6);
        margin: 0;
        max-width: 280px;
        margin: 0 auto;
      }

      /* Section Headers */
      .notif-settings__section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--space-3, 12px);
      }

      .notif-settings__section-badge {
        display: inline-flex;
        align-items: center;
        gap: var(--space-1, 4px);
        padding: var(--space-1, 4px) var(--space-2, 8px);
        background: linear-gradient(135deg, var(--persona-tint, rgba(74, 103, 65, 0.15)), var(--persona-tint, rgba(74, 103, 65, 0.05)));
        border-radius: var(--radius-full);
        font-size: 10px;
        font-weight: var(--font-weight-semibold, 600);
        text-transform: uppercase;
        letter-spacing: var(--tracking-wider, 0.05em);
        color: var(--persona-primary, #4a6741);
      }

      /* Capability Rows */
      .notif-settings__capability-row {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--space-3, 12px) 0;
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .notif-settings__capability-row:last-child {
        border-bottom: none;
      }

      .notif-settings__capability-icon {
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--radius-lg, 12px);
        flex-shrink: 0;
      }

      .notif-settings__capability-icon svg {
        width: 18px;
        height: 18px;
      }

      .notif-settings__capability-icon--guardian {
        background: var(--persona-tint, rgba(74, 103, 65, 0.1));
        color: var(--persona-primary, #4a6741);
      }

      .notif-settings__capability-icon--ritual {
        background: rgba(166, 122, 106, 0.1);
        color: var(--persona-maya, #a67a6a);
      }

      .notif-settings__capability-icon--streak {
        background: rgba(196, 133, 106, 0.1);
        color: var(--persona-jordan, #c4856a);
      }

      .notif-settings__capability-icon--prediction {
        background: rgba(58, 107, 115, 0.1);
        color: var(--persona-peter, #3a6b73);
      }

      .notif-settings__capability-icon--team {
        background: rgba(90, 107, 138, 0.1);
        color: var(--persona-alex, #5a6b8a);
      }

      .notif-settings__capability-icon--email {
        background: rgba(90, 107, 138, 0.1);
        color: var(--persona-alex, #5a6b8a);
      }

      .notif-settings__capability-icon--sms {
        background: var(--persona-tint, rgba(74, 103, 65, 0.1));
        color: var(--persona-primary, #4a6741);
      }

      .notif-settings__capability-icon--milestone {
        background: rgba(184, 149, 106, 0.1);
        color: var(--persona-nayan, #b8956a);
      }

      .notif-settings__capability-icon--recap {
        background: rgba(58, 107, 115, 0.1);
        color: var(--persona-peter, #3a6b73);
      }

      /* Row with icon */
      .notif-settings__row-icon {
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--persona-tint, rgba(74, 103, 65, 0.1));
        border-radius: var(--radius-lg, 12px);
        color: var(--persona-primary, #4a6741);
        flex-shrink: 0;
      }

      .notif-settings__row-icon svg {
        width: 18px;
        height: 18px;
      }

      /* Quiet Hours Note */
      .notif-settings__quiet-note {
        display: flex;
        align-items: flex-start;
        gap: var(--space-2, 8px);
        padding: var(--space-3, 12px);
        background: var(--persona-tint, rgba(74, 103, 65, 0.05));
        border-radius: var(--radius-lg, 12px);
        margin-top: var(--space-4, 16px);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted);
        line-height: var(--leading-relaxed, 1.6);
        font-style: italic;
      }

      .notif-settings__quiet-note svg {
        color: var(--persona-primary, #4a6741);
        flex-shrink: 0;
        margin-top: 2px;
      }

      /* ====== UPCOMING TAB EMPTY STATE ====== */
      
      .notif-settings__empty-hero {
        text-align: center;
        padding: var(--space-4, 16px) 0 var(--space-6, 24px);
      }

      /* Guardian Visual Animation */
      .notif-settings__guardian-visual {
        position: relative;
        width: 80px;
        height: 80px;
        margin: 0 auto var(--space-4, 16px);
      }

      .notif-settings__guardian-ring {
        position: absolute;
        border-radius: 50%;
        border: 2px solid var(--persona-primary, #4a6741);
      }

      .notif-settings__guardian-ring--outer {
        inset: 0;
        opacity: 0.15;
        animation: guardianPulseOuter 3s ease-in-out infinite;
      }

      .notif-settings__guardian-ring--inner {
        inset: 12px;
        opacity: 0.25;
        animation: guardianPulseInner 3s ease-in-out infinite 0.3s;
      }

      @keyframes guardianPulseOuter {
        0%, 100% { transform: scale(1); opacity: 0.15; }
        50% { transform: scale(1.1); opacity: 0.25; }
      }

      @keyframes guardianPulseInner {
        0%, 100% { transform: scale(1); opacity: 0.25; }
        50% { transform: scale(1.05); opacity: 0.4; }
      }

      .notif-settings__guardian-icon {
        position: absolute;
        inset: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, var(--persona-tint, rgba(74, 103, 65, 0.15)), var(--persona-tint, rgba(74, 103, 65, 0.05)));
        border-radius: 50%;
        color: var(--persona-primary, #4a6741);
      }

      .notif-settings__guardian-icon svg {
        width: 24px;
        height: 24px;
      }

      .notif-settings__empty-title {
        font-family: var(--font-display);
        font-size: var(--text-lg, 1.125rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0 0 var(--space-2, 8px);
      }

      .notif-settings__empty-subtitle {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary);
        line-height: var(--leading-relaxed, 1.6);
        margin: 0;
        max-width: 280px;
        margin: 0 auto;
      }

      /* Preview Badge */
      .notif-settings__preview-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-1, 4px);
        padding: var(--space-1, 4px) var(--space-3, 12px);
        background: var(--persona-tint, rgba(74, 103, 65, 0.1));
        border-radius: var(--radius-full);
        margin: var(--space-4, 16px) auto;
        color: var(--persona-primary, #4a6741);
        font-size: 10px;
        font-weight: var(--font-weight-semibold, 600);
        text-transform: uppercase;
        letter-spacing: var(--tracking-wider, 0.05em);
      }

      /* Sample Check-ins */
      .notif-settings__sample-checkins {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
        margin-bottom: var(--space-6, 24px);
        position: relative;
      }

      .notif-settings__sample-checkins::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 40px;
        background: linear-gradient(to bottom, transparent, var(--color-bg-elevated, #FFFDFB));
        pointer-events: none;
        border-radius: 0 0 var(--radius-lg, 12px) var(--radius-lg, 12px);
      }

      .notif-settings__sample-checkin {
        display: flex;
        align-items: flex-start;
        gap: var(--space-3, 12px);
        padding: var(--space-3, 12px);
        background: var(--color-background-secondary, #f5f2ed);
        border-radius: var(--radius-lg, 12px);
        opacity: 0;
        transform: translateY(8px);
        animation: sampleCheckinSlide ${DURATION.MODERATE}ms ${EASING.SPRING} forwards;
      }

      @keyframes sampleCheckinSlide {
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .notif-settings__sample-checkin--watching {
        opacity: 0.7;
      }

      .notif-settings__sample-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-weight-semibold, 600);
        color: white;
        flex-shrink: 0;
      }

      .notif-settings__sample-avatar--ferni { background: var(--persona-primary, #4a6741); }
      .notif-settings__sample-avatar--maya { background: var(--persona-maya, #a67a6a); }
      .notif-settings__sample-avatar--peter { background: var(--persona-peter, #3a6b73); }
      .notif-settings__sample-avatar--alex { background: var(--persona-alex, #5a6b8a); }
      .notif-settings__sample-avatar--jordan { background: var(--persona-jordan, #c4856a); }
      .notif-settings__sample-avatar--nayan { background: var(--persona-nayan, #b8956a); }

      .notif-settings__sample-content {
        flex: 1;
        min-width: 0;
      }

      .notif-settings__sample-persona {
        display: block;
        font-family: var(--font-display);
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
      }

      .notif-settings__sample-time {
        font-size: 10px;
        color: var(--color-text-muted);
      }

      .notif-settings__sample-preview {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary);
        font-style: italic;
        margin: var(--space-1, 4px) 0 0;
        line-height: var(--leading-snug, 1.375);
      }

      .notif-settings__sample-reason {
        display: flex;
        align-items: center;
        gap: var(--space-1, 4px);
        font-size: 9px;
        font-weight: var(--font-weight-medium, 500);
        text-transform: uppercase;
        letter-spacing: var(--tracking-wide, 0.025em);
        color: var(--persona-primary, #4a6741);
        flex-shrink: 0;
        padding: var(--space-1, 4px) var(--space-2, 8px);
        background: var(--persona-tint, rgba(74, 103, 65, 0.1));
        border-radius: var(--radius-sm, 6px);
      }

      /* Superhuman Capabilities Grid */
      .notif-settings__capabilities {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--space-2, 8px);
        margin-bottom: var(--space-6, 24px);
      }

      .notif-settings__capability {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: var(--space-3, 12px);
        background: var(--color-background-secondary, #f5f2ed);
        border-radius: var(--radius-lg, 12px);
        opacity: 0;
        transform: translateY(8px);
        animation: capabilitySlide ${DURATION.MODERATE}ms ${EASING.SPRING} forwards;
      }

      @keyframes capabilitySlide {
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .notif-settings__capability-badge {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--persona-tint, rgba(74, 103, 65, 0.15));
        border-radius: var(--radius-full);
        color: var(--persona-primary, #4a6741);
        margin-bottom: var(--space-2, 8px);
      }

      .notif-settings__capability-badge svg {
        width: 16px;
        height: 16px;
      }

      .notif-settings__capability-name {
        font-family: var(--font-display);
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin-bottom: var(--space-1, 4px);
      }

      .notif-settings__capability-desc {
        font-size: 10px;
        color: var(--color-text-muted);
        line-height: var(--leading-snug, 1.375);
      }

      /* Empty State CTA */
      .notif-settings__empty-cta {
        text-align: center;
      }

      .notif-settings__empty-cta-text {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary);
        line-height: var(--leading-relaxed, 1.6);
        margin: 0 0 var(--space-4, 16px);
        max-width: 280px;
        margin-left: auto;
        margin-right: auto;
      }

      .notif-settings__empty-tip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2, 8px);
        padding: var(--space-3, 12px) var(--space-4, 16px);
        background: var(--color-background-secondary, #f5f2ed);
        border-radius: var(--radius-lg, 12px);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-secondary);
      }

      .notif-settings__empty-tip svg {
        width: 16px;
        height: 16px;
        color: var(--persona-primary, #4a6741);
        flex-shrink: 0;
      }

      /* Upcoming Intro Enhancement */
      .notif-settings__upcoming-intro-icon {
        width: 40px;
        height: 40px;
        margin: 0 auto var(--space-2, 8px);
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--persona-tint, rgba(74, 103, 65, 0.1));
        border-radius: var(--radius-full);
        color: var(--persona-primary, #4a6741);
      }

      .notif-settings__upcoming-intro-icon svg {
        width: 20px;
        height: 20px;
      }

      .notif-settings__upcoming-intro {
        text-align: center;
        margin-bottom: var(--space-4, 16px);
      }

      .notif-settings__upcoming-intro p {
        font-family: var(--font-body);
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        margin: 0;
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

      /* Dark theme - New Better Than Human elements */
      [data-theme="midnight"] .notif-settings__hero-icon {
        background: linear-gradient(135deg, var(--persona-tint-dark, rgba(140, 179, 128, 0.2)), var(--persona-tint-dark, rgba(140, 179, 128, 0.08)));
        color: var(--persona-primary-dark, #8cb380);
      }
      [data-theme="midnight"] .notif-settings__hero-title,
      [data-theme="midnight"] .notif-settings__empty-title,
      [data-theme="midnight"] .notif-settings__sample-persona,
      [data-theme="midnight"] .notif-settings__capability-name { color: var(--color-text-primary, #faf6f0); }
      [data-theme="midnight"] .notif-settings__hero-desc,
      [data-theme="midnight"] .notif-settings__empty-subtitle,
      [data-theme="midnight"] .notif-settings__empty-cta-text,
      [data-theme="midnight"] .notif-settings__sample-preview { color: var(--color-text-secondary, #f0ebe4); }
      [data-theme="midnight"] .notif-settings__section-badge {
        background: linear-gradient(135deg, var(--persona-tint-dark, rgba(140, 179, 128, 0.25)), var(--persona-tint-dark, rgba(140, 179, 128, 0.1)));
        color: var(--persona-primary-dark, #8cb380);
      }
      [data-theme="midnight"] .notif-settings__capability-icon {
        background: var(--color-background-tertiary, #685852);
      }
      [data-theme="midnight"] .notif-settings__capability-icon--guardian { color: var(--persona-primary-dark, #8cb380); }
      [data-theme="midnight"] .notif-settings__capability-icon--ritual { color: #c9a99a; }
      [data-theme="midnight"] .notif-settings__capability-icon--streak { color: #daa88a; }
      [data-theme="midnight"] .notif-settings__capability-icon--prediction { color: #6a9ba3; }
      [data-theme="midnight"] .notif-settings__capability-icon--team { color: #8a9bba; }
      [data-theme="midnight"] .notif-settings__row-icon {
        background: var(--color-background-tertiary, #685852);
        color: var(--persona-primary-dark, #8cb380);
      }
      [data-theme="midnight"] .notif-settings__quiet-note {
        background: var(--color-background-secondary, #60504a);
      }
      [data-theme="midnight"] .notif-settings__quiet-note svg { color: var(--persona-primary-dark, #8cb380); }
      [data-theme="midnight"] .notif-settings__guardian-ring { border-color: var(--persona-primary-dark, #8cb380); }
      [data-theme="midnight"] .notif-settings__guardian-icon {
        background: linear-gradient(135deg, var(--persona-tint-dark, rgba(140, 179, 128, 0.25)), var(--persona-tint-dark, rgba(140, 179, 128, 0.1)));
        color: var(--persona-primary-dark, #8cb380);
      }
      [data-theme="midnight"] .notif-settings__preview-badge {
        background: var(--persona-tint-dark, rgba(140, 179, 128, 0.2));
        color: var(--persona-primary-dark, #8cb380);
      }
      [data-theme="midnight"] .notif-settings__sample-checkin {
        background: var(--color-background-secondary, #60504a);
      }
      [data-theme="midnight"] .notif-settings__sample-checkins::after {
        background: linear-gradient(to bottom, transparent, var(--color-background-elevated, #70605a));
      }
      [data-theme="midnight"] .notif-settings__sample-reason {
        background: var(--persona-tint-dark, rgba(140, 179, 128, 0.15));
        color: var(--persona-primary-dark, #8cb380);
      }
      [data-theme="midnight"] .notif-settings__capability {
        background: var(--color-background-secondary, #60504a);
      }
      [data-theme="midnight"] .notif-settings__capability-badge {
        background: var(--persona-tint-dark, rgba(140, 179, 128, 0.2));
        color: var(--persona-primary-dark, #8cb380);
      }
      [data-theme="midnight"] .notif-settings__upcoming-intro-icon {
        background: var(--persona-tint-dark, rgba(140, 179, 128, 0.2));
        color: var(--persona-primary-dark, #8cb380);
      }

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
