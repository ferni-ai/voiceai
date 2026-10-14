/**
 * TEAM_BY_NEED=on: a daily chat and a streak earn no seeds (product decision, 2026-10-11).
 * The day and the streak are still recorded; balances, purchases, gifts and referrals
 * are untouched. Off: +5 for the day's first chat, and the milestone bonuses, as before.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ledger = vi.hoisted(() => ({
  prepareSeeds: vi.fn(),
  prepareMoreSeeds: vi.fn(),
  commitSeeds: vi.fn(() => ({ applied: true })),
}));
vi.mock('../ledger.js', () => ledger);

import { awardDailyConversation, dailyEarnsSeeds } from '../earn.js';

const set = vi.fn();
const db = {
  runTransaction: (fn: (tx: unknown) => unknown) => fn({ set }),
} as unknown as Parameters<typeof awardDailyConversation>[0];

beforeEach(() => {
  vi.clearAllMocks();
  // Talked yesterday, six days running: today is day 7, a 25-seed milestone
  ledger.prepareSeeds.mockResolvedValue({
    account: { lastConversationDate: '2026-10-10', currentStreak: 6, streakStart: '2026-10-05' },
    balance: 100,
    accountRef: 'ref',
  });
});
afterEach(() => vi.unstubAllEnvs());

const today = new Date('2026-10-11T15:00:00Z');

describe('seeds for a daily chat', () => {
  it('TEAM_BY_NEED=on: none for the day, none for the streak; the day is still recorded', async () => {
    vi.stubEnv('TEAM_BY_NEED', 'on');
    expect(dailyEarnsSeeds()).toBe(false);
    const result = await awardDailyConversation(db, 'u1', today);
    expect(ledger.commitSeeds).not.toHaveBeenCalled();
    expect(result.daily.applied).toBe(false);
    expect(result.milestone).toBeUndefined();
    expect(result.streakDays).toBe(7);
    expect(set).toHaveBeenCalledWith(
      'ref',
      expect.objectContaining({ lastConversationDate: '2026-10-11', currentStreak: 7 }),
      { merge: true }
    );
  });

  it('off: +5 for the day and the 7-day bonus, as before', async () => {
    vi.stubEnv('TEAM_BY_NEED', '');
    const result = await awardDailyConversation(db, 'u1', today);
    expect(ledger.commitSeeds).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      delta: 5,
      reason: 'daily',
      key: 'daily:2026-10-11',
    });
    expect(ledger.commitSeeds).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ delta: 25, reason: 'streaks' })
    );
    expect(result.milestone).toEqual({ days: 7, seeds: 25 });
  });
});
