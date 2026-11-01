/**
 * The conversations recentContext may talk about for the timeframe it was asked (#2757).
 *
 * getHistory takes only a limit, so "what did we talk about today" answered with the last 20
 * sessions, last month's included, under the label "Timeframe: today". With
 * RECENT_CONTEXT_TIMEFRAME=on the sessions are kept only when their date falls inside the
 * timeframe's window in the call's own zone (userTimeZone; for a phone call, phone-parity.ts records
 * the account's zone only when the caller is its verified owner):
 *
 * - today: since local midnight; yesterday: the local day before
 * - this-week: the last 7 local days, today included; last-week: the 7 days before those
 * - this-month: since the 1st of the local month; all-time: everything fetched
 *
 * With no zone at all (a phone caller who is not the verified owner) a calendar day would be UTC's, and a 9 PM Eastern
 * caller's 3 PM session is "yesterday" there. So no day is guessed: the window rolls back from
 * now instead (today: 24 h, yesterday: the 24 h before, this-week: 7 days, last-week: the 7
 * before, this-month: 30 days).
 *
 * Off, the reply is what it was: the last 20 sessions whatever the timeframe.
 *
 * @module tools/domains/simple-utilities/recent-context-window
 */

import { flagOn } from '../../../config/env-flag.js';
import { userTimeZone } from '../../../utils/caller-time-zone.js';
import { isValidTimeZone, wallTimeIn, zonedWallTimeToUtc } from '../../../utils/time-zone.js';

export type RecentTimeframe =
  'today' | 'yesterday' | 'this-week' | 'last-week' | 'this-month' | 'all-time';

/** Sessions read when the window filters: getHistory's own default, so a week or month fits. */
const WINDOW_FETCH = 50;
/** What the tool read before the window existed (flag off). */
const UNFILTERED_FETCH = 20;

const HOUR_MS = 3_600_000;
/** Rolling windows, in hours back from now, for a caller whose zone is unknown: [start, end). */
const ROLLING_HOURS: Record<Exclude<RecentTimeframe, 'all-time'>, [number, number]> = {
  today: [24, 0],
  yesterday: [48, 24],
  'this-week': [7 * 24, 0],
  'last-week': [14 * 24, 7 * 24],
  'this-month': [30 * 24, 0],
};

/** [start, end) of a timeframe in the zone (rolling back from now with none); null for all-time. */
function timeframeWindow(
  timeframe: RecentTimeframe,
  zone: string | undefined,
  now: Date = new Date()
): { start: Date; end: Date } | null {
  if (timeframe === 'all-time') return null;
  if (!isValidTimeZone(zone)) {
    const [from, to] = ROLLING_HOURS[timeframe];
    return {
      start: new Date(now.getTime() - from * HOUR_MS),
      end: new Date(to === 0 ? now.getTime() + 1 : now.getTime() - to * HOUR_MS),
    };
  }
  const tz = zone;
  const { year, month, day } = wallTimeIn(now, tz);
  // Local midnight `back` days ago; Date.UTC rolls day 0 and below into the month before.
  const midnight = (back: number, d = day): Date =>
    zonedWallTimeToUtc({ year, month, day: d - back, hour: 0, minute: 0 }, tz);
  const tomorrow = midnight(-1);
  switch (timeframe) {
    case 'today':
      return { start: midnight(0), end: tomorrow };
    case 'yesterday':
      return { start: midnight(1), end: midnight(0) };
    case 'this-week':
      return { start: midnight(6), end: tomorrow };
    case 'last-week':
      return { start: midnight(13), end: midnight(6) };
    case 'this-month':
      return { start: midnight(0, 1), end: tomorrow };
  }
}

/** The sessions whose date falls inside the timeframe's window; undated ones are left out. */
export function sessionsInTimeframe<S extends { date: string }>(
  sessions: readonly S[],
  timeframe: RecentTimeframe,
  zone: string | undefined,
  now: Date = new Date()
): S[] {
  const window = timeframeWindow(timeframe, zone, now);
  if (!window) return [...sessions];
  return sessions.filter((s) => {
    const at = new Date(s.date).getTime();
    return at >= window.start.getTime() && at < window.end.getTime();
  });
}

/**
 * The caller's conversation history for recentContext: inside the timeframe with the flag on,
 * else the last 20 sessions as before. `outsideWindow` counts the sessions read and left out,
 * so an empty answer can tell "none in this window" from "none at all". Throws when the store
 * can't be read, as getHistory does.
 */
export async function historyInTimeframe(
  ids: { userId: string; sessionId?: string },
  timeframe: RecentTimeframe,
  now: Date = new Date()
) {
  const { getConversationHistoryService } =
    await import('../../../services/stores/conversation-history.js');
  const store = getConversationHistoryService();
  if (!flagOn('RECENT_CONTEXT_TIMEFRAME')) return store.getHistory(ids.userId, UNFILTERED_FETCH);
  const history = await store.getHistory(ids.userId, WINDOW_FETCH);
  const zone = userTimeZone(ids);
  const sessions = sessionsInTimeframe(history.sessions, timeframe, zone, now);
  return { ...history, sessions, outsideWindow: history.sessions.length - sessions.length };
}
