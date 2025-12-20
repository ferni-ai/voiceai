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
import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { apiGet } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('CalendarViewUI');

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

type ViewMode = 'today' | 'week';

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
  private viewMode: ViewMode = 'today';
  private todayData: DayOverview | null = null;
  private weekData: WeekOverview | null = null;
  private currentDate: Date = new Date();

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
      // Check connection status
      const statusRes = await apiGet('/auth/google/status');
      this.isConnected = statusRes?.linked === true;

      if (!this.isConnected) {
        this.renderDisconnected();
        return;
      }

      // Load today's data
      const todayRes = await apiGet('/api/calendar/today');
      if (todayRes?.overview) {
        this.todayData = todayRes.overview;
      }

      // Load week data
      const weekRes = await apiGet('/api/calendar/week');
      if (weekRes?.overview) {
        this.weekData = weekRes.overview;
      }

      this.renderContent();
    } catch (error) {
      log.error('Failed to load calendar data', error);
      this.renderError("Couldn't load your calendar. Try again?");
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
        <button class="calendar-view__btn calendar-view__btn--primary" data-action="connect">
          ${ICONS.link}
          <span>Connect Google Calendar</span>
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
        <button class="calendar-view__tab ${this.viewMode === 'today' ? 'calendar-view__tab--active' : ''}" data-view="today">
          ${ICONS.sun}
          Today
        </button>
        <button class="calendar-view__tab ${this.viewMode === 'week' ? 'calendar-view__tab--active' : ''}" data-view="week">
          ${ICONS.calendar}
          This Week
        </button>
      </div>

      <div class="calendar-view__body">
        ${this.viewMode === 'today' ? this.renderTodayView() : this.renderWeekView()}
      </div>

      <footer class="calendar-view__footer">
        <p class="calendar-view__footer-hint">Say "Alex, schedule a meeting" to add events</p>
      </footer>
    `;

    this.bindCloseButton();
    this.bindTabs();
    this.bindActions();
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
    if (!this.weekData || !this.weekData.days) {
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
        <button class="calendar-view__btn calendar-view__btn--secondary" data-action="retry">
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
          this.renderContent();
        }
      });
    });
  }

  private bindActions(): void {
    const wrapper = this.wrapper;
    if (!wrapper) return;

    wrapper.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = (btn as HTMLElement).dataset.action;
        switch (action) {
          case 'connect':
            this.callbacks.onConnectCalendar?.();
            break;
          case 'add':
            this.callbacks.onAddEvent?.();
            break;
          case 'retry':
            this.loadCalendarData();
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
        background: var(--backdrop-page, rgba(44, 37, 32, 0.4));
        backdrop-filter: blur(var(--glass-blur-subtle, 8px));
        -webkit-backdrop-filter: blur(var(--glass-blur-subtle, 8px));
      }

      .calendar-view__wrapper {
        position: relative;
        width: 100%;
        max-width: 560px;
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
        max-width: 280px;
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

      /* ========================================================================
         RESPONSIVE
         ======================================================================== */
      @media (max-width: 640px) {
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

