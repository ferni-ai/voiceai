/**
 * Ferni's own clock, next to the caller's.
 *
 * The date/time section (time-context.ts) gives the caller's time, or none on
 * a phone call (no browser zone), and asks Ferni to keep his own day "in step"
 * with it. Nothing told him what time it was for HIM, so he filled his day
 * from the backstory ("still wakes around five"): on a prod call at 1:47 am
 * Sunday mountain time (3:47 am for the caller) he said he was up early, that
 * it was five am on a Sunday, and later that he usually spends the afternoon
 * on the mail (prod, 2026-10-11).
 *
 * With FERNI_LOCAL_CLOCK=on, Ferni's section states his local day and time in
 * his home zone, names the part of the day without the words for any other
 * part, frames the five-o'clock routine as a habit, and gives the caller's
 * time when it is known (the zone the call settled: browser, else a verified owner's).
 * Off: the session prompt is unchanged.
 *
 * @module agents/shared/local-clock
 */

import { callerHour, isValidTimeZone, partOfDay } from './time-context.js';

/** Ferni's home: Wyoming and Utah are both on mountain time. */
export const FERNI_HOME_TIME_ZONE = 'America/Denver';

export function localClockEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.FERNI_LOCAL_CLOCK === 'on';
}

function dayAndTime(now: Date, timeZone: string): { weekday: string; date: string; time: string } {
  const fmt = (o: Intl.DateTimeFormatOptions): string =>
    new Intl.DateTimeFormat('en-US', { ...o, timeZone }).format(now);
  return {
    weekday: fmt({ weekday: 'long' }),
    date: fmt({ month: 'long', day: 'numeric', year: 'numeric' }),
    time: fmt({ hour: 'numeric', minute: '2-digit', hour12: true }),
  };
}

/** "the middle of the night" before five, else the plain part of the day. */
function partLabel(hour: number): string {
  return hour < 5 ? 'the middle of the night' : partOfDay(hour);
}

/** One line: Ferni's own day and time (mountain time), and how to talk about his day. */
export function ferniClockLine(now: Date): string {
  const { weekday, date, time } = dayAndTime(now, FERNI_HOME_TIME_ZONE);
  const hour = callerHour(now, FERNI_HOME_TIME_ZONE) ?? 12;
  const part = partLabel(hour);
  const when = hour < 5 || hour >= 21 ? 'at night' : `in the ${part}`;
  const awake = hour < 5 ? " If you're awake, you're up late or can't sleep, not up early." : '';
  return (
    `For you it's ${weekday}, ${date}, ${time} mountain time: ${part}. ` +
    `Anything you say about your own day is happening now, ${when}.${awake} ` +
    'Waking around five is a habit of yours, not what is happening right now unless it is that hour.'
  );
}

/**
 * The prompt's date/time section with Ferni's clock first, then the caller's
 * when the zone is known. Replaces timeContext() for Ferni when the flag is on.
 */
export function localClockContext(now: Date, callerTimeZone?: string): string {
  let caller: string;
  if (isValidTimeZone(callerTimeZone)) {
    const { weekday, time } = dayAndTime(now, callerTimeZone);
    const hour = callerHour(now, callerTimeZone) ?? 12;
    caller = `For the caller it's ${weekday}, ${time} (${callerTimeZone}): ${partLabel(hour)}.`;
  } else {
    caller =
      "You don't know the caller's local time: don't assume the time of day for them. If it matters, ask.";
  }
  return `
---

## Current Date & Time

${ferniClockLine(now)}
${caller}
Use this naturally; don't announce it unless asked. If someone asks what day or time it is, you know the answer.
`;
}
