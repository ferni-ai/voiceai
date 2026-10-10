/**
 * What's Ahead stats: follow-through, habit check-ins, momentum.
 *
 * Every number here is computed from the user's own records or left out. A stat we can't
 * compute honestly (no habits, no tasks, no activity in either week) is `undefined`, and the
 * web view shows a dash for it, rather than a made-up 0% or a "declining" trend.
 *
 * @module api/routes/practice-view-stats
 */
import type { CollectionReference, Firestore } from '@google-cloud/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import { dayKey } from './practice-intentions.js';

const log = createLogger({ module: 'PracticeViewStats' });

const DAY_MS = 24 * 60 * 60 * 1000;
const QUERY_LIMIT = 500;

export interface PracticeViewStats {
  /** Share of the tasks in play (done in the last 7 days, or still open) that got done */
  followThroughPercent?: number;
  /** Habit check-ins in the last 7 days (today included) */
  habitsCompletedThisWeek?: number;
  /** Habit check-ins this week compared with the 7 days before */
  momentumTrend?: 'rising' | 'steady' | 'building' | 'declining';
  /** Longest current habit streak */
  streak?: number;
}

export interface StatsInput {
  /** One entry per habit: its stored streak and the YYYY-MM-DD days it was checked off */
  habits: Array<{ streak: number; completedDates: string[] }>;
  /** Tasks completed in the last 7 days */
  tasksCompletedThisWeek: number;
  /** Tasks not yet completed */
  tasksOpen: number;
}

/** The YYYY-MM-DD keys for the `days` days ending on (and including) `now`, shifted back */
function dayKeys(now: Date, days: number, shiftDays: number): Set<string> {
  const keys = new Set<string>();
  for (let i = 0; i < days; i++) {
    keys.add(dayKey(new Date(now.getTime() - (i + shiftDays) * DAY_MS)));
  }
  return keys;
}

export function computePracticeStats(input: StatsInput, now = new Date()): PracticeViewStats {
  const stats: PracticeViewStats = {};

  const tasksInPlay = input.tasksCompletedThisWeek + input.tasksOpen;
  if (tasksInPlay > 0) {
    stats.followThroughPercent = Math.round((input.tasksCompletedThisWeek / tasksInPlay) * 100);
  }

  if (input.habits.length > 0) {
    const thisWeek = dayKeys(now, 7, 0);
    const lastWeek = dayKeys(now, 7, 7);
    const count = (days: Set<string>): number =>
      input.habits.reduce(
        (sum, h) => sum + new Set(h.completedDates.filter((d) => days.has(d))).size,
        0
      );
    const now7 = count(thisWeek);
    const prev7 = count(lastWeek);

    stats.habitsCompletedThisWeek = now7;
    stats.streak = input.habits.reduce((max, h) => Math.max(max, h.streak), 0);
    if (now7 > 0 || prev7 > 0) {
      stats.momentumTrend =
        now7 === prev7
          ? 'steady'
          : now7 < prev7
            ? 'declining'
            : prev7 === 0
              ? 'building'
              : 'rising';
    }
  }

  return stats;
}

/** Task docs written as an ISO string (practice view) or a Date/Timestamp (voice tools) */
async function countTasksCompletedSince(tasks: CollectionReference, since: Date): Promise<number> {
  const [asTimestamp, asString] = await Promise.all([
    tasks.where('completedAt', '>=', since).limit(QUERY_LIMIT).get(),
    tasks.where('completedAt', '>=', since.toISOString()).limit(QUERY_LIMIT).get(),
  ]);
  const ids = new Set<string>();
  for (const doc of [...asTimestamp.docs, ...asString.docs]) {
    if (doc.data().completed === true) ids.add(doc.id);
  }
  return ids.size;
}

/** Load the user's habits and tasks and compute their stats; `{}` if they can't be read */
export async function loadPracticeStats(
  getDb: () => Promise<Firestore>,
  userId: string,
  now = new Date()
): Promise<PracticeViewStats> {
  try {
    const user = (await getDb()).collection('bogle_users').doc(userId);
    const tasks = user.collection('tasks');
    const [habitsSnap, tasksCompletedThisWeek, openSnap] = await Promise.all([
      user.collection('habits').get(),
      countTasksCompletedSince(tasks, new Date(now.getTime() - 7 * DAY_MS)),
      tasks.where('completed', '==', false).limit(QUERY_LIMIT).get(),
    ]);

    const habits = habitsSnap.docs.map((doc) => {
      const data = doc.data();
      const dates: unknown = data.completedDates;
      return {
        streak: typeof data.streak === 'number' ? data.streak : 0,
        completedDates: Array.isArray(dates)
          ? dates.filter((d): d is string => typeof d === 'string')
          : [],
      };
    });
    return computePracticeStats({ habits, tasksCompletedThisWeek, tasksOpen: openSnap.size }, now);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Could not compute practice stats');
    return {};
  }
}
