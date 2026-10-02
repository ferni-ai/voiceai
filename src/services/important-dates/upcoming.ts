/**
 * Upcoming important dates in the user's time zone.
 *
 * @module services/important-dates/upcoming
 */

import { success, type Result } from '../../types/result.js';
import {
  daysBetween,
  formatCivil,
  localToday,
  nextOccurrence,
  parseStoredDate,
  type CivilDate,
} from './date-math.js';
import { listImportantDates } from './store.js';
import { resolveTimeZone } from './settings.js';
import type { ImportantDateError, ImportantDateRecord, UpcomingDate } from './types.js';

/** Occurrence info for one record relative to `today` (pure). */
export function upcomingFor(
  record: ImportantDateRecord,
  today: CivilDate,
  withinDays: number
): UpcomingDate | null {
  const parts = parseStoredDate(record.date);
  if (!parts) return null;
  const occ = nextOccurrence(parts, record.recurring, today);
  if (!occ) return null;
  const daysUntil = daysBetween(today, occ);
  if (daysUntil > withinDays) return null;
  const yearsSince =
    record.recurring && parts.year !== undefined && occ.year > parts.year
      ? occ.year - parts.year
      : undefined;
  return {
    record,
    occursOn: formatCivil(occ),
    daysUntil,
    ...(yearsSince !== undefined ? { yearsSince } : {}),
  };
}

/** Sort and filter records into upcoming dates (pure). */
export function selectUpcoming(
  records: readonly ImportantDateRecord[],
  today: CivilDate,
  withinDays: number
): UpcomingDate[] {
  return records
    .map((r) => upcomingFor(r, today, withinDays))
    .filter((u): u is UpcomingDate => u !== null)
    .sort((a, b) => a.daysUntil - b.daysUntil || a.record.title.localeCompare(b.record.title));
}

/** Dates occurring within `withinDays` (0 = today only), soonest first. */
export async function getUpcomingDates(
  userId: string,
  withinDays: number,
  now: Date = new Date()
): Promise<Result<UpcomingDate[], ImportantDateError>> {
  const listed = await listImportantDates(userId);
  if (!listed.success) return listed;
  const tz = await resolveTimeZone(userId);
  const window = Math.max(0, Math.min(366, Math.floor(withinDays)));
  return success(selectUpcoming(listed.data, localToday(now, tz), window));
}
