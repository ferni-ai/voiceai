/**
 * Journal streaks: the run the user is on now, and their best run.
 *
 * The old loop raised "current streak" to the length of any later run it found,
 * so after a gap it reported the longest old run as the current one. The current
 * streak is the consecutive days ending today or yesterday; anything else is 0.
 *
 * @module services/journal/streaks
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD for an instant in a time zone (UTC when none, or an unknown one, is given). */
function dayKey(ms: number, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

/** Whole days between two YYYY-MM-DD keys (b after a). */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

export function journalStreaks(
  entryDates: Date[],
  now: Date = new Date(),
  timeZone?: string
): { currentStreak: number; longestStreak: number } {
  const days = [...new Set(entryDates.map((d) => dayKey(d.getTime(), timeZone)))].sort();
  if (days.length === 0) return { currentStreak: 0, longestStreak: 0 };

  let longestStreak = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = daysBetween(days[i - 1]!, days[i]!) === 1 ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
  }

  // `run` is now the run ending on the latest entry day; it is current only if that day
  // is today or yesterday
  const sinceLatest = daysBetween(days[days.length - 1]!, dayKey(now.getTime(), timeZone));
  return { currentStreak: sinceLatest <= 1 ? run : 0, longestStreak };
}
