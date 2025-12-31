/**
 * Calendar Quick Actions Widget
 *
 * A floating mini-widget showing:
 * - Next meeting countdown
 * - Today's meeting count
 * - Quick "block focus time" button
 *
 * "Better Than Human" - Always-visible calendar awareness
 *
 * @module ui/calendar-quick-widget
 */

import { createLogger } from '../utils/logger.js';
import { apiFetch } from '../utils/api-helpers.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { t } from '../i18n/index.js';

const log = createLogger('CalendarQuickWidget');

// ============================================================================
// TYPES
// ============================================================================

interface NextMeeting {
  id: string;
  title: string;
  startTime: Date;
  minutesUntil: number;
  location?: string;
  attendees?: string[];
}

interface CalendarWidgetState {
  isVisible: boolean;
  isExpanded: boolean;
  isLoading: boolean;
  nextMeeting: NextMeeting | null;
  todayMeetingCount: number;
  focusTimeAvailable: number; // minutes
  lastUpdated: Date | null;
}

// ============================================================================
// STATE
// ============================================================================

let state: CalendarWidgetState = {
  isVisible: false,
  isExpanded: false,
  isLoading: false,
  nextMeeting: null,
  todayMeetingCount: 0,
  focusTimeAvailable: 0,
  lastUpdated: null,
};

let widgetContainer: HTMLElement | null = null;
let updateInterval: ReturnType<typeof setInterval> | null = null;
let countdownInterval: ReturnType<typeof setInterval> | null = null;

// ============================================================================
// ICONS (Lucide SVG)
// ============================================================================

const ICONS = {
  calendar: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`,
  clock: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  focus: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`,
  plus: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`,
  chevronUp: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`,
  chevronDown: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
  mapPin: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
  users: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  close: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
};

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('calendar-quick-widget-styles')) return;

  const style = document.createElement('style');
  style.id = 'calendar-quick-widget-styles';
  style.textContent = `
    /* =========================================================================
       CALENDAR QUICK WIDGET - Floating Mini Calendar
       ========================================================================= */
    
    .calendar-quick-widget {
      position: fixed;
      bottom: var(--space-20, 5rem);
      right: var(--space-4, 1rem);
      z-index: var(--z-floating, 20);
      opacity: 0;
      transform: translateY(10px) scale(0.95);
      pointer-events: none;
      transition: 
        opacity ${DURATION.NORMAL}ms ${EASING.STANDARD},
        transform ${DURATION.NORMAL}ms ${EASING.SPRING};
    }

    .calendar-quick-widget.visible {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }

    /* Collapsed State - Pill */
    .cqw-pill {
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
      padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
      background: var(--color-background-elevated, #FFFDFB);
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.12));
      border-radius: var(--radius-full, 9999px);
      box-shadow: var(--shadow-lg);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .cqw-pill:hover {
      border-color: var(--persona-primary, #4a6741);
      box-shadow: var(--shadow-xl);
    }

    .cqw-pill-icon {
      width: 20px;
      height: 20px;
      color: var(--persona-primary, #4a6741);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .cqw-pill-text {
      font-size: var(--text-sm, 0.875rem);
      font-weight: 500;
      color: var(--color-text-primary, #2C2520);
    }

    .cqw-pill-countdown {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      color: var(--persona-primary, #4a6741);
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      padding: var(--space-0-5, 0.125rem) var(--space-2, 0.5rem);
      border-radius: var(--radius-full, 50%);
    }

    .cqw-pill-countdown.urgent {
      background: rgba(204, 68, 68, 0.1);
      color: var(--color-semantic-error, #c44);
    }

    .cqw-pill-expand {
      color: var(--color-text-muted, #70605a);
      display: flex;
      align-items: center;
    }

    /* Expanded State - Card */
    .cqw-card {
      display: none;
      width: min(280px, 100%);
      background: var(--color-background-elevated, #FFFDFB);
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.12));
      border-radius: var(--radius-xl, 1.25rem);
      box-shadow: var(--shadow-xl);
      overflow: hidden;
    }

    .calendar-quick-widget.expanded .cqw-pill {
      display: none;
    }

    .calendar-quick-widget.expanded .cqw-card {
      display: block;
    }

    .cqw-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-3, 0.75rem) var(--space-4, 1rem);
      border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
      background: var(--persona-tint, rgba(74, 103, 65, 0.04));
    }

    .cqw-header-title {
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
      font-size: var(--text-sm, 0.875rem);
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
    }

    .cqw-header-title svg {
      color: var(--persona-primary, #4a6741);
    }

    .cqw-collapse-btn {
      width: 24px;
      height: 24px;
      border: none;
      background: transparent;
      border-radius: var(--radius-full, 50%);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-muted, #70605a);
      transition: background ${DURATION.FAST}ms, color ${DURATION.FAST}ms;
    }

    .cqw-collapse-btn:hover {
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.06));
      color: var(--color-text-primary, #2C2520);
    }

    /* Next Meeting Section */
    .cqw-next-meeting {
      padding: var(--space-4, 1rem);
      border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.06));
    }

    .cqw-next-label {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--color-text-muted, #70605a);
      margin-bottom: var(--space-2, 0.5rem);
    }

    .cqw-meeting-title {
      font-weight: 600;
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-primary, #2C2520);
      margin-bottom: var(--space-1, 0.25rem);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cqw-meeting-time {
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
    }

    .cqw-countdown-large {
      font-size: var(--text-lg, 1.125rem);
      font-weight: 700;
      color: var(--persona-primary, #4a6741);
      margin-top: var(--space-2, 0.5rem);
    }

    .cqw-countdown-large.urgent {
      color: var(--color-semantic-error, #c44);
    }

    .cqw-meeting-meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2, 0.5rem);
      margin-top: var(--space-2, 0.5rem);
    }

    .cqw-meta-item {
      display: flex;
      align-items: center;
      gap: var(--space-1, 0.25rem);
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
    }

    .cqw-meta-item svg {
      opacity: 0.7;
    }

    .cqw-no-meeting {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-secondary, #5a4a42);
    }

    .cqw-no-meeting-sub {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
      margin-top: var(--space-1, 0.25rem);
    }

    /* Stats Row */
    .cqw-stats {
      display: flex;
      padding: var(--space-3, 0.75rem) var(--space-4, 1rem);
      gap: var(--space-4, 1rem);
      border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.06));
    }

    .cqw-stat {
      flex: 1;
      text-align: center;
    }

    .cqw-stat-value {
      font-size: var(--text-lg, 1.125rem);
      font-weight: 700;
      color: var(--color-text-primary, #2C2520);
    }

    .cqw-stat-label {
      font-size: var(--text-xxs, 0.625rem);
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted, #70605a);
      margin-top: var(--space-0-5, 0.125rem);
    }

    /* Quick Actions */
    .cqw-actions {
      padding: var(--space-3, 0.75rem) var(--space-4, 1rem);
    }

    .cqw-action-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 0.5rem);
      width: 100%;
      padding: var(--space-2-5, 0.625rem);
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.15));
      border-radius: var(--radius-lg, 1rem);
      background: transparent;
      color: var(--color-text-secondary, #5a4a42);
      font-size: var(--text-sm, 0.875rem);
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .cqw-action-btn:hover {
      border-color: var(--persona-primary, #4a6741);
      color: var(--persona-primary, #4a6741);
      background: var(--persona-tint, rgba(74, 103, 65, 0.05));
    }

    .cqw-action-btn:focus-visible {
      outline: 2px solid var(--persona-primary, #4a6741);
      outline-offset: 2px;
    }

    .cqw-action-btn svg {
      width: 14px;
      height: 14px;
    }

    /* Loading State */
    .cqw-loading {
      padding: var(--space-6, 1.5rem);
      text-align: center;
      color: var(--color-text-muted, #70605a);
      font-size: var(--text-sm, 0.875rem);
    }

    /* =========================================================================
       RESPONSIVE
       ========================================================================= */
    
    @media (max-width: clamp(448px, 90vw, 640px)) {
      .calendar-quick-widget {
        right: var(--space-3, 0.75rem);
        bottom: var(--space-16, 4rem);
      }

      .cqw-card {
        width: min(260px, 100%);
      }
    }

    /* =========================================================================
       REDUCED MOTION
       ========================================================================= */
    
    @media (prefers-reduced-motion: reduce) {
      .calendar-quick-widget,
      .cqw-pill,
      .cqw-action-btn,
      .cqw-collapse-btn {
        transition: none;
      }
    }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// RENDER
// ============================================================================

function render(): void {
  if (!widgetContainer) return;

  if (state.isLoading) {
    widgetContainer.innerHTML = `
      <div class="cqw-card" style="display: block;">
        <div class="cqw-loading">Loading...</div>
      </div>
    `;
    return;
  }

  widgetContainer.innerHTML = `
    ${renderPill()}
    ${renderCard()}
  `;

  bindEvents();
}

function renderPill(): string {
  const meeting = state.nextMeeting;
  const isUrgent = meeting && meeting.minutesUntil <= 15;
  
  if (!meeting) {
    return `
      <div class="cqw-pill">
        <span class="cqw-pill-icon">${ICONS.calendar}</span>
        <span class="cqw-pill-text">${state.todayMeetingCount} meetings today</span>
        <span class="cqw-pill-expand">${ICONS.chevronUp}</span>
      </div>
    `;
  }

  return `
    <div class="cqw-pill">
      <span class="cqw-pill-icon">${ICONS.clock}</span>
      <span class="cqw-pill-text">${truncateTitle(meeting.title, 20)}</span>
      <span class="cqw-pill-countdown ${isUrgent ? 'urgent' : ''}" id="pill-countdown">
        ${formatCountdown(meeting.minutesUntil)}
      </span>
      <span class="cqw-pill-expand">${ICONS.chevronUp}</span>
    </div>
  `;
}

function renderCard(): string {
  const meeting = state.nextMeeting;
  const isUrgent = meeting && meeting.minutesUntil <= 15;

  return `
    <div class="cqw-card">
      <div class="cqw-header">
        <div class="cqw-header-title">
          ${ICONS.calendar}
          Today's Calendar
        </div>
        <button class="cqw-collapse-btn" aria-label="${t('accessibility.collapse')}">${ICONS.chevronDown}</button>
      </div>

      <div class="cqw-next-meeting">
        <div class="cqw-next-label">Next Up</div>
        ${meeting ? `
          <div class="cqw-meeting-title">${escapeHtml(meeting.title)}</div>
          <div class="cqw-meeting-time">
            ${ICONS.clock}
            ${formatTime(meeting.startTime)}
          </div>
          <div class="cqw-countdown-large ${isUrgent ? 'urgent' : ''}" id="card-countdown">
            ${formatCountdownLarge(meeting.minutesUntil)}
          </div>
          ${meeting.location || (meeting.attendees && meeting.attendees.length > 0) ? `
            <div class="cqw-meeting-meta">
              ${meeting.location ? `
                <span class="cqw-meta-item">
                  ${ICONS.mapPin}
                  ${escapeHtml(meeting.location)}
                </span>
              ` : ''}
              ${meeting.attendees && meeting.attendees.length > 0 ? `
                <span class="cqw-meta-item">
                  ${ICONS.users}
                  ${meeting.attendees.length} attendee${meeting.attendees.length !== 1 ? 's' : ''}
                </span>
              ` : ''}
            </div>
          ` : ''}
        ` : `
          <div class="cqw-no-meeting">No more meetings today</div>
          <div class="cqw-no-meeting-sub">
            ${state.focusTimeAvailable > 0 
              ? `${Math.round(state.focusTimeAvailable / 60)}h focus time available`
              : 'Enjoy your free time!'}
          </div>
        `}
      </div>

      <div class="cqw-stats">
        <div class="cqw-stat">
          <div class="cqw-stat-value">${state.todayMeetingCount}</div>
          <div class="cqw-stat-label">Meetings</div>
        </div>
        <div class="cqw-stat">
          <div class="cqw-stat-value">${Math.round(state.focusTimeAvailable / 60)}h</div>
          <div class="cqw-stat-label">Focus Time</div>
        </div>
      </div>

      <div class="cqw-actions" role="button" tabindex="0">
        <button aria-label="${t('accessibility.blockFocusTime')}" class="cqw-action-btn" data-action="block-focus">
          ${ICONS.focus}
          Block Focus Time
        </button>
      </div>
    </div>
  `;
}

// ============================================================================
// EVENT BINDING
// ============================================================================

function bindEvents(): void {
  if (!widgetContainer) return;

  // Pill click - expand
  widgetContainer.querySelector('.cqw-pill')?.addEventListener('click', () => {
    state.isExpanded = true;
    widgetContainer?.classList.add('expanded');
    render();
  });

  // Collapse button
  widgetContainer.querySelector('.cqw-collapse-btn')?.addEventListener('click', () => {
    state.isExpanded = false;
    widgetContainer?.classList.remove('expanded');
    render();
  });

  // Block focus time
  widgetContainer.querySelector('[data-action="block-focus"]')?.addEventListener('click', async () => {
    await blockFocusTime();
  });
}

// ============================================================================
// API & DATA
// ============================================================================

async function fetchCalendarData(): Promise<void> {
  try {
    const response = await apiFetch('/api/calendar/ambient');
    
    if (!response.ok) {
      log.warn('Could not fetch calendar data');
      return;
    }

    const data = await response.json();

    // Update state with ambient context
    if (data.upcomingMeetings && data.upcomingMeetings.length > 0) {
      const next = data.upcomingMeetings[0];
      state.nextMeeting = {
        id: next.event?.id || 'unknown',
        title: next.event?.title || 'Meeting',
        startTime: new Date(next.event?.startTime || Date.now()),
        minutesUntil: next.minutesUntil || 0,
        location: next.event?.location,
        attendees: next.event?.attendees || [],
      };
    } else {
      state.nextMeeting = null;
    }

    // Get today's meeting count from day overview
    const todayResponse = await apiFetch('/api/calendar/today');
    if (todayResponse.ok) {
      const todayData = await todayResponse.json();
      state.todayMeetingCount = todayData.totalMeetings || 0;
      state.focusTimeAvailable = todayData.freeTimeMinutes || 0;
    }

    state.lastUpdated = new Date();
    render();
  } catch (error) {
    log.error('Failed to fetch calendar data:', error);
  }
}

async function blockFocusTime(): Promise<void> {
  try {
    // Dispatch event for Alex to handle via voice
    document.dispatchEvent(new CustomEvent('ferni:voice-command', {
      detail: { 
        command: 'block-focus-time',
        text: 'Block an hour of focus time for me today',
      }
    }));

    // Also try API directly
    const response = await apiFetch('/api/calendar/block-focus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ durationMinutes: 60 }),
    });

    if (response.ok) {
      const data = await response.json();
      log.info({ eventId: data.eventId }, 'Focus time blocked');
      
      // Show toast
      const { toast } = await import('./toast.ui.js');
      toast.success(t('toasts.focusTimeBlocked'));
      
      // Refresh data
      await fetchCalendarData();
    }
  } catch (error) {
    log.error('Failed to block focus time:', error);
    const { toast } = await import('./toast.ui.js');
    toast.error("Couldn't block focus time");
  }
}

// ============================================================================
// COUNTDOWN TIMER
// ============================================================================

function startCountdownTimer(): void {
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }

  countdownInterval = setInterval(() => {
    if (!state.nextMeeting) return;

    // Recalculate minutes until
    const now = new Date();
    const start = new Date(state.nextMeeting.startTime);
    const minutesUntil = Math.max(0, Math.round((start.getTime() - now.getTime()) / 60000));
    
    state.nextMeeting.minutesUntil = minutesUntil;

    // Update countdown displays
    const pillCountdown = document.getElementById('pill-countdown');
    const cardCountdown = document.getElementById('card-countdown');
    const isUrgent = minutesUntil <= 15;

    if (pillCountdown) {
      pillCountdown.textContent = formatCountdown(minutesUntil);
      pillCountdown.classList.toggle('urgent', isUrgent);
    }

    if (cardCountdown) {
      cardCountdown.textContent = formatCountdownLarge(minutesUntil);
      cardCountdown.classList.toggle('urgent', isUrgent);
    }

    // If meeting has started, refresh data
    if (minutesUntil <= 0) {
      void fetchCalendarData();
    }
  }, 30000); // Update every 30 seconds
}

// ============================================================================
// HELPERS
// ============================================================================

function formatCountdown(minutes: number): string {
  if (minutes <= 0) return 'Now!';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatCountdownLarge(minutes: number): string {
  if (minutes <= 0) return 'Starting now!';
  if (minutes === 1) return 'In 1 minute';
  if (minutes < 60) return `In ${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 1 && mins === 0) return 'In 1 hour';
  if (mins === 0) return `In ${hours} hours`;
  return `In ${hours}h ${mins}m`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function truncateTitle(title: string, maxLength: number): string {
  if (title.length <= maxLength) return title;
  return title.slice(0, maxLength - 1) + '…';
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function cleanupOrphanedWidgets(): void {
  document.querySelectorAll('.calendar-quick-widget').forEach(el => el.remove());
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show the calendar quick widget
 */
export function showCalendarWidget(): void {
  if (state.isVisible) return;

  cleanupOrphanedWidgets();
  injectStyles();

  state = {
    isVisible: true,
    isExpanded: false,
    isLoading: true,
    nextMeeting: null,
    todayMeetingCount: 0,
    focusTimeAvailable: 0,
    lastUpdated: null,
  };

  widgetContainer = document.createElement('div');
  widgetContainer.className = 'calendar-quick-widget';
  document.body.appendChild(widgetContainer);

  render();

  // Animate in
  requestAnimationFrame(() => {
    widgetContainer?.classList.add('visible');
  });

  // Fetch data
  state.isLoading = true;
  void fetchCalendarData().then(() => {
    state.isLoading = false;
    render();
    startCountdownTimer();
  });

  // Auto-refresh every 5 minutes
  updateInterval = setInterval(() => {
    void fetchCalendarData();
  }, 5 * 60 * 1000);

  log.info('Calendar quick widget shown');
}

/**
 * Hide the calendar quick widget
 */
export function hideCalendarWidget(): void {
  if (!state.isVisible || !widgetContainer) return;

  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }

  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  widgetContainer.classList.remove('visible');
  
  setTimeout(() => {
    widgetContainer?.remove();
    widgetContainer = null;
  }, DURATION.NORMAL);

  state.isVisible = false;
  log.info('Calendar quick widget hidden');
}

/**
 * Toggle the calendar quick widget visibility
 */
export function toggleCalendarWidget(): void {
  if (state.isVisible) {
    hideCalendarWidget();
  } else {
    showCalendarWidget();
  }
}

/**
 * Initialize the calendar widget system
 */
export function initCalendarQuickWidget(): void {
  // Listen for toggle events
  document.addEventListener('ferni:toggle-calendar-widget', () => {
    toggleCalendarWidget();
  });

  // Listen for calendar connection changes
  document.addEventListener('ferni:calendar-connected', () => {
    if (!state.isVisible) {
      showCalendarWidget();
    } else {
      void fetchCalendarData();
    }
  });

  log.debug('Calendar quick widget initialized');
}

// Export for use in other modules
export const calendarWidget = {
  init: initCalendarQuickWidget,
  show: showCalendarWidget,
  hide: hideCalendarWidget,
  toggle: toggleCalendarWidget,
};

export default calendarWidget;

