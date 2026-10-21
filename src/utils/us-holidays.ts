/**
 * Moveable US holidays, computed instead of hard-coded to one year's date.
 *
 * Thanksgiving was written as Nov 24 in one table and Nov 28 in others; it is the
 * fourth Thursday of November (Nov 26 in 2026, Nov 25 in 2027).
 *
 * @module utils/us-holidays
 */

/** Day of November that is US Thanksgiving (the fourth Thursday) in `year`. */
export function thanksgivingDay(year: number = new Date().getFullYear()): number {
  const firstWeekday = new Date(Date.UTC(year, 10, 1)).getUTCDay(); // 0 = Sunday
  const firstThursday = 1 + ((4 - firstWeekday + 7) % 7);
  return firstThursday + 21;
}
