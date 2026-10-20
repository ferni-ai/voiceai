/**
 * The journal streak is the run the user is on now, not their best old run.
 *
 * Before: after a gap, "current streak" was raised to the length of an older run,
 * so someone who wrote 5 days in a row last month and once yesterday saw "5".
 */

import { describe, expect, it } from 'vitest';
import { journalStreaks } from '../streaks.js';

const NOW = new Date('2026-10-18T15:00:00Z');
const day = (iso: string, hour = 12) => new Date(`${iso}T${String(hour).padStart(2, '0')}:00:00Z`);

describe('journalStreaks', () => {
  it.each([
    { name: 'n=0', dates: [], current: 0, best: 0 },
    { name: 'n=1 today', dates: [day('2026-10-18')], current: 1, best: 1 },
    { name: 'n=1 yesterday', dates: [day('2026-10-17')], current: 1, best: 1 },
    { name: 'n=1 three days ago', dates: [day('2026-10-15')], current: 0, best: 1 },
    {
      name: 'n=3 in a row ending today, two on one day',
      dates: [day('2026-10-16'), day('2026-10-17'), day('2026-10-17', 20), day('2026-10-18')],
      current: 3,
      best: 3,
    },
    {
      name: 'a long old run, then one entry yesterday',
      dates: [
        ...['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'].map((d) =>
          day(d)
        ),
        day('2026-10-17'),
      ],
      current: 1,
      best: 5,
    },
    {
      name: 'a long old run and nothing recent',
      dates: ['2026-09-01', '2026-09-02', '2026-09-03'].map((d) => day(d)),
      current: 0,
      best: 3,
    },
  ])('$name: current $current, best $best', ({ dates, current, best }) => {
    expect(journalStreaks(dates, NOW)).toEqual({ currentStreak: current, longestStreak: best });
  });

  it("counts days in the user's zone", () => {
    // 03:00 UTC on the 18th is still the 17th in Los Angeles
    const lateNight = new Date('2026-10-18T03:00:00Z');
    const now = new Date('2026-10-18T18:00:00Z');
    expect(journalStreaks([day('2026-10-16', 20), lateNight], now, 'America/Los_Angeles')).toEqual({
      currentStreak: 2,
      longestStreak: 2,
    });
  });
});
