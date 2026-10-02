/**
 * Calendar math for important dates: civil (time-zone free) days, the user's
 * local "today", next yearly occurrence (Feb 29 → Feb 28 in non-leap years),
 * local time → UTC instant, and quiet hours. Pure functions, no I/O.
 *
 * @module services/important-dates/date-math
 */

/** A calendar day with no time zone attached. Month is 1-12. */
export interface CivilDate {
  year: number;
  month: number;
  day: number;
}

/** A stored date: year is absent for recurring `--MM-DD` dates. */
export interface StoredDateParts {
  year?: number;
  month: number;
  day: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Whether month/day can exist in some year (Feb 29 allowed). */
export function isValidMonthDay(month: number, day: number): boolean {
  if (!Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(2000, month); // 2000 is a leap year
}

export function isValidCivil(d: CivilDate): boolean {
  return (
    Number.isInteger(d.year) &&
    d.year >= 1 &&
    d.year <= 9999 &&
    isValidMonthDay(d.month, d.day) &&
    d.day <= daysInMonth(d.year, d.month)
  );
}

const pad = (n: number, w = 2): string => String(n).padStart(w, '0');

export function formatCivil(d: CivilDate): string {
  return `${pad(d.year, 4)}-${pad(d.month)}-${pad(d.day)}`;
}

/** Parse a stored date: `YYYY-MM-DD` or `--MM-DD`. Returns null when invalid. */
export function parseStoredDate(value: string): StoredDateParts | null {
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (full) {
    const d = { year: Number(full[1]), month: Number(full[2]), day: Number(full[3]) };
    return isValidCivil(d) ? d : null;
  }
  const md = /^--(\d{2})-(\d{2})$/.exec(value);
  if (md) {
    const month = Number(md[1]);
    const day = Number(md[2]);
    return isValidMonthDay(month, day) ? { month, day } : null;
  }
  return null;
}

export function formatStoredDate(parts: StoredDateParts): string {
  return parts.year === undefined
    ? `--${pad(parts.month)}-${pad(parts.day)}`
    : formatCivil({ year: parts.year, month: parts.month, day: parts.day });
}

function toUtcMs(d: CivilDate): number {
  return Date.UTC(d.year, d.month - 1, d.day);
}

/** Whole days from `a` to `b` (negative when b is earlier). */
export function daysBetween(a: CivilDate, b: CivilDate): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / DAY_MS);
}

export function addDays(d: CivilDate, days: number): CivilDate {
  const t = new Date(toUtcMs(d) + days * DAY_MS);
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

export function compareCivil(a: CivilDate, b: CivilDate): number {
  return toUtcMs(a) - toUtcMs(b);
}

/** The month/day in a given year; Feb 29 falls on Feb 28 in non-leap years. */
export function inYear(month: number, day: number, year: number): CivilDate {
  return { year, month, day: Math.min(day, daysInMonth(year, month)) };
}

/**
 * The date's occurrence on or after `from`. Recurring dates repeat yearly; a
 * one-off date occurs once (null when it has passed).
 */
export function nextOccurrence(
  parts: StoredDateParts,
  recurring: boolean,
  from: CivilDate
): CivilDate | null {
  if (!recurring) {
    if (parts.year === undefined) return null;
    const once = { year: parts.year, month: parts.month, day: parts.day };
    return compareCivil(once, from) >= 0 ? once : null;
  }
  const startYear = parts.year !== undefined ? Math.max(parts.year, from.year) : from.year;
  for (let year = startYear; year <= startYear + 1; year++) {
    const candidate = inYear(parts.month, parts.day, year);
    if (compareCivil(candidate, from) >= 0) return candidate;
  }
  return inYear(parts.month, parts.day, startYear + 2);
}

// ============================================================================
// TIME ZONES
// ============================================================================

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

interface LocalParts extends CivilDate {
  hour: number;
  minute: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    formatterCache.set(tz, f);
  }
  return f;
}

/** Wall-clock parts of an instant in a time zone. */
export function localParts(instant: Date, tz: string): LocalParts {
  const out: Record<string, number> = {};
  for (const p of formatterFor(tz).formatToParts(instant)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour === 24 ? 0 : out.hour,
    minute: out.minute,
  };
}

/** The user's local calendar day at `instant`. */
export function localToday(instant: Date, tz: string): CivilDate {
  const p = localParts(instant, tz);
  return { year: p.year, month: p.month, day: p.day };
}

/** Parse 'HH:MM' to minutes after midnight; null when malformed. */
export function parseClock(value: string): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** The UTC instant of a local wall-clock time (gaps resolve forward). */
export function zonedTimeToUtc(day: CivilDate, minutesAfterMidnight: number, tz: string): Date {
  const wall = toUtcMs(day) + minutesAfterMidnight * 60 * 1000;
  let guess = wall;
  for (let i = 0; i < 3; i++) {
    const p = localParts(new Date(guess), tz);
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    const diff = wall - seen;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

/** Whether a local time (minutes after midnight) falls in quiet hours. */
export function isWithinQuietHours(minutes: number, startMin: number, endMin: number): boolean {
  if (startMin === endMin) return false;
  return startMin < endMin
    ? minutes >= startMin && minutes < endMin
    : minutes >= startMin || minutes < endMin;
}
