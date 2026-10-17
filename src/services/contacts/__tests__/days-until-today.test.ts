/**
 * A date that falls today is 0 days away, not a year away.
 *
 * The nudge day counter built this year's date at midnight and compared it with
 * `now`, which is later in the day, so on the day itself a birthday, memorial or
 * holiday "had passed" and rolled to next year. It was missed on the one day it
 * mattered. The clock is pinned to mid-afternoon so the test sees what a call at
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

describe('outreach nudges: a date that falls today', () => {
  async function upcoming(dates: Array<{ date: string; type: 'birthday' | 'anniversary' }>) {
    const { upsertContact, clearCache } = await import('../contact-relationship-service.js');
    const { buildNudgeContext } = await import('../outreach-nudges.js');
    clearCache();
    const userId = `days-${Math.random()}`;
    await upsertContact(userId, { name: 'Aunt Rose', contactId: 'rose', importantDates: dates });
    return (await buildNudgeContext(userId)).upcomingDates;
  }

  it('a birthday today is 0 days away (MM-DD)', async () => {
    const dates = await upcoming([{ date: '06-15', type: 'birthday' }]);
    expect(dates.map((d) => d.daysAway)).toEqual([0]);
  });

  it('a birthday today is 0 days away (YYYY-MM-DD)', async () => {
    const dates = await upcoming([{ date: '1950-06-15', type: 'birthday' }]);
    expect(dates.map((d) => d.daysAway)).toEqual([0]);
  });

  it('tomorrow is 1 and yesterday is next year, not upcoming', async () => {
    const dates = await upcoming([
      { date: '06-16', type: 'birthday' },
      { date: '06-14', type: 'anniversary' },
    ]);
    expect(dates.map((d) => [d.dateType, d.daysAway])).toEqual([['birthday', 1]]);
  });

  it('a holiday on the day is 0 days away', async () => {
    vi.setSystemTime(new Date(2026, 11, 25, 15, 0, 0));
    const { buildNudgeContext } = await import('../outreach-nudges.js');
    const holidays = (await buildNudgeContext(`days-${Math.random()}`)).upcomingHolidays;
    expect(holidays.find((h) => h.name === 'Christmas')?.daysAway).toBe(0);
  });
});
