/**
 * Calendar days between two instants in the user's zone.
 *
 * "Yesterday" in a prompt used to mean "24 to 48 hours ago": a call at 11pm and
 * one at 9am the next day were "earlier today", and a call at 9am two days ago
 * could be "yesterday". These count calendar days where the user lives.
 *
 * @module utils/calendar-days
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight UTC of the calendar date `ms` falls on in `timeZone` (UTC for none or unknown). */
function calendarDateUtc(ms: number, timeZone?: string): number {
  if (!Number.isFinite(ms)) return Number.NaN;
  try {
    const key = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(ms));
    return Date.parse(`${key}T00:00:00Z`);
  } catch {
    return timeZone ? calendarDateUtc(ms) : Number.NaN; // an unknown zone falls back to UTC
  }
}

/** 0 = same calendar day, 1 = yesterday, ...; never negative. */
export function calendarDaysSince(
  from: Date | number | string,
  now: Date | number = Date.now(),
  timeZone?: string
): number {
  const a = calendarDateUtc(new Date(from).getTime(), timeZone);
  const b = calendarDateUtc(new Date(now).getTime(), timeZone);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.round((b - a) / DAY_MS)) : 0;
}
