/**
 * When a held call rings, in the words the model repeats: the time where the
 * person being called is, and the caller's own time, both worked out here.
 *
 * Prod call 2026-10-24 (phone-calls audit row 4): the result said only
 * "9:00 AM their time", so the model converted it itself and got it wrong
 * ("nine our time, ten for her" for what was 11 AM the caller's time).
 *
 * @module services/outreach/held-call-clocks
 */

import { isValidTimezone } from './call-hours-guard.js';

/** The day ("later today", "tomorrow", a weekday) and the clock time, in `timeZone`. */
function whenParts(at: Date, timeZone: string, now: Date): { day: string; time: string } {
  const date = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(d);
  const tomorrow = date(new Date(now.getTime() + 86_400_000));
  const day =
    date(at) === date(now)
      ? 'later today'
      : date(at) === tomorrow
        ? 'tomorrow'
        : new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(at);
  const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' });
  return { day, time: time.format(at) };
}

/** When a held call rings, in the recipient's time: "later today at 9:00 AM", "tomorrow at …". */
export function spokenWhen(at: Date, timeZone: string, now: Date): string {
  const { day, time } = whenParts(at, timeZone, now);
  return `${day} at ${time}`;
}

/** The clock time alone, e.g. "11:40 PM", in `timeZone`. */
export function clockAt(at: Date, timeZone: string): string {
  return whenParts(at, timeZone, at).time;
}

/**
 * "later today at 9:00 AM Mom's time, 11:00 AM yours". The caller's day is
 * said only when it differs ("tomorrow at 1:00 AM yours"). With the caller's
 * zone unknown, "… their time", as before.
 */
export function bothClocks(
  at: Date,
  calleeZone: string,
  calleeName: string | undefined,
  callerZone: string | undefined,
  now: Date
): string {
  const theirs = whenParts(at, calleeZone, now);
  const said = `${theirs.day} at ${theirs.time}`;
  if (!isValidTimezone(callerZone)) return `${said} their time`;
  const yours = whenParts(at, callerZone, now);
  const name = calleeName?.trim();
  const whose = name ? `${name}'s` : 'their';
  if (yours.day === theirs.day && yours.time === theirs.time) {
    return `${said}, ${whose} time and yours`;
  }
  const yoursSaid = yours.day === theirs.day ? yours.time : `${yours.day} at ${yours.time}`;
  return `${said} ${whose} time, ${yoursSaid} yours`;
}

/** Appended wherever both clocks are given, so the model repeats rather than converts. */
export const SAY_CLOCKS_AS_WRITTEN = ' Both times are already worked out: say them as written.';
