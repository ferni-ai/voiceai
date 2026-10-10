/**
 * Calendar days in the caller's timezone, and how a friend would say them.
 *
 * @module intelligence/world-model/temporal/dates
 */

const DAY_MS = 86_400_000;

/** YYYY-MM-DD of `when` in `timeZone` (UTC when unknown or invalid). */
export function localDay(when: Date | string, timeZone?: string): string {
  const date = typeof when === 'string' ? new Date(when) : when;
  const format = (tz: string) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  try {
    return format(timeZone || 'UTC');
  } catch {
    return format('UTC');
  }
}

/** Whole days from `from` to `to`, both YYYY-MM-DD. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

/** "today", "yesterday", "tomorrow", a weekday within six days, else "Oct 13". */
export function sayDay(day: string, today: string): string {
  const diff = daysBetween(today, day);
  if (diff === 0) return 'today';
  if (diff === -1) return 'yesterday';
  if (diff === 1) return 'tomorrow';
  const date = new Date(`${day}T12:00:00.000Z`);
  if (Math.abs(diff) <= 6) {
    return date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
