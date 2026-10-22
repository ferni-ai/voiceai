/**
 * "Right now": one short line of the caller's time, recomputed every reply.
 *
 * Ferni told a dev caller it was "just past seven fifteen in the evening" at
 * 3:18 pm Eastern (2026-10-11). The session prompt had the caller's time, but
 * only as of the call's start, and every later turn's context note
 * (behavioral/awareness.ts) stated the server's clock: LiveKit Cloud runs in
 * UTC, and the note looked the zone up on fields the call never sets. The
 * fresher, wrong clock won.
 *
 * With WORLD_NOW=on each reply's turn reminder (turn-request.ts) starts with
 * this line: the caller's day, date and time with the part of the day, Ferni's
 * own clock when FERNI_LOCAL_CLOCK=on, a holiday if there is one, and the
 * weather at the home the caller saved, from a cache refreshed in the
 * background (no I/O here). The context note drops its UTC clock. Everything
 * else about the world (news, games, the forecast) is looked up with a tool
 * when the talk goes there (WORLD_NOW_RULE). Off: nothing changes.
 *
 * @module agents/shared/world-now
 */

import { cachedHomeWeather } from '../../services/world-awareness/index.js';
import { HOUR_SAID, leaveTheHourOut, type CallTalk } from './hour-once.js';
import { FERNI_HOME_TIME_ZONE, localClockEnabled } from './local-clock.js';
import { callerHour, isValidTimeZone, partOfDay } from './time-context.js';

export function worldNowEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.WORLD_NOW === 'on';
}

/** Added once to the session prompt's date/time section when WORLD_NOW=on. */
export const WORLD_NOW_RULE =
  "The time in each turn's 'Right now' line is current; it beats the time above. " +
  "You don't know today's news, scores or weather unless a tool tells you: when they come up, look them up (getNews, getSports, getWeather) instead of guessing, and never make one up.";

const fmt = (now: Date, timeZone: string, o: Intl.DateTimeFormatOptions): string =>
  new Intl.DateTimeFormat('en-US', { ...o, timeZone }).format(now);

/** The nth (1-based; -1 = last) weekday (0 = Sunday) of a month, as a day of the month. */
function nthWeekday(year: number, month: number, weekday: number, n: number): number {
  if (n > 0) {
    const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay();
  return lastDay - ((last - weekday + 7) % 7);
}

/** The US holiday or notable date on this local date, if any. */
export function holidayOn(year: number, month: number, day: number): string | undefined {
  const fixed: Record<string, string> = {
    '1-1': "New Year's Day",
    '2-14': "Valentine's Day",
    '3-17': "St. Patrick's Day",
    '6-19': 'Juneteenth',
    '7-4': 'the Fourth of July',
    '10-31': 'Halloween',
    '11-11': 'Veterans Day',
    '12-24': 'Christmas Eve',
    '12-25': 'Christmas',
    '12-31': "New Year's Eve",
  };
  const moving: Array<[number, number, number, string]> = [
    [1, 1, 3, 'Martin Luther King Jr. Day'],
    [2, 1, 3, "Presidents' Day"],
    [5, 0, 2, "Mother's Day"],
    [5, 1, -1, 'Memorial Day'],
    [6, 0, 3, "Father's Day"],
    [9, 1, 1, 'Labor Day'],
    [11, 4, 4, 'Thanksgiving'],
  ];
  const hit = moving.find(([m, wd, n]) => m === month && nthWeekday(year, m, wd, n) === day);
  return hit?.[3] ?? fixed[`${month}-${day}`];
}

/** "68°F, mostly cloudy" from the weather tool's "Right now in X: 68°F with mostly cloudy, ...". */
export function shortWeather(report: string | undefined): string | undefined {
  const m = report?.match(/(-?\d+)°F with ([a-z ]+?)(?:[,.]|$)/i);
  return m ? `${m[1]}°F, ${m[2].trim().toLowerCase()}` : undefined;
}

export interface RightNowInputs {
  now: Date;
  /** The caller's IANA zone, when known (browser, else their profile). */
  callerZone?: string;
  /** FERNI_LOCAL_CLOCK=on: Ferni's own mountain time too. */
  ferniClock?: boolean;
  /** The weather report for the home the caller saved, if cached. */
  homeWeather?: string;
  /** HOUR_ONCE=on and the hour already came up: the day without the clock (hour-once.ts). */
  hourSaid?: boolean;
}

/** The line itself: ~25-40 tokens. Pure: the clock and zone are inputs. */
export function rightNowLine(p: RightNowInputs): string {
  const zone = isValidTimeZone(p.callerZone) ? p.callerZone : undefined;
  const tz = zone ?? 'UTC';
  const day = fmt(p.now, tz, { weekday: 'long', month: 'short', day: 'numeric' });
  const time = fmt(p.now, tz, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const parts = p.hourSaid
    ? [`Right now${zone ? ' for the caller' : ''}: ${day}. ${HOUR_SAID}`]
    : [
        zone
          ? `Right now for the caller: ${day}, ${time}, ${partOfDay(callerHour(p.now, zone) ?? 12)}.`
          : `Right now: ${day}, ${time}; the caller's local time is unknown, so ask before assuming it.`,
      ];
  if (p.ferniClock && !p.hourSaid) {
    const mine = fmt(p.now, FERNI_HOME_TIME_ZONE, { hour: 'numeric', minute: '2-digit' });
    parts.push(`For you: ${mine} mountain.`);
  }
  if (zone?.startsWith('America/')) {
    // "10/11/2026": month/day/year in the caller's zone, so the holiday is their date's.
    const [month, date, year] = fmt(p.now, zone, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    })
      .split('/')
      .map(Number);
    const today = holidayOn(year, month, date);
    if (today) parts.push(`Today is ${today}.`);
  }
  const weather = shortWeather(p.homeWeather);
  if (weather) parts.push(`At their home: ${weather}.`);
  return parts.join(' ');
}

interface SessionView {
  userData?: {
    callerTimezone?: string;
    services?: { userId?: string };
  };
}

/**
 * The caller's zone for this call: the one the call already reads a time in.
 * That is the browser's, or a verified owner's profile zone that phone-parity.ts
 * hands the call (PHONE_PARITY=on); never an unverified caller's or a sponsor's.
 * A profile zone reaches a call only through phone-parity.ts.
 */
export function callerZoneOf(session: object): string | undefined {
  return (session as SessionView).userData?.callerTimezone;
}

/**
 * The turn reminder's line; '' when WORLD_NOW is off. No I/O: the weather is read from the cache.
 * `talk` (the chat so far and the caller's words) lets HOUR_ONCE leave the hour out.
 */
export function worldNowNote(session: object, now: Date = new Date(), talk?: CallTalk): string {
  if (!worldNowEnabled()) return '';
  const userId = (session as SessionView).userData?.services?.userId;
  return rightNowLine({
    now,
    callerZone: callerZoneOf(session),
    ferniClock: localClockEnabled(),
    homeWeather: userId ? cachedHomeWeather(userId) : undefined,
    hourSaid: leaveTheHourOut(talk),
  });
}
