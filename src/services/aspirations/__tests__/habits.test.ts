import { describe, expect, it } from 'vitest';
import { applyCheckIn } from '../check-ins.js';
import { computeStreak, isDueOn, isStreakAtRisk, withStreaks } from '../habit-math.js';
import { newRecord } from '../record.js';
import { patternFor } from '../patterns.js';
import { planHabitNudge } from '../../important-dates/habit-reminder-rule.js';
import { DEFAULT_REMINDER_SETTINGS } from '../../important-dates/types.js';
import type { AspirationRecord, CheckIn, HabitSchedule } from '../types.js';

const day = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return { year: y, month: m, day: d };
};
const done = (date: string): CheckIn => ({ date, status: 'done', recordedAt: `${date}T12:00:00Z` });
const missed = (date: string): CheckIn => ({
  date,
  status: 'missed',
  recordedAt: `${date}T12:00:00Z`,
});
const daily: HabitSchedule = { frequency: 'daily', timesPerDay: 1 };

function habit(
  schedule: Partial<HabitSchedule> = {},
  createdAt = '2026-01-01T00:00:00Z'
): AspirationRecord {
  return newRecord(
    'asp_000000000000000000000001',
    {
      level: 'habit',
      title: 'meditate',
      habit: { schedule },
      source: 'explicit',
      confidence: 1,
      createdAt,
    },
    '2026-01-01T00:00:00Z'
  );
}

describe('streaks', () => {
  it('counts consecutive days; today not done yet does not break it', () => {
    const c = [done('2026-06-01'), done('2026-06-02'), done('2026-06-03')];
    expect(computeStreak(daily, c, day('2026-06-03'))).toBe(3);
    expect(computeStreak(daily, c, day('2026-06-04'))).toBe(3);
    expect(computeStreak(daily, c, day('2026-06-05'))).toBe(0); // a whole day missed
  });

  it('a missed check-in breaks the streak, even today', () => {
    const c = [done('2026-06-01'), done('2026-06-02'), missed('2026-06-03')];
    expect(computeStreak(daily, c, day('2026-06-03'))).toBe(0);
  });

  it('weekday habits skip weekends', () => {
    const s: HabitSchedule = { frequency: 'weekdays', timesPerDay: 1 };
    // Thu 4, Fri 5 June 2026, Mon 8 June
    const c = [done('2026-06-04'), done('2026-06-05'), done('2026-06-08')];
    expect(computeStreak(s, c, day('2026-06-08'))).toBe(3);
    expect(isDueOn({ ...habit(s).habit!, checkIns: c }, day('2026-06-06'))).toBe(false);
  });

  it('weekly habits count weeks, the open week does not break it', () => {
    const s: HabitSchedule = { frequency: 'weekly', timesPerDay: 1 };
    const c = [done('2026-05-20'), done('2026-05-27')]; // two Wednesdays
    expect(computeStreak(s, c, day('2026-06-02'))).toBe(2); // current week open
    expect(computeStreak(s, c, day('2026-06-09'))).toBe(0); // week of Jun 1 passed empty
    const h = { ...habit(s).habit!, checkIns: c };
    expect(isDueOn(h, day('2026-05-29'))).toBe(false);
    expect(isDueOn(h, day('2026-06-02'))).toBe(true);
  });

  it('keeps the longest streak and flags streaks at risk', () => {
    const c = [
      done('2026-05-01'),
      done('2026-05-02'),
      done('2026-05-03'),
      done('2026-05-04'),
      done('2026-06-01'),
      done('2026-06-02'),
    ];
    const h = withStreaks({ ...habit().habit!, checkIns: c }, day('2026-06-03'));
    expect(h.streak).toBe(2);
    expect(h.longestStreak).toBe(4);
    expect(isStreakAtRisk(h, day('2026-06-03'))).toBe(true);
  });
});

describe('check-ins across time zones', () => {
  const instant = new Date('2026-06-02T03:30:00Z'); // evening of Jun 1 in LA, midday Jun 2 in Tokyo

  it('lands on the user local day', () => {
    const la = applyCheckIn(habit(), { status: 'done' }, 'America/Los_Angeles', instant);
    const tokyo = applyCheckIn(habit(), { status: 'done' }, 'Asia/Tokyo', instant);
    expect(typeof la !== 'string' && la.habit?.checkIns[0].date).toBe('2026-06-01');
    expect(typeof tokyo !== 'string' && tokyo.habit?.checkIns[0].date).toBe('2026-06-02');
  });

  it('replaces the same day, rejects future and too-old days, and non-habits', () => {
    const first = applyCheckIn(habit(), { status: 'missed' }, 'UTC', instant);
    if (typeof first === 'string') throw new Error(first);
    const second = applyCheckIn(first, { status: 'done', note: 'after coffee' }, 'UTC', instant);
    if (typeof second === 'string') throw new Error(second);
    expect(second.habit?.checkIns).toHaveLength(1);
    expect(second.habit?.checkIns[0]).toMatchObject({ status: 'done', note: 'after coffee' });
    expect(applyCheckIn(habit(), { status: 'done', date: '2026-06-03' }, 'UTC', instant)).toMatch(
      /future/
    );
    expect(applyCheckIn(habit(), { status: 'done', date: '2026-01-01' }, 'UTC', instant)).toMatch(
      /too far/
    );
    const goal = { ...habit(), level: 'goal' as const, habit: undefined };
    expect(applyCheckIn(goal, { status: 'done' }, 'UTC', instant)).toMatch(/only habits/);
  });

  it('streaks survive a check-in recorded late in the evening', () => {
    let r: AspirationRecord = habit();
    for (const [iso, tz] of [
      ['2026-06-01T05:00:00Z', 'America/Los_Angeles'], // May 31 22:00 local
      ['2026-06-02T05:00:00Z', 'America/Los_Angeles'], // Jun 1 22:00 local
    ] as const) {
      const next = applyCheckIn(r, { status: 'done' }, tz, new Date(iso));
      if (typeof next === 'string') throw new Error(next);
      r = next;
    }
    expect(r.habit?.checkIns.map((c) => c.date)).toEqual(['2026-05-31', '2026-06-01']);
    expect(r.habit?.streak).toBe(2);
  });
});

describe('habit nudge rule (beside the date planner)', () => {
  const ctx = (now: string) => ({
    timeZone: 'America/New_York',
    now: new Date(now),
    settings: DEFAULT_REMINDER_SETTINGS,
  });
  it('plans the next due day at the reminder time, skipping done days and passed times', () => {
    const h = { ...habit({ reminderTime: '08:30' }).habit!, checkIns: [done('2026-06-02')] };
    const plan = planHabitNudge(
      { habitId: 'h1', reminderTime: '08:30', active: true, isDue: (d) => isDueOn(h, d) },
      ctx('2026-06-02T09:00:00Z') // 05:00 local Jun 2 — but Jun 2 is done
    );
    expect(plan?.key).toBe('h1_2026-06-03');
    expect(plan?.at.toISOString()).toBe('2026-06-03T12:30:00.000Z');
  });
  it('moves a nudge out of quiet hours and needs a reminder time', () => {
    const plan = planHabitNudge(
      { habitId: 'h1', reminderTime: '22:30', active: true, isDue: () => true },
      ctx('2026-06-02T12:00:00Z')
    );
    expect(plan?.at.toISOString()).toBe('2026-06-03T12:00:00.000Z'); // 08:00 next morning
    expect(
      planHabitNudge(
        { habitId: 'h1', active: true, isDue: () => true },
        ctx('2026-06-02T12:00:00Z')
      )
    ).toBeNull();
  });
});

describe('habit patterns', () => {
  it('finds slip days, trend and notes', () => {
    const c: CheckIn[] = [];
    // 8 weeks ending Mon 1 Jun 2026: done every weekday, missed weekends.
    for (let i = 1; i <= 56; i++) {
      const d = new Date(Date.UTC(2026, 5, 1 - i));
      const date = d.toISOString().slice(0, 10);
      const wd = d.getUTCDay();
      c.push(
        wd === 0 || wd === 6
          ? { ...missed(date), note: 'busy weekend' }
          : { ...done(date), note: 'after coffee' }
      );
    }
    const r = { ...habit(), habit: { ...habit().habit!, checkIns: c } };
    const p = patternFor(r, day('2026-06-01'));
    expect(p?.slipDays).toEqual(['Sunday', 'Saturday']);
    expect(p?.trend).toBe('steady');
    expect(p?.helpers).toContain('after coffee');
    expect(p?.blockers).toContain('busy weekend');
    // Today (no check-in yet) is left out of the window.
    expect(p?.completionRate).toBeCloseTo(39 / 55, 3);
  });
});
