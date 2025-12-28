/**
 * Calendar View UI
 *
 * Visual calendar component showing the user's schedule.
 * Displays today's events, week view, and upcoming meetings.
 *
 * DESIGN PRINCIPLES:
 *   - Centered floating modal (brand-compliant)
 *   - Clean, scannable event list
 *   - Today/Week toggle
 *   - Quick actions (voice "Tell me more")
 *   - Empty state encourages connection
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { apiGet } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('CalendarViewUI');

// ============================================================================
// ANALYTICS TYPES (consolidated from calendar-analytics.ui.ts)
// ============================================================================

export interface CalendarLoadFactors {
  weeklyMeetingHours: number;
  weeklyFocusTimeRatio: number;
  weeklyBackToBackPercentage: number;
  consecutiveOverloadedDays: number;
  consecutiveMeetingStreak: number;
  heaviestDayThisWeek: string | null;
  lightestDayThisWeek: string | null;
}

export interface DailyLoadTrend {
  date: string;
  dayName: string;
  meetingHours: number;
  focusHours: number;
  meetingCount: number;
  isOverloaded: boolean;
}

export interface RecoveryInsight {
  urgency: 'low' | 'moderate' | 'high' | 'immediate';
  message: string;
  suggestedAction?: string;
}

export interface CalendarPattern {
  type: 'peak-hours' | 'busiest-day' | 'focus-deficit' | 'back-to-back' | 'meeting-marathon';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface CalendarAnalyticsData {
  // Current load summary
  loadFactors: CalendarLoadFactors;
  
  // Weekly trends (last 7 days)
  dailyTrends: DailyLoadTrend[];
  
  // Insights
  recoveryInsight: RecoveryInsight | null;
  patterns: CalendarPattern[];
  
  // Comparisons
  weekOverWeekChange: {
    meetingHoursChange: number; // percentage
    focusTimeChange: number; // percentage
  };
  
  // Best practices
  healthScore: number; // 0-100
  recommendations: string[];
}

// ============================================================================
// TYPES
// ============================================================================

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  location?: string;
  isAllDay: boolean;
  status: 'confirmed' | 'tentative' | 'cancelled';
}

export interface DayOverview {
  date: string;
  events: CalendarEvent[];
  totalMeetings: number;
  totalMeetingMinutes: number;
  freeTimeMinutes: number;
  isOverloaded: boolean;
  hasBackToBack: boolean;
}

export interface WeekOverview {
  days: DayOverview[];
  totalMeetings: number;
  busiestDay: { day: string; meetings: number } | null;
  lightestDay: { day: string; meetings: number } | null;
}

export interface CalendarViewCallbacks {
  onClose?: () => void;
  onEventClick?: (eventId: string) => void;
  onAddEvent?: () => void;
  onConnectCalendar?: () => void;
}

type ViewMode = 'today' | 'week' | 'month' | 'insights';

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
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>`,
  mapPin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>`,
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>`,
  alertTriangle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>`,
  sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2v2"/>
    <path d="M12 20v2"/>
    <path d="m4.93 4.93 1.41 1.41"/>
    <path d="m17.66 17.66 1.41 1.41"/>
    <path d="M2 12h2"/>
    <path d="M20 12h2"/>
    <path d="m6.34 17.66-1.41 1.41"/>
    <path d="m19.07 4.93-1.41 1.41"/>
  </svg>`,
  chevronLeft: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m15 18-6-6 6-6"/>
  </svg>`,
  chevronRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m9 18 6-6-6-6"/>
  </svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>`,
  chart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/>
  </svg>`,
  target: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <circle cx="12" cy="12" r="6"/>
    <circle cx="12" cy="12" r="2"/>
  </svg>`,
  zap: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>`,
};

// ============================================================================
// CALENDAR VIEW UI CLASS
// ============================================================================

class CalendarViewUI {
  private panel: HTMLElement | null = null;
  private wrapper: HTMLElement | null = null;
  private callbacks: CalendarViewCallbacks = {};
  private styleElement: HTMLStyleElement | null = null;
  private isVisible = false;
  private isLoading = false;
  private isConnected = false;
  private showExternalEvents = true; // Toggle for showing external calendar events
  private viewMode: ViewMode = 'month'; // Default to month view for Ferni Calendar
  private todayData: DayOverview | null = null;
  private weekData: WeekOverview | null = null;
  private currentDate: Date = new Date();
  private analyticsData: CalendarAnalyticsData | null = null;
  private isLoadingAnalytics = false;

  /**
   * Initialize the calendar view
   */
  initialize(): void {
    if (this.panel) return;

    // HMR protection
    document.querySelectorAll('.calendar-view').forEach((el) => el.remove());

    this.injectStyles();
    this.createPanel();
  }

  /**
   * Set callbacks
   */
  setCallbacks(callbacks: CalendarViewCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Show the calendar view
   */
  async show(): Promise<void> {
    this.initialize();
    if (!this.panel || !this.wrapper) return;

    this.renderLoading();
    this.panel.classList.add('calendar-view--visible');
    this.isVisible = true;

    // Check connection and load data
    await this.loadCalendarData();
  }

  /**
   * Hide the calendar view
   */
  hide(): void {
    if (!this.panel) return;

    this.panel.classList.remove('calendar-view--visible');
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

  /**
   * Refresh calendar data
   */
  async refresh(): Promise<void> {
    if (!this.isVisible) return;
    await this.loadCalendarData();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private createPanel(): void {
    this.panel = document.createElement('div');
    this.panel.className = 'calendar-view';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-modal', 'true');
    this.panel.setAttribute('aria-labelledby', 'calendar-view-title');

    this.panel.innerHTML = `
      <div class="calendar-view__backdrop"></div>
      <div class="calendar-view__wrapper">
        <div class="calendar-view__content"></div>
      </div>
    `;

    this.wrapper = this.panel.querySelector('.calendar-view__content');

    // Close on backdrop click
    const backdrop = this.panel.querySelector('.calendar-view__backdrop');
    backdrop?.addEventListener('click', () => this.hide());

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });

    document.body.appendChild(this.panel);
  }

  private async loadCalendarData(): Promise<void> {
    this.isLoading = true;
    this.renderLoading();

    try {
      // Check if Google Calendar is connected (for showing sync status in UI)
      const statusRes = await apiGet<{ linked?: boolean }>('/auth/google/status');
      this.isConnected = statusRes?.data?.linked === true;

      // ALWAYS load calendar data - Ferni Calendar is always available!
      // The backend returns Ferni Calendar data (with Google overlay if connected)
      const todayRes = await apiGet<{ overview?: DayOverview; connected?: boolean }>('/api/calendar/today');
      if (todayRes?.data?.overview) {
        this.todayData = todayRes.data.overview;
      }

      // Load week data from Ferni Calendar (+ Google overlay if connected)
      const weekRes = await apiGet<{ overview?: WeekOverview; connected?: boolean }>('/api/calendar/week');
      if (weekRes?.data?.overview) {
        this.weekData = weekRes.data.overview;
      }

      // Always render the calendar (Ferni Calendar works without external connection)
      this.renderContent();
    } catch (error) {
      log.error('Failed to load calendar data', error);
      // Still render the calendar even on error - Ferni Calendar works offline
      this.renderContent();
    } finally {
      this.isLoading = false;
    }
  }

  private renderLoading(): void {
    if (!this.wrapper) return;

    this.wrapper.innerHTML = `
      <header class="calendar-view__header">
        <div class="calendar-view__icon">${ICONS.calendar}</div>
        <h2 class="calendar-view__title" id="calendar-view-title">Your Schedule</h2>
        <button class="calendar-view__close" aria-label="${t('common.close')}">
          ${ICONS.close}
        </button>
      </header>
      <div class="calendar-view__loading">
        <div class="calendar-view__spinner"></div>
        <p>Loading your schedule...</p>
      </div>
    `;

    this.bindCloseButton();
  }

  private renderDisconnected(): void {
    if (!this.wrapper) return;

    this.wrapper.innerHTML = `
      <header class="calendar-view__header">
        <div class="calendar-view__icon">${ICONS.calendar}</div>
        <h2 class="calendar-view__title" id="calendar-view-title">Your Schedule</h2>
        <button class="calendar-view__close" aria-label="${t('common.close')}">
          ${ICONS.close}
        </button>
      </header>
      <div class="calendar-view__disconnected">
        <div class="calendar-view__disconnected-icon">${ICONS.calendar}</div>
        <h3>Connect Your Calendar</h3>
        <p>See your schedule at a glance and let Alex help manage your time.</p>
        
        <div class="calendar-view__providers">
          <button aria-label="Google Calendar" class="calendar-view__provider-btn" data-action="connect-google">
            <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            <span>Google Calendar</span>
          </button>
          
          <button aria-label="Apple Calendar" class="calendar-view__provider-btn" data-action="connect-apple">
            <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#555" d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
            <span>Apple Calendar</span>
          </button>
          
          <button aria-label="Outlook" class="calendar-view__provider-btn" data-action="connect-outlook">
            <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#0078d4" d="M7.88 12.04q0 .45-.11.87-.1.41-.33.74-.22.33-.58.52-.37.2-.87.2t-.85-.2q-.35-.21-.57-.55-.22-.33-.33-.75-.1-.42-.1-.86t.1-.87q.1-.43.34-.76.22-.34.59-.54.36-.2.87-.2t.86.2q.35.21.57.55.22.34.31.77.1.43.1.88zM24 12v9.38q0 .46-.33.8-.33.32-.8.32H7.13q-.46 0-.8-.33-.32-.33-.32-.8V18H1q-.41 0-.7-.3-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h6.13V2.55q0-.44.3-.75.3-.3.7-.3H22.88q.46 0 .79.33.33.34.33.8z"/></svg>
            <span>Outlook</span>
          </button>
        </div>
        
        <button aria-label="Settings" class="calendar-view__settings-link" data-action="open-settings">
          ${ICONS.settings}
          <span>Calendar Settings</span>
        </button>
      </div>
    `;

    this.bindCloseButton();
    this.bindActions();
  }

  private renderContent(): void {
    if (!this.wrapper) return;

    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    this.wrapper.innerHTML = `
      <header class="calendar-view__header">
        <div class="calendar-view__icon">${ICONS.calendar}</div>
        <div class="calendar-view__header-content">
          <h2 class="calendar-view__title" id="calendar-view-title">Your Schedule</h2>
          <p class="calendar-view__date">${dateStr}</p>
        </div>
        <button class="calendar-view__close" aria-label="${t('common.close')}">
          ${ICONS.close}
        </button>
      </header>

      <div class="calendar-view__tabs">
        <button aria-label="Today" class="calendar-view__tab ${this.viewMode === 'today' ? 'calendar-view__tab--active' : ''}" data-view="today">
          ${ICONS.sun}
          Today
        </button>
        <button aria-label="Week" class="calendar-view__tab ${this.viewMode === 'week' ? 'calendar-view__tab--active' : ''}" data-view="week">
          ${ICONS.clock}
          Week
        </button>
        <button aria-label="Month" class="calendar-view__tab ${this.viewMode === 'month' ? 'calendar-view__tab--active' : ''}" data-view="month">
          ${ICONS.calendar}
          Month
        </button>
        <button aria-label="Insights" class="calendar-view__tab ${this.viewMode === 'insights' ? 'calendar-view__tab--active' : ''}" data-view="insights">
          ${ICONS.chart}
          Insights
        </button>
      </div>

      <div class="calendar-view__body">
        ${this.renderViewContent()}
      </div>

      ${this.renderSyncStatus()}

      <footer class="calendar-view__footer">
        <p class="calendar-view__footer-hint">Say "Alex, schedule a meeting" to add events</p>
      </footer>
    `;

    this.bindCloseButton();
    this.bindTabs();
    this.bindActions();
    this.bindSyncToggle();
  }

  /**
   * Render the sync status bar showing external calendar connection
   */
  private renderSyncStatus(): string {
    if (this.isConnected) {
      return `
        <div class="calendar-view__sync-status calendar-view__sync-status--connected">
          <div class="calendar-view__sync-info">
            <span class="calendar-view__sync-dot"></span>
            <span>Google Calendar synced</span>
          </div>
          <label class="calendar-view__sync-toggle">
            <input type="checkbox" ${this.showExternalEvents ? 'checked' : ''} data-action="toggle-external">
            <span>Show events</span>
          </label>
        </div>
      `;
    }

    return `
      <div class="calendar-view__sync-status">
        <div class="calendar-view__sync-info">
          <span class="calendar-view__sync-hint">Sync your calendar to see events</span>
        </div>
        <button aria-label="Connect" class="calendar-view__sync-btn" data-action="connect-google">
          ${ICONS.link}
          <span>Connect</span>
        </button>
      </div>
    `;
  }

  /**
   * Bind the sync toggle checkbox
   */
  private bindSyncToggle(): void {
    const toggle = this.wrapper?.querySelector('[data-action="toggle-external"]') as HTMLInputElement;
    if (toggle) {
      toggle.addEventListener('change', () => {
        this.showExternalEvents = toggle.checked;
        this.loadCalendarData();
      });
    }
  }

  private renderTodayView(): string {
    if (!this.todayData) {
      return this.renderEmptyState('No events today');
    }

    const events = this.todayData.events || [];

    if (events.length === 0) {
      return `
        <div class="calendar-view__summary calendar-view__summary--clear">
          <div class="calendar-view__summary-icon">${ICONS.sun}</div>
          <div class="calendar-view__summary-text">
            <strong>Clear day ahead</strong>
            <span>No meetings scheduled</span>
          </div>
        </div>
        ${this.renderEmptyState('Your calendar is open')}
      `;
    }

    // Show summary
    const summaryClass = this.todayData.isOverloaded ? 'calendar-view__summary--busy' : '';
    const summaryIcon = this.todayData.isOverloaded ? ICONS.alertTriangle : ICONS.clock;
    const summaryText = this.todayData.isOverloaded
      ? `Heavy day: ${this.todayData.totalMeetings} meetings`
      : `${this.todayData.totalMeetings} meeting${this.todayData.totalMeetings !== 1 ? 's' : ''} today`;

    const freeHours = Math.round(this.todayData.freeTimeMinutes / 60);
    const freeText = freeHours > 0 ? `${freeHours}h free time` : 'Back-to-back meetings';

    return `
      <div class="calendar-view__summary ${summaryClass}">
        <div class="calendar-view__summary-icon">${summaryIcon}</div>
        <div class="calendar-view__summary-text">
          <strong>${summaryText}</strong>
          <span>${freeText}</span>
        </div>
      </div>

      <div class="calendar-view__events">
        ${events.map((event) => this.renderEvent(event)).join('')}
      </div>
    `;
  }

  private renderWeekView(): string {
    if (!this.weekData?.days) {
      return this.renderEmptyState('No events this week');
    }

    const days = this.weekData.days;
    const totalMeetings = this.weekData.totalMeetings || 0;

    if (totalMeetings === 0) {
      return this.renderEmptyState('Your week is open');
    }

    // Summary
    const busiestDay = this.weekData.busiestDay;
    const summaryText = busiestDay
      ? `${totalMeetings} meetings this week. ${busiestDay.day} is busiest.`
      : `${totalMeetings} meetings this week`;

    return `
      <div class="calendar-view__summary">
        <div class="calendar-view__summary-icon">${ICONS.calendar}</div>
        <div class="calendar-view__summary-text">
          <strong>Week Overview</strong>
          <span>${summaryText}</span>
        </div>
      </div>

      <div class="calendar-view__week">
        ${days.map((day) => this.renderDayCard(day)).join('')}
      </div>
    `;
  }

  /**
   * Render the content based on current view mode
   */
  private renderViewContent(): string {
    switch (this.viewMode) {
      case 'today':
        return this.renderTodayView();
      case 'week':
        return this.renderWeekView();
      case 'month':
        return this.renderMonthView();
      case 'insights':
        return this.renderInsightsView();
      default:
        return this.renderTodayView();
    }
  }

  /**
   * Render a full month calendar grid
   */
  private renderMonthView(): string {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    
    // Get month name and year for header
    const monthName = this.currentDate.toLocaleDateString('en-US', { month: 'long' });
    
    // Get first day of month and total days
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay(); // 0 = Sunday
    
    // Get today for highlighting
    const today = new Date();
    const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;
    const todayDate = today.getDate();
    
    // Build calendar grid
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    // Get events for this month from weekData or fetch
    const monthEvents = this.getMonthEvents(year, month);
    
    // Build grid cells
    let gridCells = '';
    let dayCount = 1;
    
    // We need 6 rows to accommodate all possible month layouts
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 7; col++) {
        const cellIndex = row * 7 + col;
        
        if (cellIndex < startingDay || dayCount > daysInMonth) {
          // Empty cell (before first day or after last day)
          gridCells += `<div class="calendar-view__grid-cell calendar-view__grid-cell--empty"></div>`;
        } else {
          const isToday = isCurrentMonth && dayCount === todayDate;
          const dayEvents = monthEvents.filter(e => {
            const eventDate = new Date(e.startTime);
            return eventDate.getDate() === dayCount;
          });
          const hasEvents = dayEvents.length > 0;
          
          const cellClasses = [
            'calendar-view__grid-cell',
            isToday ? 'calendar-view__grid-cell--today' : '',
            hasEvents ? 'calendar-view__grid-cell--has-events' : '',
          ].filter(Boolean).join(' ');
          
          gridCells += `
            <div class="${cellClasses}" data-date="${year}-${String(month + 1).padStart(2, '0')}-${String(dayCount).padStart(2, '0')}">
              <span class="calendar-view__grid-day">${dayCount}</span>
              ${hasEvents ? `<span class="calendar-view__grid-dot"></span>` : ''}
            </div>
          `;
          dayCount++;
        }
      }
      
      // Stop if we've placed all days
      if (dayCount > daysInMonth) break;
    }
    
    return `
      <div class="calendar-view__month">
        <div class="calendar-view__month-nav">
          <button aria-label="Go back" class="calendar-view__month-btn" data-action="prev-month">
            ${ICONS.chevronLeft}
          </button>
          <div class="calendar-view__month-label">
            <span class="calendar-view__month-name">${monthName}</span>
            <span class="calendar-view__month-year">${year}</span>
          </div>
          <button aria-label="Go forward" class="calendar-view__month-btn" data-action="next-month">
            ${ICONS.chevronRight}
          </button>
        </div>
        
        <div class="calendar-view__grid-header">
          ${dayNames.map(d => `<div class="calendar-view__grid-header-cell">${d}</div>`).join('')}
        </div>
        
        <div class="calendar-view__grid">
          ${gridCells}
        </div>
        
        <div class="calendar-view__month-footer">
          <button aria-label="Today" class="calendar-view__today-btn" data-action="go-today">
            Today
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Render the insights view with calendar analytics
   */
  private renderInsightsView(): string {
    if (this.isLoadingAnalytics) {
      return `
        <div class="calendar-view__insights-loading">
          <div class="calendar-view__spinner"></div>
          <p>Analyzing your calendar...</p>
        </div>
      `;
    }

    if (!this.analyticsData) {
      return `
        <div class="calendar-view__empty">
          <div class="calendar-view__empty-icon">${ICONS.chart}</div>
          <p>Connect your calendar to see insights</p>
        </div>
      `;
    }

    const { healthScore, loadFactors, dailyTrends, patterns, recoveryInsight, weekOverWeekChange, recommendations } = this.analyticsData;
    
    // Health score visualization
    const circumference = 2 * Math.PI * 32;
    const offset = circumference - (healthScore / 100) * circumference;
    let scoreClass = '';
    let insight = recommendations[0] || 'Your calendar looks balanced.';
    
    if (healthScore < 40) {
      scoreClass = 'critical';
      insight = recommendations[0] || 'Your calendar needs attention.';
    } else if (healthScore < 70) {
      scoreClass = 'warning';
      insight = recommendations[0] || 'Some adjustments could help.';
    }

    const focusPercent = Math.round((loadFactors?.weeklyFocusTimeRatio || 0) * 100);
    const backToBackPercent = Math.round(loadFactors?.weeklyBackToBackPercentage || 0);
    const meetingTrend = weekOverWeekChange?.meetingHoursChange || 0;

    // Weekly chart bars
    const maxHours = Math.max(...(dailyTrends || []).map(d => d.meetingHours), 8);
    const chartBars = (dailyTrends || []).map(day => {
      const heightPercent = (day.meetingHours / maxHours) * 100;
      return `
        <div class="calendar-view__chart-bar-container">
          <div class="calendar-view__chart-bar-track">
            <div 
              class="calendar-view__chart-bar ${day.isOverloaded ? 'overloaded' : ''}" 
              style="height: ${heightPercent}%"
              title="${day.meetingHours}h meetings"
            ></div>
          </div>
          <span class="calendar-view__chart-bar-label">${day.dayName.slice(0, 3)}</span>
        </div>
      `;
    }).join('');

    // Patterns
    const patternCards = (patterns || []).map(pattern => `
      <div class="calendar-view__pattern-card ${pattern.severity}">
        <div class="calendar-view__pattern-content">
          <div class="calendar-view__pattern-title">${pattern.title}</div>
          <div class="calendar-view__pattern-description">${pattern.description}</div>
        </div>
      </div>
    `).join('');

    return `
      <div class="calendar-view__insights">
        <!-- Health Score -->
        <div class="calendar-view__health-score">
          <div class="calendar-view__health-score-circle">
            <svg viewBox="0 0 80 80" width="80" height="80">
              <circle class="calendar-view__health-score-bg" cx="40" cy="40" r="32"/>
              <circle 
                class="calendar-view__health-score-fill ${scoreClass}" 
                cx="40" cy="40" r="32"
                stroke-dasharray="${circumference}"
                stroke-dashoffset="${offset}"
              />
            </svg>
            <span class="calendar-view__health-score-value">${healthScore}</span>
          </div>
          <div class="calendar-view__health-score-details">
            <div class="calendar-view__health-score-label">Calendar Health</div>
            <div class="calendar-view__health-score-insight">${insight}</div>
          </div>
        </div>

        <!-- Metrics Grid -->
        <div class="calendar-view__metrics-grid">
          <div class="calendar-view__metric-card">
            <div class="calendar-view__metric-icon">${ICONS.clock}</div>
            <div class="calendar-view__metric-value">${Math.round(loadFactors?.weeklyMeetingHours || 0)}h</div>
            <div class="calendar-view__metric-label">Meeting Hours</div>
            ${meetingTrend !== 0 ? `<div class="calendar-view__metric-trend ${meetingTrend < 0 ? 'positive' : 'negative'}">${meetingTrend > 0 ? '+' : ''}${meetingTrend}%</div>` : ''}
          </div>
          
          <div class="calendar-view__metric-card">
            <div class="calendar-view__metric-icon">${ICONS.target}</div>
            <div class="calendar-view__metric-value">${focusPercent}%</div>
            <div class="calendar-view__metric-label">Focus Time</div>
          </div>
          
          <div class="calendar-view__metric-card">
            <div class="calendar-view__metric-icon">${ICONS.zap}</div>
            <div class="calendar-view__metric-value">${backToBackPercent}%</div>
            <div class="calendar-view__metric-label">Back-to-Back</div>
          </div>
          
          <div class="calendar-view__metric-card">
            <div class="calendar-view__metric-icon">${ICONS.calendar}</div>
            <div class="calendar-view__metric-value">${loadFactors?.lightestDayThisWeek || '-'}</div>
            <div class="calendar-view__metric-label">Lightest Day</div>
          </div>
        </div>

        <!-- Weekly Chart -->
        ${dailyTrends && dailyTrends.length > 0 ? `
          <div class="calendar-view__weekly-chart">
            <div class="calendar-view__weekly-chart-title">Weekly Meeting Load</div>
            <div class="calendar-view__chart-bars">
              ${chartBars}
            </div>
          </div>
        ` : ''}

        <!-- Patterns -->
        ${patterns && patterns.length > 0 ? `
          <div class="calendar-view__patterns-section">
            ${patternCards}
          </div>
        ` : ''}

        <!-- Recovery Action -->
        ${recoveryInsight && recoveryInsight.urgency !== 'low' ? `
          <div class="calendar-view__recovery-action" role="button" tabindex="0">
            <div class="calendar-view__recovery-info">
              <div class="calendar-view__recovery-icon">${ICONS.heart}</div>
              <div class="calendar-view__recovery-text">
                <h4>Recovery Recommended</h4>
                <p>${recoveryInsight.message}</p>
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Get events for a specific month
   */
  private getMonthEvents(year: number, month: number): CalendarEvent[] {
    const events: CalendarEvent[] = [];
    
    // Collect events from todayData
    if (this.todayData?.events) {
      events.push(...this.todayData.events);
    }
    
    // Collect events from weekData
    if (this.weekData?.days) {
      for (const day of this.weekData.days) {
        if (day.events) {
          events.push(...day.events);
        }
      }
    }
    
    // Filter to only events in this month
    return events.filter(e => {
      const date = new Date(e.startTime);
      return date.getMonth() === month && date.getFullYear() === year;
    });
  }

  /**
   * Navigate to previous month
   */
  private prevMonth(): void {
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() - 1, 1);
    this.renderContent();
  }

  /**
   * Navigate to next month
   */
  private nextMonth(): void {
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 1);
    this.renderContent();
  }

  /**
   * Go to today's date
   */
  private goToToday(): void {
    this.currentDate = new Date();
    this.viewMode = 'today';
    this.renderContent();
  }

  private renderDayCard(day: DayOverview): string {
    const date = new Date(day.date);
    const isToday = this.isToday(date);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const dayNum = date.getDate();
    const eventCount = day.totalMeetings || 0;
    const events = day.events || [];

    const statusClass = day.isOverloaded
      ? 'calendar-view__day--busy'
      : eventCount === 0
        ? 'calendar-view__day--clear'
        : '';

    return `
      <div class="calendar-view__day ${statusClass} ${isToday ? 'calendar-view__day--today' : ''}">
        <div class="calendar-view__day-header">
          <span class="calendar-view__day-name">${dayName}</span>
          <span class="calendar-view__day-num">${dayNum}</span>
        </div>
        <div class="calendar-view__day-content">
          ${eventCount === 0 ? '<span class="calendar-view__day-empty">Free</span>' : ''}
          ${events
            .slice(0, 3)
            .map(
              (e) => `
            <div class="calendar-view__mini-event" title="${this.escapeHtml(e.title)}">
              <span class="calendar-view__mini-time">${this.formatTime(e.startTime)}</span>
              <span class="calendar-view__mini-title">${this.escapeHtml(this.truncate(e.title, 20))}</span>
            </div>
          `
            )
            .join('')}
          ${events.length > 3 ? `<span class="calendar-view__day-more">+${events.length - 3} more</span>` : ''}
        </div>
      </div>
    `;
  }

  private renderEvent(event: CalendarEvent): string {
    const startTime = this.formatTime(event.startTime);
    const endTime = this.formatTime(event.endTime);
    const duration = this.formatDuration(event.startTime, event.endTime);

    return `
      <div class="calendar-view__event" data-event-id="${event.id}">
        <div class="calendar-view__event-time">
          <span class="calendar-view__event-start">${startTime}</span>
          <span class="calendar-view__event-end">${endTime}</span>
        </div>
        <div class="calendar-view__event-details">
          <h4 class="calendar-view__event-title">${this.escapeHtml(event.title)}</h4>
          <div class="calendar-view__event-meta">
            <span class="calendar-view__event-duration">${ICONS.clock} ${duration}</span>
            ${event.location ? `<span class="calendar-view__event-location">${ICONS.mapPin} ${this.escapeHtml(this.truncate(event.location, 30))}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  private renderEmptyState(message: string): string {
    return `
      <div class="calendar-view__empty">
        <div class="calendar-view__empty-icon">${ICONS.sun}</div>
        <p>${message}</p>
      </div>
    `;
  }

  private renderError(message: string): void {
    if (!this.wrapper) return;

    this.wrapper.innerHTML = `
      <header class="calendar-view__header">
        <div class="calendar-view__icon">${ICONS.calendar}</div>
        <h2 class="calendar-view__title" id="calendar-view-title">Your Schedule</h2>
        <button class="calendar-view__close" aria-label="${t('common.close')}">
          ${ICONS.close}
        </button>
      </header>
      <div class="calendar-view__error">
        <p>${message}</p>
        <button aria-label="Try Again" class="calendar-view__btn calendar-view__btn--secondary" data-action="retry">
          Try Again
        </button>
      </div>
    `;

    this.bindCloseButton();
    this.bindActions();
  }

  private bindCloseButton(): void {
    const closeBtn = this.wrapper?.querySelector('.calendar-view__close');
    closeBtn?.addEventListener('click', () => this.hide());
  }

  private bindTabs(): void {
    const tabs = this.wrapper?.querySelectorAll('.calendar-view__tab');
    tabs?.forEach((tab) => {
      tab.addEventListener('click', () => {
        const view = (tab as HTMLElement).dataset.view as ViewMode;
        if (view && view !== this.viewMode) {
          this.viewMode = view;
          if (view === 'insights' && !this.analyticsData) {
            this.loadAnalyticsData();
          } else {
            this.renderContent();
          }
        }
      });
    });
  }

  /**
   * Load calendar analytics data
   */
  private async loadAnalyticsData(): Promise<void> {
    this.isLoadingAnalytics = true;
    this.renderContent();

    try {
      const response = await apiGet<CalendarAnalyticsData>('/api/calendar/analytics');
      if (response?.ok && response.data) {
        this.analyticsData = response.data;
      } else {
        // Generate mock data for demo purposes if API fails
        this.analyticsData = this.generateMockAnalyticsData();
      }
    } catch (error) {
      log.error('Failed to load calendar analytics', error);
      // Generate mock data for demo purposes if API fails
      this.analyticsData = this.generateMockAnalyticsData();
    } finally {
      this.isLoadingAnalytics = false;
      this.renderContent();
    }
  }

  /**
   * Generate mock analytics data for demo/fallback
   */
  private generateMockAnalyticsData(): CalendarAnalyticsData {
    return {
      loadFactors: {
        weeklyMeetingHours: 18,
        weeklyFocusTimeRatio: 0.45,
        weeklyBackToBackPercentage: 25,
        consecutiveOverloadedDays: 2,
        consecutiveMeetingStreak: 4,
        heaviestDayThisWeek: 'Tuesday',
        lightestDayThisWeek: 'Friday',
      },
      dailyTrends: [
        { date: '2024-12-16', dayName: 'Monday', meetingHours: 4, focusHours: 4, meetingCount: 5, isOverloaded: false },
        { date: '2024-12-17', dayName: 'Tuesday', meetingHours: 6, focusHours: 2, meetingCount: 7, isOverloaded: true },
        { date: '2024-12-18', dayName: 'Wednesday', meetingHours: 3, focusHours: 5, meetingCount: 4, isOverloaded: false },
        { date: '2024-12-19', dayName: 'Thursday', meetingHours: 4, focusHours: 4, meetingCount: 5, isOverloaded: false },
        { date: '2024-12-20', dayName: 'Friday', meetingHours: 1, focusHours: 7, meetingCount: 2, isOverloaded: false },
      ],
      recoveryInsight: null,
      patterns: [],
      weekOverWeekChange: {
        meetingHoursChange: -10,
        focusTimeChange: 15,
      },
      healthScore: 72,
      recommendations: ['Good balance this week. Keep protecting your focus time.'],
    };
  }

  private bindActions(): void {
    const wrapper = this.wrapper;
    if (!wrapper) return;

    wrapper.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = (btn as HTMLElement).dataset.action;
        switch (action) {
          case 'connect':
          case 'connect-google':
            this.connectGoogle();
            break;
          case 'connect-apple':
            this.connectApple();
            break;
          case 'connect-outlook':
            this.connectOutlook();
            break;
          case 'open-settings':
            this.openFullSettings();
            break;
          case 'add':
            this.callbacks.onAddEvent?.();
            break;
          case 'retry':
            this.loadCalendarData();
            break;
          case 'prev-month':
            this.prevMonth();
            break;
          case 'next-month':
            this.nextMonth();
            break;
          case 'go-today':
            this.goToToday();
            break;
        }
      });
    });

    // Event click handlers
    wrapper.querySelectorAll('.calendar-view__event').forEach((el) => {
      el.addEventListener('click', () => {
        const eventId = (el as HTMLElement).dataset.eventId;
        if (eventId) {
          this.callbacks.onEventClick?.(eventId);
        }
      });
    });
  }

  private connectGoogle(): void {
    const userId = localStorage.getItem('ferni_user_id') || 'anonymous';
    window.location.href = `/auth/google/login?user_id=${encodeURIComponent(userId)}`;
  }

  private connectApple(): void {
    // Open the full settings to show Apple setup (requires credentials)
    this.hide();
    import('./calendar-settings.ui.js').then((mod) => {
      mod.showCalendarSettings();
    }).catch((err) => log.error('Failed to open calendar settings', err));
  }

  private connectOutlook(): void {
    const userId = localStorage.getItem('ferni_user_id') || 'anonymous';
    window.location.href = `/auth/microsoft/login?user_id=${encodeURIComponent(userId)}`;
  }

  private openFullSettings(): void {
    this.hide();
    import('./calendar-settings.ui.js').then((mod) => {
      mod.showCalendarSettings();
    }).catch((err) => log.error('Failed to open calendar settings', err));
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private formatTime(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  private formatDuration(start: string, end: string): string {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const minutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);

    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  private isToday(date: Date): boolean {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  }

  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - 1) + '...';
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============================================================================
  // STYLES
  // ============================================================================

  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = `
      /* ========================================================================
         CALENDAR VIEW OVERLAY
         ======================================================================== */
      .calendar-view {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal, 2100);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--ma-rest, 21px);
        opacity: 0;
        visibility: hidden;
        transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD}, visibility ${DURATION.SLOW}ms;
      }

      .calendar-view--visible {
        opacity: 1;
        visibility: visible;
      }

      .calendar-view__backdrop {
        position: absolute;
        inset: 0;
        background: rgba(44, 37, 32, 0.75);
      }

      .calendar-view__wrapper {
        position: relative;
        width: 100%;
        max-width: clamp(392px, 90vw, 560px);
        max-height: 85vh;
        background: var(--color-background-elevated, #fffdfb);
        border-radius: var(--radius-2xl, 24px);
        box-shadow: var(--shadow-2xl);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        transform: scale(0.95);
        transition: transform ${DURATION.SLOW}ms ${EASING.SPRING};
      }

      .calendar-view--visible .calendar-view__wrapper {
        transform: scale(1);
      }

      /* ========================================================================
         HEADER
         ======================================================================== */
      .calendar-view__header {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--space-5, 20px) var(--space-5, 20px) var(--space-4, 16px);
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .calendar-view__icon {
        width: 32px;
        height: 32px;
        color: var(--color-alex, #5a6b8a);
      }

      .calendar-view__icon svg {
        width: 100%;
        height: 100%;
      }

      .calendar-view__header-content {
        flex: 1;
      }

      .calendar-view__title {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-xl, 1.25rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
        margin: 0;
      }

      .calendar-view__date {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-muted, #756a5e);
        margin: 0;
      }

      .calendar-view__close {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: none;
        background: var(--color-background-secondary, rgba(44, 37, 32, 0.05));
        color: var(--color-text-secondary, #70605a);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .calendar-view__close:hover {
        background: var(--color-background-tertiary, rgba(44, 37, 32, 0.1));
        color: var(--color-text-primary, #2c2520);
      }

      .calendar-view__close:focus-visible {
        outline: 2px solid var(--color-alex, #5a6b8a);
        outline-offset: 2px;
      }

      .calendar-view__close svg {
        width: 18px;
        height: 18px;
      }

      /* ========================================================================
         TABS
         ======================================================================== */
      .calendar-view__tabs {
        display: flex;
        gap: var(--space-2, 8px);
        padding: var(--space-3, 12px) var(--space-5, 20px);
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .calendar-view__tab {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2, 8px);
        padding: var(--space-2, 8px) var(--space-3, 12px);
        border: none;
        border-radius: var(--radius-lg, 12px);
        background: transparent;
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-muted, #756a5e);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .calendar-view__tab svg {
        width: 16px;
        height: 16px;
      }

      .calendar-view__tab:hover {
        background: var(--color-background-secondary, rgba(44, 37, 32, 0.05));
        color: var(--color-text-secondary, #70605a);
      }

      .calendar-view__tab--active {
        background: var(--color-alex-tint, rgba(90, 107, 138, 0.1));
        color: var(--color-alex, #5a6b8a);
      }

      .calendar-view__tab--active:hover {
        background: var(--color-alex-tint, rgba(90, 107, 138, 0.15));
        color: var(--color-alex, #5a6b8a);
      }

      .calendar-view__tab:focus-visible {
        outline: 2px solid var(--color-alex, #5a6b8a);
        outline-offset: 2px;
      }

      /* ========================================================================
         BODY
         ======================================================================== */
      .calendar-view__body {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-4, 16px) var(--space-5, 20px);
      }

      /* ========================================================================
         SUMMARY
         ======================================================================== */
      .calendar-view__summary {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--space-3, 12px) var(--space-4, 16px);
        background: var(--color-alex-tint, rgba(90, 107, 138, 0.08));
        border-radius: var(--radius-lg, 12px);
        margin-bottom: var(--space-4, 16px);
      }

      .calendar-view__summary--clear {
        background: var(--color-ferni-tint, rgba(74, 103, 65, 0.08));
      }

      .calendar-view__summary--busy {
        background: var(--color-maya-tint, rgba(166, 122, 106, 0.1));
      }

      .calendar-view__summary-icon {
        width: 24px;
        height: 24px;
        color: var(--color-alex, #5a6b8a);
      }

      .calendar-view__summary--clear .calendar-view__summary-icon {
        color: var(--color-ferni, #4a6741);
      }

      .calendar-view__summary--busy .calendar-view__summary-icon {
        color: var(--color-maya, #a67a6a);
      }

      .calendar-view__summary-icon svg {
        width: 100%;
        height: 100%;
      }

      .calendar-view__summary-text {
        display: flex;
        flex-direction: column;
      }

      .calendar-view__summary-text strong {
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
      }

      .calendar-view__summary-text span {
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
      }

      /* ========================================================================
         EVENTS LIST
         ======================================================================== */
      .calendar-view__events {
        display: flex;
        flex-direction: column;
        gap: var(--space-3, 12px);
      }

      .calendar-view__event {
        display: flex;
        gap: var(--space-3, 12px);
        padding: var(--space-3, 12px);
        background: var(--color-background-secondary, rgba(44, 37, 32, 0.03));
        border-radius: var(--radius-lg, 12px);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .calendar-view__event:hover {
        background: var(--color-background-tertiary, rgba(44, 37, 32, 0.06));
      }

      .calendar-view__event-time {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        min-width: 60px;
        padding-right: var(--space-3, 12px);
        border-right: 2px solid var(--color-alex, #5a6b8a);
      }

      .calendar-view__event-start {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
      }

      .calendar-view__event-end {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
      }

      .calendar-view__event-details {
        flex: 1;
      }

      .calendar-view__event-title {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary, #2c2520);
        margin: 0 0 var(--space-1, 4px);
      }

      .calendar-view__event-meta {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-3, 12px);
      }

      .calendar-view__event-duration,
      .calendar-view__event-location {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
      }

      .calendar-view__event-duration svg,
      .calendar-view__event-location svg {
        width: 12px;
        height: 12px;
      }

      /* ========================================================================
         WEEK VIEW
         ======================================================================== */
      .calendar-view__week {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: var(--space-2, 8px);
      }

      .calendar-view__day {
        background: var(--color-background-secondary, rgba(44, 37, 32, 0.03));
        border-radius: var(--radius-md, 8px);
        padding: var(--space-2, 8px);
        min-height: 100px;
      }

      .calendar-view__day--today {
        background: var(--color-alex-tint, rgba(90, 107, 138, 0.1));
        border: 1px solid var(--color-alex, #5a6b8a);
      }

      .calendar-view__day--busy {
        border-left: 3px solid var(--color-maya, #a67a6a);
      }

      .calendar-view__day--clear {
        opacity: 0.7;
      }

      .calendar-view__day-header {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-bottom: var(--space-2, 8px);
      }

      .calendar-view__day-name {
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-muted, #756a5e);
        text-transform: uppercase;
      }

      .calendar-view__day-num {
        font-size: var(--text-lg, 1.125rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
      }

      .calendar-view__day--today .calendar-view__day-num {
        color: var(--color-alex, #5a6b8a);
      }

      .calendar-view__day-content {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .calendar-view__day-empty {
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
        text-align: center;
      }

      .calendar-view__mini-event {
        display: flex;
        flex-direction: column;
        padding: 2px 4px;
        background: var(--color-alex-tint, rgba(90, 107, 138, 0.2));
        border-radius: 4px;
        overflow: hidden;
      }

      .calendar-view__mini-time {
        font-size: 9px;
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-alex, #5a6b8a);
      }

      .calendar-view__mini-title {
        font-size: 10px;
        color: var(--color-text-primary, #2c2520);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .calendar-view__day-more {
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
        text-align: center;
        margin-top: 2px;
      }

      /* ========================================================================
         EMPTY STATE
         ======================================================================== */
      .calendar-view__empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--space-8, 32px);
        text-align: center;
      }

      .calendar-view__empty-icon {
        width: 48px;
        height: 48px;
        color: var(--color-text-muted, #756a5e);
        opacity: 0.5;
        margin-bottom: var(--space-3, 12px);
      }

      .calendar-view__empty-icon svg {
        width: 100%;
        height: 100%;
      }

      .calendar-view__empty p {
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-muted, #756a5e);
        margin: 0;
      }

      /* ========================================================================
         DISCONNECTED STATE
         ======================================================================== */
      .calendar-view__disconnected {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--space-10, 40px) var(--space-5, 20px);
        text-align: center;
      }

      .calendar-view__disconnected-icon {
        width: 64px;
        height: 64px;
        color: var(--color-alex, #5a6b8a);
        opacity: 0.5;
        margin-bottom: var(--space-4, 16px);
      }

      .calendar-view__disconnected-icon svg {
        width: 100%;
        height: 100%;
      }

      .calendar-view__disconnected h3 {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-lg, 1.125rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
        margin: 0 0 var(--space-2, 8px);
      }

      .calendar-view__disconnected p {
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-muted, #756a5e);
        margin: 0 0 var(--space-5, 20px);
        max-width: min(280px, 100%);
      }

      /* Provider buttons */
      .calendar-view__providers {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
        width: 100%;
        max-width: min(280px, 100%);
        margin-bottom: var(--space-4, 16px);
      }

      .calendar-view__provider-btn {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--space-3, 12px) var(--space-4, 16px);
        background: var(--color-background-secondary, rgba(44, 37, 32, 0.05));
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
        border-radius: var(--radius-lg, 12px);
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary, #2c2520);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .calendar-view__provider-btn:hover {
        background: var(--color-background-tertiary, rgba(44, 37, 32, 0.08));
        border-color: var(--color-alex, #5a6b8a);
      }

      .calendar-view__provider-btn:focus-visible {
        outline: 2px solid var(--color-alex, #5a6b8a);
        outline-offset: 2px;
      }

      .calendar-view__provider-btn svg {
        flex-shrink: 0;
      }

      .calendar-view__settings-link {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2, 8px);
        padding: var(--space-2, 8px);
        background: transparent;
        border: none;
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
        cursor: pointer;
        transition: color ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .calendar-view__settings-link:hover {
        color: var(--color-text-secondary, #70605a);
      }

      .calendar-view__settings-link:focus-visible {
        outline: 2px solid var(--color-alex, #5a6b8a);
        outline-offset: 2px;
      }

      .calendar-view__settings-link svg {
        width: 14px;
        height: 14px;
      }

      /* ========================================================================
         LOADING & ERROR
         ======================================================================== */
      .calendar-view__loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--space-10, 40px);
      }

      .calendar-view__spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--color-border-subtle, rgba(44, 37, 32, 0.1));
        border-top-color: var(--color-alex, #5a6b8a);
        border-radius: 50%;
        animation: calendar-spin 1s linear infinite;
        margin-bottom: var(--space-3, 12px);
      }

      @keyframes calendar-spin {
        to { transform: rotate(360deg); }
      }

      .calendar-view__loading p {
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-muted, #756a5e);
        margin: 0;
      }

      .calendar-view__error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--space-10, 40px);
        text-align: center;
      }

      .calendar-view__error p {
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-muted, #756a5e);
        margin: 0 0 var(--space-4, 16px);
      }

      /* ========================================================================
         BUTTONS
         ======================================================================== */
      .calendar-view__btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2, 8px);
        padding: var(--space-3, 12px) var(--space-5, 20px);
        border: none;
        border-radius: var(--radius-full, 9999px);
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .calendar-view__btn svg {
        width: 16px;
        height: 16px;
      }

      .calendar-view__btn--primary {
        background: var(--color-alex, #5a6b8a);
        color: white;
      }

      .calendar-view__btn--primary:hover {
        background: var(--color-alex-dark, #4a5a73);
      }

      .calendar-view__btn--secondary {
        background: var(--color-background-secondary, rgba(44, 37, 32, 0.05));
        color: var(--color-text-primary, #2c2520);
      }

      .calendar-view__btn--secondary:hover {
        background: var(--color-background-tertiary, rgba(44, 37, 32, 0.1));
      }

      .calendar-view__btn:focus-visible {
        outline: 2px solid var(--color-alex, #5a6b8a);
        outline-offset: 2px;
      }

      /* ========================================================================
         MONTH VIEW
         ======================================================================== */
      .calendar-view__month {
        display: flex;
        flex-direction: column;
        gap: var(--space-3, 12px);
        padding: var(--space-2, 8px) 0;
      }

      .calendar-view__month-nav {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-4, 16px);
        padding: 0 var(--space-2, 8px);
      }

      .calendar-view__month-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        padding: 0;
        background: transparent;
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.1));
        border-radius: var(--radius-md, 8px);
        color: var(--color-text-secondary, #70605a);
        cursor: pointer;
        transition: all var(--duration-fast, 150ms) ease;
      }

      .calendar-view__month-btn:hover {
        background: var(--color-background-secondary, rgba(44, 37, 32, 0.05));
        border-color: var(--color-border-medium, rgba(44, 37, 32, 0.2));
      }

      .calendar-view__month-btn svg {
        width: 18px;
        height: 18px;
      }

      .calendar-view__month-label {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }

      .calendar-view__month-name {
        font-size: var(--text-lg, 1.125rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
      }

      .calendar-view__month-year {
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-muted, #756a5e);
      }

      .calendar-view__grid-header {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 2px;
        padding: var(--space-2, 8px) 0;
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .calendar-view__grid-header-cell {
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-muted, #756a5e);
        text-align: center;
        text-transform: uppercase;
        padding: var(--space-1, 4px);
      }

      .calendar-view__grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 2px;
      }

      .calendar-view__grid-cell {
        position: relative;
        aspect-ratio: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: var(--space-1, 4px);
        background: var(--color-background-primary, #fffdfb);
        border-radius: var(--radius-sm, 4px);
        cursor: pointer;
        transition: all var(--duration-fast, 150ms) ease;
      }

      .calendar-view__grid-cell:hover:not(.calendar-view__grid-cell--empty) {
        background: var(--color-background-secondary, rgba(44, 37, 32, 0.05));
      }

      .calendar-view__grid-cell--empty {
        background: transparent;
        cursor: default;
      }

      .calendar-view__grid-cell--today {
        background: var(--color-alex-tint, rgba(90, 107, 138, 0.15));
        border: 2px solid var(--color-alex, #5a6b8a);
      }

      .calendar-view__grid-cell--today .calendar-view__grid-day {
        color: var(--color-alex, #5a6b8a);
        font-weight: var(--font-weight-bold, 700);
      }

      .calendar-view__grid-cell--has-events .calendar-view__grid-day {
        font-weight: var(--font-weight-semibold, 600);
      }

      .calendar-view__grid-day {
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-primary, #2c2520);
        line-height: 1;
      }

      .calendar-view__grid-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--color-alex, #5a6b8a);
      }

      .calendar-view__month-footer {
        display: flex;
        justify-content: center;
        padding: var(--space-2, 8px) 0;
      }

      .calendar-view__today-btn {
        padding: var(--space-2, 8px) var(--space-4, 16px);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-alex, #5a6b8a);
        background: transparent;
        border: 1px solid var(--color-alex, #5a6b8a);
        border-radius: var(--radius-full, 999px);
        cursor: pointer;
        transition: all var(--duration-fast, 150ms) ease;
      }

      .calendar-view__today-btn:hover {
        background: var(--color-alex-tint, rgba(90, 107, 138, 0.1));
      }

      /* ========================================================================
         FOOTER
         ======================================================================== */
      .calendar-view__footer {
        padding: var(--space-3, 12px) var(--space-5, 20px);
        border-top: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
        text-align: center;
      }

      .calendar-view__footer-hint {
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
        margin: 0;
      }

      /* ========================================================================
         SYNC STATUS BAR
         ======================================================================== */
      .calendar-view__sync-status {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-3, 12px) var(--space-5, 20px);
        background: var(--color-background-secondary, #f5f1eb);
        border-top: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .calendar-view__sync-status--connected {
        background: var(--color-alex-tint, rgba(90, 107, 138, 0.08));
      }

      .calendar-view__sync-info {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary, #5c524a);
      }

      .calendar-view__sync-dot {
        width: 8px;
        height: 8px;
        background: var(--color-alex, #5a6b8a);
        border-radius: 50%;
        animation: calendar-view-pulse 2s ease-in-out infinite;
      }

      @keyframes calendar-view-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      .calendar-view__sync-hint {
        color: var(--color-text-muted, #756a5e);
      }

      .calendar-view__sync-toggle {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary, #5c524a);
        cursor: pointer;
      }

      .calendar-view__sync-toggle input[type="checkbox"] {
        width: 36px;
        height: 20px;
        appearance: none;
        background: var(--color-background-tertiary, #e5e0d9);
        border-radius: var(--radius-full, 999px);
        position: relative;
        cursor: pointer;
        transition: background var(--duration-fast, 150ms) ease;
      }

      .calendar-view__sync-toggle input[type="checkbox"]::after {
        content: '';
        position: absolute;
        top: 2px;
        left: 2px;
        width: 16px;
        height: 16px;
        background: white;
        border-radius: 50%;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
        transition: transform var(--duration-fast, 150ms) ease;
      }

      .calendar-view__sync-toggle input[type="checkbox"]:checked {
        background: var(--color-alex, #5a6b8a);
      }

      .calendar-view__sync-toggle input[type="checkbox"]:checked::after {
        transform: translateX(16px);
      }

      .calendar-view__sync-btn {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        padding: var(--space-2, 8px) var(--space-3, 12px);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-alex, #5a6b8a);
        background: transparent;
        border: 1px solid var(--color-alex, #5a6b8a);
        border-radius: var(--radius-md, 8px);
        cursor: pointer;
        transition: all var(--duration-fast, 150ms) ease;
      }

      .calendar-view__sync-btn:hover {
        background: var(--color-alex-tint, rgba(90, 107, 138, 0.1));
      }

      .calendar-view__sync-btn svg {
        width: 16px;
        height: 16px;
      }

      /* ========================================================================
         INSIGHTS VIEW
         ======================================================================== */
      .calendar-view__insights {
        display: flex;
        flex-direction: column;
        gap: var(--space-4, 16px);
      }

      .calendar-view__insights-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--space-8, 32px);
        gap: var(--space-3, 12px);
      }

      .calendar-view__insights-loading p {
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-muted, #756a5e);
      }

      /* Health Score */
      .calendar-view__health-score {
        display: flex;
        align-items: center;
        gap: var(--space-4, 16px);
        padding: var(--space-4, 16px);
        background: var(--color-alex-tint, rgba(90, 107, 138, 0.08));
        border-radius: var(--radius-lg, 12px);
      }

      .calendar-view__health-score-circle {
        position: relative;
        width: 80px;
        height: 80px;
        flex-shrink: 0;
      }

      .calendar-view__health-score-circle svg {
        transform: rotate(-90deg);
      }

      .calendar-view__health-score-circle circle {
        fill: none;
        stroke-width: 8;
      }

      .calendar-view__health-score-bg {
        stroke: var(--color-border-subtle, rgba(44, 37, 32, 0.1));
      }

      .calendar-view__health-score-fill {
        stroke: var(--color-ferni, #4a6741);
        stroke-linecap: round;
        transition: stroke-dashoffset ${DURATION.SLOW}ms ${EASING.STANDARD};
      }

      .calendar-view__health-score-fill.warning {
        stroke: var(--color-jordan, #c4856a);
      }

      .calendar-view__health-score-fill.critical {
        stroke: var(--color-maya, #a67a6a);
      }

      .calendar-view__health-score-value {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: var(--text-xl, 1.25rem);
        font-weight: var(--font-weight-bold, 700);
        color: var(--color-text-primary, #2c2520);
      }

      .calendar-view__health-score-details {
        flex: 1;
      }

      .calendar-view__health-score-label {
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-muted, #756a5e);
        margin-bottom: var(--space-1, 4px);
      }

      .calendar-view__health-score-insight {
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-primary, #2c2520);
        line-height: 1.5;
      }

      /* Metrics Grid */
      .calendar-view__metrics-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--space-3, 12px);
      }

      @media (min-width: clamp(336px, 90vw, 480px)) {
        .calendar-view__metrics-grid {
          grid-template-columns: repeat(4, 1fr);
        }
      }

      .calendar-view__metric-card {
        padding: var(--space-3, 12px);
        background: var(--color-background-secondary, rgba(44, 37, 32, 0.03));
        border-radius: var(--radius-lg, 12px);
        text-align: center;
      }

      .calendar-view__metric-icon {
        width: 24px;
        height: 24px;
        margin: 0 auto var(--space-2, 8px);
        color: var(--color-alex, #5a6b8a);
      }

      .calendar-view__metric-icon svg {
        width: 100%;
        height: 100%;
      }

      .calendar-view__metric-value {
        font-size: var(--text-lg, 1.125rem);
        font-weight: var(--font-weight-bold, 700);
        color: var(--color-text-primary, #2c2520);
        margin-bottom: var(--space-1, 4px);
      }

      .calendar-view__metric-label {
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }

      .calendar-view__metric-trend {
        font-size: var(--text-xs, 0.75rem);
        margin-top: var(--space-1, 4px);
      }

      .calendar-view__metric-trend.positive {
        color: var(--color-ferni, #4a6741);
      }

      .calendar-view__metric-trend.negative {
        color: var(--color-maya, #a67a6a);
      }

      /* Weekly Chart */
      .calendar-view__weekly-chart {
        padding: var(--space-3, 12px);
        background: var(--color-background-secondary, rgba(44, 37, 32, 0.03));
        border-radius: var(--radius-lg, 12px);
      }

      .calendar-view__weekly-chart-title {
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-secondary, #70605a);
        margin-bottom: var(--space-3, 12px);
      }

      .calendar-view__chart-bars {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        height: 80px;
        gap: var(--space-1, 4px);
      }

      .calendar-view__chart-bar-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        height: 100%;
      }

      .calendar-view__chart-bar-track {
        flex: 1;
        width: 100%;
        display: flex;
        align-items: flex-end;
      }

      .calendar-view__chart-bar {
        width: 100%;
        background: var(--color-alex, #5a6b8a);
        border-radius: var(--radius-sm, 4px) var(--radius-sm, 4px) 0 0;
        transition: height ${DURATION.SLOW}ms ${EASING.STANDARD};
        opacity: 0.7;
      }

      .calendar-view__chart-bar.overloaded {
        background: var(--color-jordan, #c4856a);
      }

      .calendar-view__chart-bar-label {
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
        margin-top: var(--space-1, 4px);
      }

      /* Patterns */
      .calendar-view__patterns-section {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
      }

      .calendar-view__pattern-card {
        display: flex;
        gap: var(--space-3, 12px);
        padding: var(--space-3, 12px);
        background: var(--color-background-secondary, rgba(44, 37, 32, 0.03));
        border-radius: var(--radius-lg, 12px);
        border-left: 3px solid var(--color-alex, #5a6b8a);
      }

      .calendar-view__pattern-card.warning {
        border-left-color: var(--color-jordan, #c4856a);
      }

      .calendar-view__pattern-card.critical {
        border-left-color: var(--color-maya, #a67a6a);
      }

      .calendar-view__pattern-content {
        flex: 1;
      }

      .calendar-view__pattern-title {
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
        margin-bottom: var(--space-1, 4px);
      }

      .calendar-view__pattern-description {
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary, #70605a);
        line-height: 1.4;
      }

      /* Recovery Action */
      .calendar-view__recovery-action {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--space-3, 12px);
        background: var(--color-ferni-tint, rgba(74, 103, 65, 0.08));
        border-radius: var(--radius-lg, 12px);
        border: 1px solid var(--color-ferni, #4a6741);
      }

      .calendar-view__recovery-info {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
      }

      .calendar-view__recovery-icon {
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-ferni, #4a6741);
        border-radius: var(--radius-full, 9999px);
        color: white;
        flex-shrink: 0;
      }

      .calendar-view__recovery-icon svg {
        width: 18px;
        height: 18px;
      }

      .calendar-view__recovery-text h4 {
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
        margin: 0 0 var(--space-1, 4px);
      }

      .calendar-view__recovery-text p {
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
        margin: 0;
      }

      /* ========================================================================
         DARK THEME
         ======================================================================== */
      [data-theme="midnight"] .calendar-view__wrapper {
        background: var(--color-background-elevated, #70605a);
      }

      [data-theme="midnight"] .calendar-view__header,
      [data-theme="midnight"] .calendar-view__tabs,
      [data-theme="midnight"] .calendar-view__footer {
        border-color: var(--color-border-subtle, rgba(255, 255, 255, 0.1));
      }

      [data-theme="midnight"] .calendar-view__title,
      [data-theme="midnight"] .calendar-view__event-title,
      [data-theme="midnight"] .calendar-view__event-start,
      [data-theme="midnight"] .calendar-view__summary-text strong,
      [data-theme="midnight"] .calendar-view__day-num,
      [data-theme="midnight"] .calendar-view__disconnected h3,
      [data-theme="midnight"] .calendar-view__mini-title {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .calendar-view__date,
      [data-theme="midnight"] .calendar-view__event-end,
      [data-theme="midnight"] .calendar-view__event-duration,
      [data-theme="midnight"] .calendar-view__event-location,
      [data-theme="midnight"] .calendar-view__summary-text span,
      [data-theme="midnight"] .calendar-view__day-empty,
      [data-theme="midnight"] .calendar-view__day-more,
      [data-theme="midnight"] .calendar-view__empty p,
      [data-theme="midnight"] .calendar-view__loading p,
      [data-theme="midnight"] .calendar-view__error p,
      [data-theme="midnight"] .calendar-view__disconnected p,
      [data-theme="midnight"] .calendar-view__footer-hint {
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .calendar-view__close {
        background: var(--color-background-tertiary, #685852);
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .calendar-view__close:hover {
        background: var(--color-background-secondary, #60504a);
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .calendar-view__tab {
        color: var(--color-text-muted, #e8e2da);
      }

      [data-theme="midnight"] .calendar-view__tab:hover {
        background: var(--color-background-tertiary, #685852);
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .calendar-view__tab--active {
        background: var(--color-alex-tint, rgba(90, 107, 138, 0.2));
        color: var(--color-alex-light, #8a9bb8);
      }

      [data-theme="midnight"] .calendar-view__summary {
        background: var(--color-background-tertiary, #685852);
      }

      [data-theme="midnight"] .calendar-view__event,
      [data-theme="midnight"] .calendar-view__day {
        background: var(--color-background-tertiary, #685852);
      }

      [data-theme="midnight"] .calendar-view__event:hover {
        background: var(--color-background-secondary, #60504a);
      }

      [data-theme="midnight"] .calendar-view__day--today {
        background: var(--color-alex-tint, rgba(90, 107, 138, 0.2));
        border-color: var(--color-alex-light, #8a9bb8);
      }

      [data-theme="midnight"] .calendar-view__mini-event {
        background: var(--color-alex-tint, rgba(90, 107, 138, 0.3));
      }

      [data-theme="midnight"] .calendar-view__spinner {
        border-color: var(--color-border-subtle, rgba(255, 255, 255, 0.1));
        border-top-color: var(--color-alex-light, #8a9bb8);
      }

      [data-theme="midnight"] .calendar-view__btn--primary {
        background: var(--color-alex-light, #8a9bb8);
        color: var(--color-text-primary-dark, #2c2520);
      }

      [data-theme="midnight"] .calendar-view__btn--secondary {
        background: var(--color-background-tertiary, #685852);
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .calendar-view__provider-btn {
        background: var(--color-background-tertiary, #685852);
        border-color: var(--color-border-subtle, rgba(255, 255, 255, 0.1));
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .calendar-view__provider-btn:hover {
        background: var(--color-background-secondary, #60504a);
        border-color: var(--color-alex-light, #8a9bb8);
      }

      [data-theme="midnight"] .calendar-view__settings-link {
        color: var(--color-text-muted, #e8e2da);
      }

      [data-theme="midnight"] .calendar-view__settings-link:hover {
        color: var(--color-text-secondary, #f0ebe4);
      }

      /* Month view dark theme */
      [data-theme="midnight"] .calendar-view__month-name {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .calendar-view__month-year {
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .calendar-view__month-btn {
        border-color: var(--color-border-subtle, rgba(255, 255, 255, 0.1));
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .calendar-view__month-btn:hover {
        background: var(--color-background-tertiary, #685852);
        border-color: var(--color-alex-light, #8a9bb8);
      }

      [data-theme="midnight"] .calendar-view__grid-header-cell {
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .calendar-view__grid-cell {
        background: var(--color-background-tertiary, #685852);
      }

      [data-theme="midnight"] .calendar-view__grid-cell:hover:not(.calendar-view__grid-cell--empty) {
        background: var(--color-background-secondary, #60504a);
      }

      [data-theme="midnight"] .calendar-view__grid-cell--empty {
        background: transparent;
      }

      [data-theme="midnight"] .calendar-view__grid-cell--today {
        background: var(--color-alex-tint, rgba(90, 107, 138, 0.25));
        border-color: var(--color-alex-light, #8a9bb8);
      }

      [data-theme="midnight"] .calendar-view__grid-day {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .calendar-view__grid-cell--today .calendar-view__grid-day {
        color: var(--color-alex-light, #8a9bb8);
      }

      [data-theme="midnight"] .calendar-view__today-btn {
        border-color: var(--color-alex-light, #8a9bb8);
        color: var(--color-alex-light, #8a9bb8);
      }

      [data-theme="midnight"] .calendar-view__today-btn:hover {
        background: var(--color-alex-tint, rgba(90, 107, 138, 0.2));
      }

      /* Sync status dark theme */
      [data-theme="midnight"] .calendar-view__sync-status {
        background: var(--color-background-tertiary, #685852);
        border-color: var(--color-border-subtle, rgba(255, 255, 255, 0.1));
      }

      [data-theme="midnight"] .calendar-view__sync-status--connected {
        background: var(--color-alex-tint, rgba(90, 107, 138, 0.15));
      }

      [data-theme="midnight"] .calendar-view__sync-info {
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .calendar-view__sync-hint {
        color: var(--color-text-muted, #e8e2da);
      }

      [data-theme="midnight"] .calendar-view__sync-toggle {
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .calendar-view__sync-toggle input[type="checkbox"] {
        background: var(--color-background-secondary, #60504a);
      }

      [data-theme="midnight"] .calendar-view__sync-toggle input[type="checkbox"]:checked {
        background: var(--color-alex-light, #8a9bb8);
      }

      [data-theme="midnight"] .calendar-view__sync-btn {
        border-color: var(--color-alex-light, #8a9bb8);
        color: var(--color-alex-light, #8a9bb8);
      }

      [data-theme="midnight"] .calendar-view__sync-btn:hover {
        background: var(--color-alex-tint, rgba(90, 107, 138, 0.2));
      }

      /* ========================================================================
         RESPONSIVE
         ======================================================================== */
      @media (max-width: clamp(448px, 90vw, 640px)) {
        .calendar-view__week {
          grid-template-columns: repeat(7, 1fr);
          gap: 4px;
        }

        .calendar-view__day {
          min-height: 80px;
          padding: 4px;
        }

        .calendar-view__day-num {
          font-size: var(--text-base, 1rem);
        }

        .calendar-view__mini-event {
          display: none;
        }

        .calendar-view__day-content::after {
          content: attr(data-count);
        }

        /* Month view responsive */
        .calendar-view__grid-cell {
          aspect-ratio: 1;
        }

        .calendar-view__grid-day {
          font-size: var(--text-xs, 0.75rem);
        }

        .calendar-view__grid-dot {
          width: 4px;
          height: 4px;
        }

        .calendar-view__month-name {
          font-size: var(--text-base, 1rem);
        }
      }

      /* ========================================================================
         REDUCED MOTION
         ======================================================================== */
      @media (prefers-reduced-motion: reduce) {
        .calendar-view,
        .calendar-view__wrapper,
        .calendar-view__close,
        .calendar-view__tab,
        .calendar-view__event,
        .calendar-view__btn {
          transition: none;
        }

        .calendar-view__spinner {
          animation: none;
        }
      }
    `;

    document.head.appendChild(this.styleElement);
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const calendarViewUI = new CalendarViewUI();

/**
 * Show the calendar view
 */
export function showCalendarView(): void {
  calendarViewUI.show();
}

/**
 * Hide the calendar view
 */
export function hideCalendarView(): void {
  calendarViewUI.hide();
}

/**
 * Toggle the calendar view
 */
export function toggleCalendarView(): void {
  calendarViewUI.toggle();
}

/**
 * Set calendar view callbacks
 */
export function setCalendarViewCallbacks(callbacks: CalendarViewCallbacks): void {
  calendarViewUI.setCallbacks(callbacks);
}

