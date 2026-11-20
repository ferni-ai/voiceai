/**
 * The time fields of the assembled moment: hour, part of the day, weekday,
 * weekend and late night (#2167). Flag CALLER_CLOCK_TIME_OF_DAY off: the server
 * clock, as before. On: the caller's clock when the call's zone is known; with
 * no zone, no time of day at all, because the server's UTC hour would call
 * 5 pm Eastern late night, and saying it is late when it isn't is worse than
 * saying nothing.
 *
 * @module intelligence/core/immediate-time
 */
import { callerClockEnabled, callerClockZone } from '../../utils/caller-clock.js';
import { wallTimeIn } from '../../utils/time-zone.js';

/** The clock half of ImmediateContext (context-assembler.ts). */
export interface MomentTime {
  /** Left out, with dayOfWeek and hour, when the caller's clock is unknown */
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'late_night';
  dayOfWeek?: string;
  isWeekend: boolean;
  hour?: number;
  isLateNight: boolean;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Hour (0-23) and weekday (0 = Sunday): the server's (flag off), the caller's, or none. */
function clockReading(now: Date, timeZone?: string): { hour: number; day: number } | undefined {
  if (!callerClockEnabled()) return { hour: now.getHours(), day: now.getDay() };
  const zone = callerClockZone(timeZone);
  if (!zone) return undefined;
  const wall = wallTimeIn(now, zone);
  return {
    hour: wall.hour,
    day: new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).getUTCDay(),
  };
}

function partOfDay(hour: number): MomentTime['timeOfDay'] {
  if (hour < 6) return 'late_night';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return hour < 21 ? 'evening' : 'late_night';
}

export function immediateTime(now: Date, timeZone?: string): MomentTime {
  const reading = clockReading(now, timeZone);
  if (!reading) return { isWeekend: false, isLateNight: false };
  const { hour, day } = reading;
  return {
    timeOfDay: partOfDay(hour),
    dayOfWeek: DAY_NAMES[day],
    isWeekend: day === 0 || day === 6,
    hour,
    isLateNight: hour >= 22 || hour < 6,
  };
}
