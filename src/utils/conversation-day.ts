/**
 * Calendar days (UTC) from call-summary timestamps in any stored shape. Pure, so
 * both the storage read (memory/storage/conversation-days.ts) and the streak
 * count (services/social/team-unlocks.ts) can use it.
 *
 * @module utils/conversation-day
 */

/** YYYY-MM-DD (UTC) for a summary timestamp in any stored shape; null when unreadable. */
export function dayOf(value: unknown): string | null {
  let date: Date | null = null;
  if (value instanceof Date) date = value;
  else if (typeof value === 'string' || typeof value === 'number') date = new Date(value);
  else if (value && typeof value === 'object') {
    const ts = value as { toDate?: () => Date; _seconds?: number; seconds?: number };
    if (typeof ts.toDate === 'function') date = ts.toDate();
    else if (typeof ts._seconds === 'number') date = new Date(ts._seconds * 1000);
    else if (typeof ts.seconds === 'number') date = new Date(ts.seconds * 1000);
  }
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

/** Distinct days, oldest first. */
export function distinctDays(timestamps: unknown[]): string[] {
  const days = new Set<string>();
  for (const t of timestamps) {
    const day = dayOf(t);
    if (day) days.add(day);
  }
  return [...days].sort();
}
