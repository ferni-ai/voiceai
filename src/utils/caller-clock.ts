/**
 * Whose clock a time-of-day read uses: the caller's or the server's.
 *
 * The agent server runs in UTC, so reads of `new Date().getHours()` put 6 pm
 * Eastern at 23:00, "late night" (#2167), and counting 24-hour blocks made a
 * call at 11:30 pm and the next morning's call "earlier today" (#2278). With
 * CALLER_CLOCK_TIME_OF_DAY on, readers that know the call's zone use it; off,
 * or with no valid zone, they keep the server clock exactly as before.
 *
 * @module utils/caller-clock
 */
import { flagOn, type Env } from '../config/env-flag.js';
import { isValidTimeZone } from './time-zone.js';

export function callerClockEnabled(env: Env = process.env): boolean {
  return flagOn('CALLER_CLOCK_TIME_OF_DAY', env);
}

/** The zone to read the clock in, or undefined (flag off, or no valid zone). */
export function callerClockZone(timeZone: unknown, env: Env = process.env): string | undefined {
  return callerClockEnabled(env) && isValidTimeZone(timeZone) ? timeZone : undefined;
}
