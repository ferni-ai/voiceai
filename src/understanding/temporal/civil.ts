/**
 * The caller's calendar. A wall time in their zone is held as "naive" ms
 * (Date.UTC of its fields), so adding days is plain arithmetic that DST never
 * shifts; only toInstant() consults the zone. Node 22 has no Temporal.
 * @module understanding/temporal/civil
 */
import { isValidTimeZone, wallTimeIn, zonedWallTimeToUtc } from '../../utils/time-zone.js';

export const [MINUTE_MS, HOUR_MS, DAY_MS] = [60_000, 3_600_000, 86_400_000];

export type Naive = number;
export type Precision = 'day' | 'part_of_day' | 'hour' | 'week' | 'span';
export type Certainty = 'exact' | 'assumed' | 'ambiguous';
/** Plans resolve forward, reports of what happened backward. */
export type Tense = 'future' | 'past';

/** An interval on the caller's wall clock, end exclusive; canonical = the rule and its inputs. */
export interface CivilTime {
  start: Naive;
  end: Naive;
  precision: Precision;
  certainty: Certainty;
  canonical: string;
}

/** today = 00:00 of the day it was said, caller-local. */
export interface RuleContext {
  today: Naive;
  tense: Tense;
}

export const interval = (
  start: Naive,
  end: Naive,
  precision: Precision,
  certainty: Certainty,
  canonical: string
): CivilTime => ({ start, end, precision, certainty, canonical });

export const day = (start: Naive, certainty: Certainty, canonical: string): CivilTime =>
  interval(start, start + DAY_MS, 'day', certainty, canonical);

export const zoneOrUtc = (tz?: string): string => (isValidTimeZone(tz) ? tz : 'UTC');

export function toNaive(instant: number, zone: string): Naive {
  const w = wallTimeIn(new Date(instant), zone);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
}

/** The instant the caller's clock shows this wall time (DST included). */
export function toInstant(naive: Naive, zone: string): number {
  const [year, month, d, hour, minute] = new Date(naive).toISOString().split(/[-T:]/).map(Number);
  return zonedWallTimeToUtc({ year, month, day: d, hour, minute }, zone).getTime();
}

export const midnight = (n: Naive): Naive => n - (((n % DAY_MS) + DAY_MS) % DAY_MS);
export const weekdayOf = (n: Naive): number => new Date(n).getUTCDay();
/** Monday = 0 .. Sunday = 6. */
export const isoIndex = (weekday: number): number => (weekday + 6) % 7;
/** month0 may overflow (12 = next January). */
export const daysInMonth = (year: number, month0: number): number =>
  new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
export const ymd = (n: Naive): string => new Date(n).toISOString().slice(0, 10);

/** An ISO week, Monday 00:00 to the next Monday 00:00. */
export function weekContaining(at: Naive, certainty: Certainty, canonical: string): CivilTime {
  const start = midnight(at) - isoIndex(weekdayOf(at)) * DAY_MS;
  return interval(start, start + 7 * DAY_MS, 'week', certainty, canonical);
}
