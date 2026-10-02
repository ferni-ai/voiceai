/**
 * Habit schedules, check-ins and streaks. Pure functions over civil (local)
 * days, so "did my run today" lands on the user's day whatever the server's
 * time zone.
 *
 * Streak rules:
 * - daily/weekdays/weekends/custom: consecutive scheduled days with a `done`
 *   check-in, counting back from today. Today not done yet doesn't break it
 *   (the day isn't over); a `missed` check-in or a scheduled day with no
 *   check-in does.
 * - weekly: consecutive weeks (Mon–Sun) with at least one `done`; the current
 *   week doesn't break it until it's over.
 *
 * @module services/aspirations/habit-math
 */

import {
  addDays,
  compareCivil,
  formatCivil,
  localToday,
  parseStoredDate,
  type CivilDate,
} from '../important-dates/date-math.js';
import { MAX_CHECK_INS, type CheckIn, type HabitDetails, type HabitSchedule } from './types.js';

export const LOOKBACK_DAYS = 400;

export function weekday(day: CivilDate): number {
  return new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay();
}

export function parseCivil(value: string): CivilDate | null {
  const p = parseStoredDate(value);
  return p && p.year !== undefined ? { year: p.year, month: p.month, day: p.day } : null;
}

export function todayIn(timeZone: string, now: Date = new Date()): string {
  return formatCivil(localToday(now, timeZone));
}

/** Whether the habit is scheduled on that day (weekly: any day unless days given). */
export function isScheduledOn(schedule: HabitSchedule, day: CivilDate): boolean {
  const wd = weekday(day);
  switch (schedule.frequency) {
    case 'daily':
      return true;
    case 'weekdays':
      return wd >= 1 && wd <= 5;
    case 'weekends':
      return wd === 0 || wd === 6;
    case 'custom':
      return (schedule.days ?? []).includes(wd);
    case 'weekly':
      return !schedule.days || schedule.days.length === 0 || schedule.days.includes(wd);
    default:
      return true;
  }
}

/** Monday of the week containing `day`. */
export function weekStart(day: CivilDate): CivilDate {
  const offset = (weekday(day) + 6) % 7;
  return addDays(day, -offset);
}

function byDate(checkIns: readonly CheckIn[]): Map<string, CheckIn> {
  const map = new Map<string, CheckIn>();
  for (const c of checkIns) map.set(c.date, c);
  return map;
}

/** Insert or replace the check-in for its day; newest last; bounded. */
export function mergeCheckIn(checkIns: readonly CheckIn[], next: CheckIn): CheckIn[] {
  const others = checkIns.filter((c) => c.date !== next.date);
  others.push(next);
  others.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return others.slice(-MAX_CHECK_INS);
}

function weeklyStreak(checkIns: readonly CheckIn[], today: CivilDate): number {
  const doneWeeks = new Set(
    checkIns
      .filter((c) => c.status === 'done')
      .map((c) => parseCivil(c.date))
      .filter((d): d is CivilDate => d !== null)
      .map((d) => formatCivil(weekStart(d)))
  );
  let week = weekStart(today);
  let streak = 0;
  if (!doneWeeks.has(formatCivil(week))) week = addDays(week, -7); // current week still open
  for (let i = 0; i < 60; i++) {
    if (!doneWeeks.has(formatCivil(week))) break;
    streak++;
    week = addDays(week, -7);
  }
  return streak;
}

export function computeStreak(
  schedule: HabitSchedule,
  checkIns: readonly CheckIn[],
  today: CivilDate
): number {
  if (schedule.frequency === 'weekly' && (!schedule.days || schedule.days.length === 0)) {
    return weeklyStreak(checkIns, today);
  }
  const map = byDate(checkIns);
  let streak = 0;
  for (let i = 0; i < LOOKBACK_DAYS; i++) {
    const day = addDays(today, -i);
    if (!isScheduledOn(schedule, day)) continue;
    const c = map.get(formatCivil(day));
    if (c?.status === 'done') {
      streak++;
      continue;
    }
    if (i === 0 && !c) continue; // today isn't over
    break;
  }
  return streak;
}

/** Longest run ever (same rules), used to keep `longestStreak` honest. */
export function computeLongestStreak(
  schedule: HabitSchedule,
  checkIns: readonly CheckIn[],
  today: CivilDate
): number {
  const dates = checkIns.map((c) => parseCivil(c.date)).filter((d): d is CivilDate => !!d);
  if (dates.length === 0) return 0;
  let longest = 0;
  // Evaluate the streak ending at each done day.
  for (const d of dates) {
    if (compareCivil(d, today) > 0) continue;
    const run = computeStreak(
      schedule,
      checkIns.filter((c) => c.date <= formatCivil(d)),
      d
    );
    if (run > longest) longest = run;
  }
  return longest;
}

/** Due today: scheduled, and not done yet (weekly: not done this week). */
export function isDueOn(habit: HabitDetails, day: CivilDate): boolean {
  const { schedule } = habit;
  if (schedule.frequency === 'weekly' && (!schedule.days || schedule.days.length === 0)) {
    const start = formatCivil(weekStart(day));
    return !habit.checkIns.some(
      (c) => c.status === 'done' && c.date >= start && c.date <= formatCivil(day)
    );
  }
  if (!isScheduledOn(schedule, day)) return false;
  return byDate(habit.checkIns).get(formatCivil(day))?.status !== 'done';
}

/** A streak worth protecting that today's check-in would keep alive. */
export function isStreakAtRisk(habit: HabitDetails, day: CivilDate, minStreak = 2): boolean {
  return isDueOn(habit, day) && computeStreak(habit.schedule, habit.checkIns, day) >= minStreak;
}

/** Recompute streak fields after the check-ins changed. */
export function withStreaks(habit: HabitDetails, today: CivilDate): HabitDetails {
  const streak = computeStreak(habit.schedule, habit.checkIns, today);
  const longest = Math.max(
    habit.longestStreak,
    streak,
    computeLongestStreak(habit.schedule, habit.checkIns, today)
  );
  return { ...habit, streak, longestStreak: longest };
}

/** Scheduled days in the window [today - days + 1, today] (excluding today if not done). */
export function scheduledDays(
  schedule: HabitSchedule,
  today: CivilDate,
  days: number
): CivilDate[] {
  const out: CivilDate[] = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(today, -i);
    if (isScheduledOn(schedule, day)) out.push(day);
  }
  return out;
}

/** Share of scheduled days in the window that were done (0-1); null with no history. */
export function completionRate(habit: HabitDetails, today: CivilDate, days: number): number | null {
  const map = byDate(habit.checkIns);
  const todayKey = formatCivil(today);
  const scheduled = scheduledDays(habit.schedule, today, days).filter((d) => {
    const key = formatCivil(d);
    return key !== todayKey || map.has(key);
  });
  if (scheduled.length === 0) return null;
  const done = scheduled.filter((d) => map.get(formatCivil(d))?.status === 'done').length;
  return done / scheduled.length;
}
