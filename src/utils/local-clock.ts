/**
 * The caller's local clock.
 *
 * The agent runs in UTC; a friend's "good evening" and a late-night softness
 * belong to the caller's evening, not the server's. The browser sends its
 * IANA timezone with the token request; everything time-of-day reads it here
 * and falls back to server time when it is missing or invalid.
 *
 * @module utils/local-clock
 */

export type PartOfDay = 'late night' | 'morning' | 'afternoon' | 'evening' | 'late evening';

export interface LocalClock {
  /** 0-23 in the caller's timezone. */
  hour: number;
  /** 0 = Sunday. */
  dayOfWeek: number;
  partOfDay: PartOfDay;
  /** The timezone used, or undefined when falling back to server time. */
  timezone?: string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** True for a timezone the runtime can format in (e.g. "America/Denver"). */
export function isValidTimezone(timezone: unknown): timezone is string {
  if (typeof timezone !== 'string' || timezone.length === 0 || timezone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function partOfDayFor(hour: number): PartOfDay {
  if (hour < 5) return 'late night';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 22) return 'evening';
  return 'late evening';
}

export function localClock(timezone?: string, now: Date = new Date()): LocalClock {
  if (isValidTimezone(timezone)) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hourCycle: 'h23',
      weekday: 'short',
    }).formatToParts(now);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value);
    const dayOfWeek = WEEKDAYS.indexOf(parts.find((p) => p.type === 'weekday')?.value ?? '');
    if (Number.isInteger(hour) && dayOfWeek >= 0) {
      return { hour, dayOfWeek, partOfDay: partOfDayFor(hour), timezone };
    }
  }
  const hour = now.getHours();
  return { hour, dayOfWeek: now.getDay(), partOfDay: partOfDayFor(hour) };
}

/** The caller's timezone from room/job metadata (JSON string or object), if valid. */
export function timezoneFromMetadata(metadata: unknown): string | undefined {
  let parsed: unknown = metadata;
  if (typeof metadata === 'string') {
    try {
      parsed = JSON.parse(metadata);
    } catch {
      return undefined;
    }
  }
  const tz = (parsed as { timezone?: unknown } | null)?.timezone;
  return isValidTimezone(tz) ? tz : undefined;
}

/**
 * The calendar day of a moment in the caller's timezone, as days since
 * 1970-01-01 (so two moments' difference is how many days apart they felt).
 */
export function localDayNumber(at: Date, timezone?: string): number {
  if (isValidTimezone(timezone)) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(at);
    const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const [y, m, d] = [part('year'), part('month'), part('day')];
    if ([y, m, d].every(Number.isInteger)) return Date.UTC(y, m - 1, d) / 86_400_000;
  }
  return Date.UTC(at.getFullYear(), at.getMonth(), at.getDate()) / 86_400_000;
}

/** The weekday name of a moment in the caller's timezone ("Tuesday"). */
export function localWeekday(at: Date, timezone?: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    ...(isValidTimezone(timezone) ? { timeZone: timezone } : {}),
  }).format(at);
}

/** The caller's calendar date: month 0-11, date 1-31. */
export function localDate(timezone?: string, now: Date = new Date()): { month: number; date: number } {
  if (isValidTimezone(timezone)) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(now);
    const month = Number(parts.find((p) => p.type === 'month')?.value) - 1;
    const date = Number(parts.find((p) => p.type === 'day')?.value);
    if (Number.isInteger(month) && Number.isInteger(date)) return { month, date };
  }
  return { month: now.getMonth(), date: now.getDate() };
}
