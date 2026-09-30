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
