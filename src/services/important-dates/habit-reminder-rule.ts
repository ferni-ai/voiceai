/**
 * Habit check-in nudges: a minimal recurring-reminder rule beside the
 * important-date planner. Pure functions, no I/O.
 *
 * Important dates repeat yearly with day offsets; habits repeat daily or on
 * chosen weekdays at a time of day, which the date planner doesn't model.
 * This rule plans the next nudge for a habit with a reminder time, reusing
 * the same time-zone math and quiet hours as date reminders:
 *
 *   - the next local day the habit is still due (the caller's `isDue`
 *     predicate decides: scheduled that day and not done yet);
 *   - at the habit's `reminderTime`, moved to when quiet hours end if it
 *     falls inside them;
 *   - keyed `{habitId}_{YYYY-MM-DD}` so a day's nudge fires at most once.
 *
 * Callers (services/aspirations) store the result as `habit.nextNudgeAt`;
 * session start surfaces due habits in conversation.
 *
 * @module services/important-dates/habit-reminder-rule
 */

import {
  addDays,
  formatCivil,
  isWithinQuietHours,
  localToday,
  parseClock,
  zonedTimeToUtc,
  type CivilDate,
} from './date-math.js';
import type { ScheduleContext } from './reminder-schedule.js';

export interface HabitNudgeInput {
  habitId: string;
  /** 'HH:MM' local time. */
  reminderTime?: string;
  active: boolean;
  /** Whether the habit is still due on that local day. */
  isDue: (day: CivilDate) => boolean;
}

export interface PlannedHabitNudge {
  key: string;
  remindOn: CivilDate;
  at: Date;
}

/** How many days ahead to look for the next due day. */
export const NUDGE_LOOKAHEAD_DAYS = 14;

export function habitNudgeKey(habitId: string, day: CivilDate): string {
  return `${habitId}_${formatCivil(day)}`;
}

function nudgeInstant(day: CivilDate, minutes: number, ctx: ScheduleContext): Date {
  const qs = parseClock(ctx.settings.quietHours.start);
  const qe = parseClock(ctx.settings.quietHours.end);
  if (qs !== null && qe !== null && isWithinQuietHours(minutes, qs, qe)) {
    // Quiet until `qe`: later the same day when quiet hours end after the nudge
    // time, otherwise (late-evening nudge) the next morning.
    return zonedTimeToUtc(qe > minutes ? day : addDays(day, 1), qe, ctx.timeZone);
  }
  return zonedTimeToUtc(day, minutes, ctx.timeZone);
}

/** The next nudge for a habit, or null when it has no reminder time or isn't active. */
export function planHabitNudge(
  input: HabitNudgeInput,
  ctx: ScheduleContext
): PlannedHabitNudge | null {
  if (!input.active || !input.reminderTime) return null;
  const minutes = parseClock(input.reminderTime);
  if (minutes === null) return null;
  const today = localToday(ctx.now, ctx.timeZone);
  for (let i = 0; i < NUDGE_LOOKAHEAD_DAYS; i++) {
    const day = addDays(today, i);
    if (!input.isDue(day)) continue;
    const at = nudgeInstant(day, minutes, ctx);
    if (at.getTime() <= ctx.now.getTime()) continue; // today's time has passed
    return { key: habitNudgeKey(input.habitId, day), remindOn: day, at };
  }
  return null;
}
