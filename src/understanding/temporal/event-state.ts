/**
 * upcoming / ongoing / past, computed at read time from a stored interval and
 * never stored: "tomorrow" means something only against the moment it was
 * said, but "past" changes every minute.
 * @module understanding/temporal/event-state
 */
import * as C from './civil.js';

export type EventState = 'upcoming' | 'ongoing' | 'past';

/**
 * How long after its end an event still counts as under way: ms, or
 * 'next-morning' (09:00 caller-local the day after, for "how did it go?").
 * Unset: two hours for a clock time, which may run long; none otherwise.
 */
export type Grace = number | 'next-morning';

export function eventState(
  interval: { start: number; endExclusive: number; precision?: C.Precision },
  now: number,
  callerTimeZone?: string,
  grace?: Grace
): EventState {
  if (now < interval.start) return 'upcoming';
  const zone = C.zoneOrUtc(callerTimeZone);
  const lastDay = C.midnight(C.toNaive(interval.endExclusive - 1, zone));
  const pastAt =
    grace === 'next-morning'
      ? C.toInstant(lastDay + C.DAY_MS + 9 * C.HOUR_MS, zone)
      : interval.endExclusive +
        Math.max(0, grace ?? (interval.precision === 'hour' ? 2 * C.HOUR_MS : 0));
  return now < pastAt ? 'ongoing' : 'past';
}
