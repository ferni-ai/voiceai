/**
 * Calendar View: load the panel's data and decide which state it shows.
 *
 * Every load ends in one state (menu rubric §3): ready, empty, signed out, offline or
 * error. Signed out is checked before anything waits, and a failed route is shown as an
 * error with Try again, never as an empty calendar.
 */

import { t } from '../i18n/index.js';
import { apiGet, getUserId, type ApiResponse } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';
import type { DayOverview, WeekOverview } from './calendar-view.ui.js';

const log = createLogger('CalendarViewLoad');

export type CalendarLoad =
  | { kind: 'ready'; connected: boolean; today: DayOverview; week: WeekOverview }
  | { kind: 'signed-out' }
  | { kind: 'offline' }
  | { kind: 'error' };

type Overview<T> = { overview?: T | null };

/** Worst case 4 s, a retry, 4 s: the spinner always ends inside the rubric's 10 s */
const WITHIN_TEN_SECONDS = { maxRetries: 1, timeout: 4000 };

/** The panel root's data-state for a load (rubric §3: loading, ready, empty or error). */
export function calendarDataState(load: CalendarLoad): 'ready' | 'empty' | 'error' {
  if (load.kind !== 'ready') return 'error';
  const days = [load.today, ...(load.week.days ?? [])];
  const nothing = days.every((day) => (day.events ?? []).length === 0);
  return nothing ? 'empty' : 'ready';
}

/** Fetch Google sync status, today and the week, and say which state the panel is in. */
export async function loadCalendar(): Promise<CalendarLoad> {
  if (!getUserId()) return { kind: 'signed-out' };

  const [status, today, week] = await Promise.all([
    apiGet<{ linked?: boolean }>('/auth/google/status', undefined, WITHIN_TEN_SECONDS), // verified caller
    apiGet<Overview<DayOverview>>('/api/calendar/today', undefined, WITHIN_TEN_SECONDS),
    apiGet<Overview<WeekOverview>>('/api/calendar/week', undefined, WITHIN_TEN_SECONDS),
  ]);

  const failed = [today, week].find((r) => !r.ok);
  if (failed) return failureState(failed);

  const todayOverview = today.data?.overview;
  const weekOverview = week.data?.overview;
  if (!Array.isArray(todayOverview?.events) || !weekOverview) {
    log.error('Calendar answered without an overview', {
      today: typeof todayOverview,
      week: typeof weekOverview,
    });
    return { kind: 'error' };
  }

  // The sync badge only: Ferni's own calendar shows whether or not Google is linked
  if (!status.ok) log.warn('Google Calendar status unavailable', { status: status.status });
  return {
    kind: 'ready',
    connected: status.ok && status.data?.linked === true,
    today: todayOverview,
    week: weekOverview,
  };
}

function failureState(res: ApiResponse<unknown>): CalendarLoad {
  if (res.offline === true || (res.status === 0 && !navigator.onLine)) return { kind: 'offline' };
  if (res.status === 401) return { kind: 'signed-out' };
  log.error('Calendar failed to load', { status: res.status, error: res.error });
  return { kind: 'error' };
}

/** Copy from menu rubric §3 (and §2: the error words of EMPTY-ERROR-STATES §7.2) */
const NOTICES: Record<'signed-out' | 'offline' | 'error', [string, string, 'sign-in' | 'retry']> = {
  'signed-out': ['calendarView.signedOut', 'calendarView.signIn', 'sign-in'],
  offline: ['calendarView.offline', 'calendarView.tryAgainShort', 'retry'],
  error: ['calendarView.somethingUnexpected', 'calendarView.tryAgainShort', 'retry'],
};

/** The body for a state that isn't the calendar itself, with its one action. */
export function calendarNoticeHtml(kind: 'signed-out' | 'offline' | 'error'): string {
  const [message, label, action] = NOTICES[kind];
  return `
    <div class="calendar-view__disconnected" data-notice="${kind}" role="status">
      <p>${t(message)}</p>
      <button class="calendar-view__provider-btn" data-notice-action="${action}">${t(label)}</button>
    </div>
  `;
}

/** Wire the notice's button: Sign in opens the sign-in gate, then loads again. */
export function bindCalendarNotice(root: HTMLElement, reload: () => void): void {
  root.querySelector<HTMLElement>('[data-notice-action]')?.addEventListener('click', (e) => {
    const action = (e.currentTarget as HTMLElement).dataset.noticeAction;
    if (action !== 'sign-in') return reload();
    void import('./sign-in-gate.ui.js')
      .then(({ showSignInGate }) => showSignInGate())
      .then(reload)
      .catch((error: unknown) => log.error('Sign-in gate failed to open', { error }));
  });
}
