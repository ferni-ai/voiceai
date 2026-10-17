/**
 * When a family check-in next comes due, at the schedule's `preferredTime` on
 * the family member's own clock (`schedule.timezone`), not the server's.
 *
 * Cloud Run runs in UTC, so computing in server time made "18:00" ring at
 * 11am in California. Dates are worked out as calendar days in the family
 * member's zone, then the wall time is turned into an instant, DST included.
 *
 * @module services/family/next-checkin-time
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { DayOfWeek, FamilyCheckinSchedule } from './proactive-family-checkin.js';

const log = createLogger({ module: 'NextCheckinTime' });

const DAY_NUMBER: Record<DayOfWeek, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export type NextCheckinInput = Pick<
  FamilyCheckinSchedule,
  'frequency' | 'preferredTime' | 'daysOfWeek' | 'customIntervalDays' | 'timezone'
>;

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function validZone(timezone: string | undefined): string {
  if (!timezone) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return timezone;
  } catch {
    log.warn({ timezone }, 'Unknown check-in time zone, using UTC');
    return 'UTC';
  }
}

/** The wall clock in `timeZone` at `instant`. */
function wallClockAt(instant: Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

/** Milliseconds `timeZone` is ahead of UTC at `instant`. */
function zoneOffset(instant: Date, timeZone: string): number {
  const w = wallClockAt(instant, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  return asUtc - Math.floor(instant.getTime() / 60_000) * 60_000;
}

/** The instant the clock in `timeZone` shows this wall time. */
export function instantOfWallClock(w: WallClock, timeZone: string): Date {
  const guess = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  const first = guess - zoneOffset(new Date(guess), timeZone);
  // Re-check at the candidate: across a DST change the offset differs.
  return new Date(guess - zoneOffset(new Date(first), timeZone));
}

/** The next check-in as an ISO instant, never earlier than tomorrow in the family member's zone. */
export function calculateNextCallTime(schedule: NextCheckinInput, now: Date = new Date()): string {
  const zone = validZone(schedule.timezone);
  const [hour, minute] = schedule.preferredTime.split(':').map(Number);
  const today = wallClockAt(now, zone);

  // A UTC date stands in for the family member's calendar day.
  const date = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
  const addDays = (n: number) => date.setUTCDate(date.getUTCDate() + n);
  const targetDay = schedule.daysOfWeek?.[0];

  switch (schedule.frequency) {
    case 'daily':
      break;
    case 'weekly':
    case 'biweekly':
      if (targetDay) {
        while (date.getUTCDay() !== DAY_NUMBER[targetDay]) addDays(1);
        if (schedule.frequency === 'biweekly') addDays(7);
      }
      break;
    case 'monthly':
      date.setUTCMonth(date.getUTCMonth() + 1);
      break;
    case 'custom':
      if (schedule.customIntervalDays) addDays(schedule.customIntervalDays - 1);
      break;
  }

  return instantOfWallClock(
    {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour,
      minute,
    },
    zone
  ).toISOString();
}
