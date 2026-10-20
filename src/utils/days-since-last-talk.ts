/**
 * How many days ago the last call was, for "earlier today" / "yesterday" lines.
 *
 * The greeting and the awareness block counted whole 24-hour blocks, so a call
 * at 5:29 pm the evening before read as "earlier today" at 5:24 am, and Ferni
 * opened with "Back for round two today, huh?" (prod 2026-10-20, #2278).
 * AWARENESS_LOCAL_DAYS=on (default off) counts calendar days in the caller's
 * zone instead. Without the flag, or without a known zone, the count is the
 * 24-hour one, unchanged.
 *
 * @module utils/days-since-last-talk
 */

import { isValidTimeZone, wallTimeIn } from './time-zone.js';

type Env = Record<string, string | undefined>;

const DAY_MS = 86_400_000;

export function awarenessLocalDaysEnabled(env: Env = process.env): boolean {
  return env.AWARENESS_LOCAL_DAYS === 'on';
}

/** The caller's calendar date of an instant, as a UTC midnight in ms. */
function localDayMs(instant: Date, zone: string): number {
  const w = wallTimeIn(instant, zone);
  return Date.UTC(w.year, w.month - 1, w.day);
}

/** Days from the last call to now: calendar days in the zone with the flag on, else 24-hour blocks. */
export function daysSinceLastTalk(
  lastContact: Date,
  now: Date,
  timeZone?: unknown,
  env: Env = process.env
): number {
  if (awarenessLocalDaysEnabled(env) && isValidTimeZone(timeZone)) {
    return Math.round((localDayMs(now, timeZone) - localDayMs(lastContact, timeZone)) / DAY_MS);
  }
  return Math.floor((now.getTime() - lastContact.getTime()) / DAY_MS);
}
