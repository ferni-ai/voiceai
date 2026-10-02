/**
 * Habit patterns for insights (Agent F): when habits slip and what helps.
 *
 * `getHabitPatterns(userId)` looks at the last 8 weeks of check-ins for each
 * active habit and reports its completion rate, trend (last 2 weeks vs the 2
 * before), weekdays it tends to slip on, and the user's own notes on good
 * days ("helpers") and missed days ("blockers").
 *
 * @module services/aspirations/patterns
 */

import { addDays, formatCivil, localToday, type CivilDate } from '../important-dates/date-math.js';
import { resolveTimeZone } from '../important-dates/settings.js';
import { completionRate, isScheduledOn, weekday } from './habit-math.js';
import { listAspirations } from './store.js';
import type { AspirationRecord, CheckIn } from './types.js';

export const PATTERN_WINDOW_DAYS = 56;
const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export interface HabitPattern {
  habitId: string;
  title: string;
  parentId: string | null;
  completionRate: number | null;
  trend: 'improving' | 'steady' | 'slipping' | 'unknown';
  currentStreak: number;
  longestStreak: number;
  /** Weekdays missed at least half the time (≥ 2 scheduled samples). */
  slipDays: string[];
  helpers: string[];
  blockers: string[];
}

function rateBetween(r: AspirationRecord, end: CivilDate, days: number): number | null {
  return r.habit ? completionRate(r.habit, end, days) : null;
}

export function patternFor(r: AspirationRecord, today: CivilDate): HabitPattern | null {
  const habit = r.habit;
  if (r.level !== 'habit' || !habit) return null;
  const byDate = new Map<string, CheckIn>(habit.checkIns.map((c) => [c.date, c]));
  const misses = new Map<number, { scheduled: number; missed: number }>();
  for (let i = 1; i <= PATTERN_WINDOW_DAYS; i++) {
    const day = addDays(today, -i);
    if (!isScheduledOn(habit.schedule, day)) continue;
    const key = formatCivil(day);
    if (key < r.createdAt.slice(0, 10)) continue; // before the habit existed
    const wd = weekday(day);
    const m = misses.get(wd) ?? { scheduled: 0, missed: 0 };
    m.scheduled++;
    if (byDate.get(key)?.status !== 'done') m.missed++;
    misses.set(wd, m);
  }
  const slipDays = [...misses.entries()]
    .filter(([, m]) => m.scheduled >= 2 && m.missed / m.scheduled >= 0.5)
    .sort(([a], [b]) => a - b)
    .map(([wd]) => WEEKDAY_NAMES[wd]);
  const recent = rateBetween(r, today, 14);
  const before = rateBetween(r, addDays(today, -14), 14);
  let trend: HabitPattern['trend'] = 'unknown';
  if (recent !== null && before !== null) {
    trend = recent - before >= 0.15 ? 'improving' : before - recent >= 0.15 ? 'slipping' : 'steady';
  }
  const notes = (status: CheckIn['status']) =>
    habit.checkIns
      .filter((c) => c.status === status && c.note)
      .slice(-3)
      .map((c) => c.note as string);
  return {
    habitId: r.id,
    title: r.title,
    parentId: r.parentId,
    completionRate: rateBetween(r, today, PATTERN_WINDOW_DAYS),
    trend,
    currentStreak: habit.streak,
    longestStreak: habit.longestStreak,
    slipDays,
    helpers: notes('done'),
    blockers: notes('missed'),
  };
}

export async function getHabitPatterns(
  userId: string,
  now: Date = new Date()
): Promise<HabitPattern[]> {
  const listed = await listAspirations(userId, { level: 'habit' });
  if (!listed.success) return [];
  const today = localToday(now, await resolveTimeZone(userId));
  return listed.data
    .filter((r) => r.status === 'active' || r.status === 'paused')
    .map((r) => patternFor(r, today))
    .filter((p): p is HabitPattern => p !== null);
}
