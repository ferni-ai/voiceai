/**
 * Seed earn rules the server runs from facts it has (plan: one seed ledger, part 2).
 *
 * The day's first conversation earns 5 seeds; talking on consecutive days builds a streak
 * that pays at 7, 14, 30, 60 and 100 days. These are the amounts people already saw in the
 * app, which used to compute them in the browser. "Day" is the person's own date (the
 * caller's time zone when known, else UTC), so an evening call never counts as tomorrow.
 *
 * @module services/seeds/earn
 */
import type admin from 'firebase-admin';
import { isValidTimeZone } from '../../agents/shared/time-context.js';
import { commitSeeds, prepareMoreSeeds, prepareSeeds, type SeedResult } from './ledger.js';

export const DAILY_SEEDS = 5;
export const STREAK_MILESTONES: Readonly<Record<number, number>> = { 7: 25, 14: 50, 30: 100, 60: 200, 100: 500 };

/** YYYY-MM-DD in the time zone (UTC when it isn't a valid IANA zone). */
export function localDate(now: Date, timeZone?: string): string {
  const tz = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** The calendar date `days` before a YYYY-MM-DD date. */
function daysBefore(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export interface DailyResult {
  daily: SeedResult;
  streakDays: number;
  /** Set when this day reached a streak milestone and it paid. */
  milestone?: { days: number; seeds: number };
}

/**
 * Credit the day's first conversation, and a streak milestone if today reaches one.
 * Safe to call on every conversation end: a second call on the same day changes nothing.
 */
export async function awardDailyConversation(
  db: admin.firestore.Firestore,
  uid: string,
  now: Date = new Date(),
  timeZone?: string
): Promise<DailyResult> {
  const today = localDate(now, timeZone);
  const dailyKey = `daily:${today}`;

  return db.runTransaction(async (tx) => {
    const state = await prepareSeeds(tx, db, uid, dailyKey);
    const account = state.account ?? {};
    const last = typeof account.lastConversationDate === 'string' ? account.lastConversationDate : null;
    const previous = Number(account.currentStreak ?? 0);

    if (last === today) {
      // Already counted today: by this ledger, or by the old claim-daily path (no entry)
      return { daily: { applied: false, balance: state.balance }, streakDays: previous };
    }

    const continues = last === daysBefore(today, 1) && previous > 0;
    const streakDays = continues ? previous + 1 : 1;
    // Accounts from before the ledger have a streak but no start: it began `previous` days ago
    const started = typeof account.streakStart === 'string' ? account.streakStart : daysBefore(today, previous);
    const streakStart = continues ? started : today;
    const bonus = STREAK_MILESTONES[streakDays];
    const streakKey = `streak:${streakDays}:${streakStart}`;
    if (bonus) await prepareMoreSeeds(tx, state, [streakKey]);

    const daily = commitSeeds(tx, state, { delta: DAILY_SEEDS, reason: 'daily', key: dailyKey });
    const paid = bonus ? commitSeeds(tx, state, { delta: bonus, reason: 'streaks', key: streakKey }) : null;
    tx.set(state.accountRef, { currentStreak: streakDays, streakStart, lastConversationDate: today }, { merge: true });

    return {
      daily: { applied: daily.applied, balance: state.balance },
      streakDays,
      ...(paid?.applied ? { milestone: { days: streakDays, seeds: bonus as number } } : {}),
    };
  });
}
