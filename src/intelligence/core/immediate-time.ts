/**
 * The time fields of the assembled moment: hour, part of the day, weekday,
 * weekend and late night, on the caller's clock when CALLER_CLOCK_TIME_OF_DAY
 * is on and the call's zone is known, else on the server clock (#2167).
 *
 * @module intelligence/core/immediate-time
 */
import { callerClockZone } from '../../utils/caller-clock.js';
import { wallTimeIn } from '../../utils/time-zone.js';

/** The clock half of ImmediateContext (context-assembler.ts). */
export interface MomentTime {
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'late_night';
  dayOfWeek: string;
  isWeekend: boolean;
  hour: number;
  isLateNight: boolean;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Hour (0-23) and weekday (0 = Sunday) where the caller is, else on the server clock. */
function clockReading(now: Date, timeZone?: string): { hour: number; day: number } {
  const zone = callerClockZone(timeZone);
  if (!zone) return { hour: now.getHours(), day: now.getDay() };
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
  const { hour, day } = clockReading(now, timeZone);
  return {
    timeOfDay: partOfDay(hour),
    dayOfWeek: DAY_NAMES[day],
    isWeekend: day === 0 || day === 6,
    hour,
    isLateNight: hour >= 22 || hour < 6,
  };
}
