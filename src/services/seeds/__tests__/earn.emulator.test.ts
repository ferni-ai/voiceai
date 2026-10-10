/**
 * The day's first conversation and streak milestones, run by the server on the real
 * Firestore emulator. Amounts are the ones the app showed people (+5 a day; 25/50/100/
 * 200/500 at 7/14/30/60/100 days), now computed where they can't be faked or double-paid.
 */
import admin from 'firebase-admin';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { awardDailyConversation, localDate } from '../earn.js';
import { STARTER_SEEDS } from '../ledger.js';

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
let db: admin.firestore.Firestore;
let uid: string;

beforeAll(() => {
  if (!emulator) return;
  const app =
    admin.apps.find((a) => a?.name === 'seed-earn-test') ??
    admin.initializeApp({ projectId: 'demo-seed-ledger' }, 'seed-earn-test');
  db = app.firestore();
});

beforeEach(() => {
  uid = `u-${Math.random().toString(36).slice(2)}`;
});

/** Noon UTC on 2026-10-01 plus n days. */
const day = (n: number) => new Date(Date.UTC(2026, 9, 1 + n, 12));
const account = async () => (await db.collection('user_seeds').doc(uid).get()).data() ?? {};

describe('localDate', () => {
  it("is the caller's own date, so an evening call isn't tomorrow", () => {
    const lateEvening = new Date('2026-10-11T03:30:00Z'); // 23:30 on the 10th in New York
    expect(localDate(lateEvening, 'America/New_York')).toBe('2026-10-10');
    expect(localDate(lateEvening)).toBe('2026-10-11'); // unknown zone: UTC
    expect(localDate(lateEvening, 'Not/AZone')).toBe('2026-10-11');
  });
});

describe.skipIf(!emulator)('daily conversation seeds (Firestore emulator)', () => {
  it("pays 5 for the day's first conversation and nothing for later ones that day", async () => {
    const first = await awardDailyConversation(db, uid, day(0));
    const second = await awardDailyConversation(db, uid, day(0));

    expect(first).toMatchObject({ daily: { applied: true, balance: STARTER_SEEDS + 5 }, streakDays: 1 });
    expect(second.daily).toEqual({ applied: false, balance: STARTER_SEEDS + 5 });
  });

  it('a 7-day streak pays 25 on the 7th day, once; a missed day starts over', async () => {
    const results = [];
    for (let n = 0; n < 7; n++) results.push(await awardDailyConversation(db, uid, day(n)));
    await awardDailyConversation(db, uid, day(6)); // a second call on day 7

    expect(results.map((r) => r.streakDays)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(results[6]?.milestone).toEqual({ days: 7, seeds: 25 });
    expect(results.slice(0, 6).every((r) => !r.milestone)).toBe(true);
    expect(await account()).toMatchObject({
      balance: STARTER_SEEDS + 7 * 5 + 25,
      earnedFrom: { daily: 35, streaks: 25 },
      currentStreak: 7,
      streakStart: '2026-10-01',
    });

    const afterGap = await awardDailyConversation(db, uid, day(8)); // skipped day 8 (index 7)
    expect(afterGap.streakDays).toBe(1);
  });

  it('an account from before the ledger keeps its streak (start computed from the count)', async () => {
    await db.collection('user_seeds').doc(uid).set({ balance: 90, currentStreak: 6, lastConversationDate: '2026-10-06' });
    const result = await awardDailyConversation(db, uid, day(6)); // 2026-10-07

    expect(result).toMatchObject({ streakDays: 7, milestone: { days: 7, seeds: 25 } });
    expect(await account()).toMatchObject({ balance: 90 + 5 + 25, streakStart: '2026-10-01' });
  });

  it("doesn't pay again on a day the old claim-daily path already counted", async () => {
    await db.collection('user_seeds').doc(uid).set({ balance: 40, currentStreak: 2, lastConversationDate: '2026-10-01' });
    const result = await awardDailyConversation(db, uid, day(0)); // 2026-10-01

    expect(result.daily).toEqual({ applied: false, balance: 40 });
    expect((await account()).balance).toBe(40);
  });

  it('two sessions ending at once on a new day pay the daily seeds once', async () => {
    await Promise.all([awardDailyConversation(db, uid, day(0)), awardDailyConversation(db, uid, day(0))]);
    expect((await account()).balance).toBe(STARTER_SEEDS + 5);
  });
});
