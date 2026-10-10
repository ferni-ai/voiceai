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
export const STREAK_MILESTONES: Readonly<Record<number, number>> = {
  7: 25,
  14: 50,
  30: 100,
  60: 200,
  100: 500,
};

/** YYYY-MM-DD in the time zone (UTC when it isn't a valid IANA zone). */
export function localDate(now: Date, timeZone?: string): string {
  const tz = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** The calendar date `days` before a YYYY-MM-DD date. */
function daysBefore(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * What the app shows for today: whether the day's seeds are still to earn, and the streak
 * as it stands (0 once a day was missed; the stored count only resets on the next earn).
 */
export function dailyStatus(
  account: { lastConversationDate?: unknown; currentStreak?: unknown; seedTimeZone?: unknown },
  now: Date = new Date()
): { dailyBonusAvailable: boolean; currentStreak: number } {
  const zone = typeof account.seedTimeZone === 'string' ? account.seedTimeZone : undefined;
  const today = localDate(now, zone);
  const last =
    typeof account.lastConversationDate === 'string' ? account.lastConversationDate : null;
  const live = last !== null && last >= daysBefore(today, 1);
  return {
    dailyBonusAvailable: last === null || last < today,
    currentStreak: live ? Number(account.currentStreak ?? 0) : 0,
  };
}

export interface DailyResult {
  daily: SeedResult;
  streakDays: number;
  /** Set when this day reached a streak milestone and it paid. */
  milestone?: { days: number; seeds: number };
}

/** How long an account's day zone holds before a different zone can replace it. */
export const ZONE_CHANGE_AFTER_DAYS = 7;

/**
 * The zone that decides "today" for this account. The requested zone comes from the
 * client, so it can't move the day freely: hopping between UTC-12 and UTC+14 would make
 * one real day count twice. The first valid zone is kept; a different one is adopted only
 * once the current one has held for ZONE_CHANGE_AFTER_DAYS (a traveller's day catches up
 * within a week).
 */
function accountZone(
  account: Record<string, unknown>,
  requested: string | undefined,
  now: Date
): { zone: string; changed: boolean } {
  const stored = isValidTimeZone(account.seedTimeZone) ? account.seedTimeZone : undefined;
  const wanted = isValidTimeZone(requested) ? requested : undefined;
  if (!wanted || wanted === stored) return { zone: stored ?? 'UTC', changed: false };
  const since =
    typeof account.seedTimeZoneSince === 'string' ? Date.parse(account.seedTimeZoneSince) : NaN;
  const settled = !stored || !(now.getTime() - since < ZONE_CHANGE_AFTER_DAYS * 86_400_000);
  return settled ? { zone: wanted, changed: true } : { zone: stored, changed: false };
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
  return db.runTransaction(async (tx) => {
    const state = await prepareSeeds(tx, db, uid, []);
    const account = state.account ?? {};
    const { zone, changed } = accountZone(account, timeZone, now);
    const today = localDate(now, zone);
    const dailyKey = `daily:${today}`;
    const last =
      typeof account.lastConversationDate === 'string' ? account.lastConversationDate : null;
    const previous = Number(account.currentStreak ?? 0);

    if (last !== null && today <= last) {
      // Already counted (by this ledger or the old claim-daily path), or a date that moved
      // backwards (a zone change): never pays
      return { daily: { applied: false, balance: state.balance }, streakDays: previous };
    }

    const continues = last === daysBefore(today, 1) && previous > 0;
    const streakDays = continues ? previous + 1 : 1;
    // Accounts from before the ledger have a streak but no start: it began `previous` days ago
    const started =
      typeof account.streakStart === 'string' ? account.streakStart : daysBefore(today, previous);
    const streakStart = continues ? started : today;
    const bonus = STREAK_MILESTONES[streakDays];
    const streakKey = `streak:${streakDays}:${streakStart}`;
    await prepareMoreSeeds(tx, state, bonus ? [dailyKey, streakKey] : [dailyKey]);

    const daily = commitSeeds(tx, state, { delta: DAILY_SEEDS, reason: 'daily', key: dailyKey });
    const paid = bonus
      ? commitSeeds(tx, state, { delta: bonus, reason: 'streaks', key: streakKey })
      : null;
    tx.set(
      state.accountRef,
      {
        currentStreak: streakDays,
        streakStart,
        lastConversationDate: today,
        ...(changed ? { seedTimeZone: zone, seedTimeZoneSince: now.toISOString() } : {}),
      },
      { merge: true }
    );

    return {
      daily: { applied: daily.applied, balance: state.balance },
      streakDays,
      ...(paid?.applied ? { milestone: { days: streakDays, seeds: bonus as number } } : {}),
    };
  });
}
