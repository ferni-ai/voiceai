/**
 * A date that falls today is 0 days away, not a year away.
 *
 * The trigger profile compared this year's date at midnight with `now`, which
 * is later in the day, so on the day itself a recurring date "had passed" and
 * rolled to next year, and a one-time date read as UTC midnight counted -1. A
 * date tomorrow afternoon floored to 0, "today". The day it mattered was missed. The clock is pinned to mid-afternoon so the test sees what a call at
 * 3pm sees.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn().mockImplementation(() => ({
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ exists: false, data: () => null }),
        set: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        collection: vi.fn().mockReturnThis(),
      }),
      where: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ docs: [] }),
    }),
  })),
}));

// 2026-06-15, 15:00 local time
const AFTERNOON = new Date(2026, 5, 15, 15, 0, 0);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AFTERNOON);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('trigger profile: a significant date that falls today', () => {
  async function boostReasons(date: { date: string; isRecurring: boolean }) {
    const { UserTriggerProfileService } = await import('../user-trigger-profile-service.js');
    const service = new UserTriggerProfileService({ enablePersistence: false });
    const userId = `days-${Math.random()}`;
    await service.addSignificantDate(userId, {
      id: 'd1',
      ...date,
      type: 'loss',
      description: `grandma ${date.date}`,
      emotionalWeight: 0.9,
      triggerCategories: ['grief'],
      extractedAt: new Date(),
      confidence: 0.95,
      source: 'explicit',
    });
    const boost = await service.generateContextBoost(userId, { date: new Date() });
    return boost.triggersToBoost.map((t) => t.reason).filter((r) => r.includes(date.date));
  }

  it('a recurring date today is today', async () => {
    expect(await boostReasons({ date: '2001-06-15', isRecurring: true })).toEqual([
      'loss grandma 2001-06-15 is today',
    ]);
  });

  it('a one-time date today is today, not -1', async () => {
    expect(await boostReasons({ date: '2026-06-15', isRecurring: false })).toEqual([
      'loss grandma 2026-06-15 is today',
    ]);
  });

  it('a one-time date tomorrow is 1 day away, not 0', async () => {
    expect(await boostReasons({ date: '2026-06-16', isRecurring: false })).toEqual([
      'loss grandma 2026-06-16 in 1 days',
    ]);
  });
});
