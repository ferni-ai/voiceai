/**
 * Session-start "Goals & habits" block: a compact, persona-agnostic summary
 * the persona can draw on in its own voice.
 *
 *   - active, confirmed goals with progress / target date (≤ 3)
 *   - habits due today, streaks at risk first (≤ 3)
 *   - at most one dormant dream to resurface gently, and only occasionally
 *     (that dream not raised in 30 days, no dream raised in the last 14)
 *
 * Topics the user asked us not to raise proactively are left out (Agent H's
 * `isTopicAllowedProactively`, through the boundaries adapter). The block is
 * hard-capped at SESSION_BLOCK_MAX_CHARS.
 *
 * @module services/aspirations/session-block
 */

import { createLogger } from '../../utils/safe-logger.js';
import { daysBetween, localToday, type CivilDate } from '../important-dates/date-math.js';
import { isReminderTopicAllowed } from '../important-dates/boundaries-adapter.js';
import { resolveTimeZone } from '../important-dates/settings.js';
import { computeStreak, isDueOn, isStreakAtRisk, parseCivil } from './habit-math.js';
import { listAspirations, saveAspiration } from './store.js';
import { isConfirmed, type AspirationRecord } from './types.js';

const log = createLogger({ module: 'aspirations:session' });

export const SESSION_BLOCK_MAX_CHARS = 700;
export const MAX_GOALS = 3;
export const MAX_HABITS = 3;
const DAY_MS = 86_400_000;
export const DREAM_QUIET_DAYS = 60;
export const DREAM_RESURFACE_EVERY_DAYS = 30;
export const ANY_DREAM_RESURFACE_GAP_DAYS = 14;

export interface SessionAspirations {
  context: string;
  goals: string[];
  habitsDue: string[];
  dreamToResurface: string | null;
}

const EMPTY: SessionAspirations = { context: '', goals: [], habitsDue: [], dreamToResurface: null };

const daysSince = (iso: string | undefined, now: Date): number =>
  iso ? Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS) : Infinity;

function goalLine(g: AspirationRecord, today: CivilDate): string {
  const parts = [g.title];
  if (g.progress !== undefined) parts.push(`${g.progress}%`);
  const total = g.milestones.length;
  if (total > 0) parts.push(`${g.milestones.filter((m) => m.done).length}/${total} milestones`);
  const target = g.targetDate ? parseCivil(g.targetDate) : null;
  if (target) {
    const d = daysBetween(today, target);
    parts.push(d < 0 ? `target passed ${-d}d ago` : d === 0 ? 'target today' : `target in ${d}d`);
  }
  return `- Goal: ${parts.join(' · ')}`;
}

function habitLine(h: AspirationRecord, today: CivilDate): string {
  const habit = h.habit;
  if (!habit) return `- Habit due today: ${h.title}`;
  const streak = computeStreak(habit.schedule, habit.checkIns, today);
  const risk = isStreakAtRisk(habit, today)
    ? ` (${streak}-day streak at risk)`
    : streak > 0
      ? ` (${streak}-day streak)`
      : '';
  return `- Habit due today: ${h.title}${risk}`;
}

/** Pick the dormant dream to resurface, if it's time for one. */
export function pickDreamToResurface(
  items: readonly AspirationRecord[],
  now: Date
): AspirationRecord | null {
  const dreams = items.filter((r) => r.level === 'dream' && isConfirmed(r));
  const lastAny = Math.min(...dreams.map((d) => daysSince(d.lastResurfacedAt, now)), Infinity);
  if (lastAny < ANY_DREAM_RESURFACE_GAP_DAYS) return null;
  const candidates = dreams
    .filter(
      (d) =>
        d.status === 'dormant' ||
        (d.status === 'active' && daysSince(d.lastMentionedAt, now) >= DREAM_QUIET_DAYS)
    )
    .filter((d) => daysSince(d.lastResurfacedAt, now) >= DREAM_RESURFACE_EVERY_DAYS)
    .sort((a, b) => (a.lastMentionedAt < b.lastMentionedAt ? -1 : 1));
  return candidates[0] ?? null;
}

/** Fit lines under the budget, dropping from the end of each section's tail. */
export function fitBudget(
  header: string,
  lines: string[],
  footer: string,
  max = SESSION_BLOCK_MAX_CHARS
): string {
  const kept = [...lines];
  const build = () => [header, ...kept, '', footer].join('\n');
  while (kept.length > 0 && build().length > max) kept.pop();
  if (kept.length === 0) return '';
  const text = build();
  return text.length <= max ? text : text.slice(0, max);
}

export function formatBlock(goals: string[], habits: string[], dream: string | null): string {
  const lines = [
    ...habits,
    ...goals,
    ...(dream ? [`- A dream they haven't mentioned in a while: ${dream}`] : []),
  ];
  if (lines.length === 0) return '';
  return fitBudget(
    '## Goals & habits',
    lines,
    'Weave in at most one of these, naturally and only if it fits. Celebrate progress; never nag about a missed day.' +
      (dream ? ' If you bring up the dream, ask gently whether it still matters to them.' : '')
  );
}

/** Never throws; returns an empty block when storage is unavailable. */
export async function getAspirationsForSession(
  userId: string,
  now: Date = new Date()
): Promise<SessionAspirations> {
  if (!userId) return EMPTY;
  try {
    const listed = await listAspirations(userId);
    if (!listed.success || listed.data.length === 0) return EMPTY;
    const today = localToday(now, await resolveTimeZone(userId));
    const allowed = async (r: AspirationRecord) => isReminderTopicAllowed(userId, r.title);
    const confirmed = listed.data.filter(isConfirmed);

    const habitsDue: AspirationRecord[] = [];
    const dueHabits = confirmed
      .filter(
        (r) => r.level === 'habit' && r.status === 'active' && r.habit && isDueOn(r.habit, today)
      )
      .sort(
        (a, b) => Number(isStreakAtRisk(b.habit!, today)) - Number(isStreakAtRisk(a.habit!, today))
      );
    for (const h of dueHabits) {
      if (habitsDue.length >= MAX_HABITS) break;
      if (await allowed(h)) habitsDue.push(h);
    }

    const goals: AspirationRecord[] = [];
    const activeGoals = confirmed
      .filter((r) => r.level === 'goal' && r.status === 'active')
      .sort((a, b) => (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999'));
    for (const g of activeGoals) {
      if (goals.length >= MAX_GOALS) break;
      if (await allowed(g)) goals.push(g);
    }

    let dream = pickDreamToResurface(listed.data, now);
    if (dream && !(await allowed(dream))) dream = null;
    if (dream) {
      await saveAspiration(
        userId,
        { ...dream, lastResurfacedAt: now.toISOString() },
        { skipHooks: true }
      );
    }

    const goalLines = goals.map((g) => goalLine(g, today));
    const habitLines = habitsDue.map((h) => habitLine(h, today));
    return {
      context: formatBlock(goalLines, habitLines, dream?.title ?? null),
      goals: goals.map((g) => g.title),
      habitsDue: habitsDue.map((h) => h.title),
      dreamToResurface: dream?.title ?? null,
    };
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Goals & habits block unavailable');
    return EMPTY;
  }
}
