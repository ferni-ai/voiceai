/**
 * Dates the agent and the panels state are calendar facts, not approximations.
 *
 * - Thanksgiving was hard-coded (Nov 24 in one table, Nov 28 in others); it is the
 *   fourth Thursday of November.
 * - "Yesterday" in agent prompts meant 24 to 48 hours ago; it is now the previous
 *   calendar day where the user lives.
 */
import { describe, expect, it } from 'vitest';
import { thanksgivingDay } from '../us-holidays.js';
import { calendarDaysSince } from '../calendar-days.js';
import { callerHistory } from '../../agents/multi-agent/greeting-direction.js';

describe('thanksgivingDay', () => {
  it.each([
    [2024, 28],
    [2025, 27],
    [2026, 26],
    [2027, 25],
    [2028, 23],
  ])('%i: November %i, a Thursday', (year, day) => {
    expect(thanksgivingDay(year)).toBe(day);
    expect(new Date(Date.UTC(year, 10, day)).getUTCDay()).toBe(4);
  });
});

describe('calendarDaysSince', () => {
  const at = (iso: string) => Date.parse(iso);
  it.each([
    // 11pm then 9am the next morning in New York: yesterday, though only 10 hours apart
    { from: '2026-10-18T03:00:00Z', now: '2026-10-18T13:00:00Z', tz: 'America/New_York', days: 1 },
    // 9am two days ago is not "yesterday", though under 48 hours
    { from: '2026-10-16T13:00:00Z', now: '2026-10-18T11:00:00Z', tz: 'America/New_York', days: 2 },
    { from: '2026-10-18T13:00:00Z', now: '2026-10-18T22:00:00Z', tz: 'America/New_York', days: 0 },
    // An unknown zone counts in UTC
    { from: '2026-10-17T23:00:00Z', now: '2026-10-18T01:00:00Z', tz: 'Not/AZone', days: 1 },
  ])('$from to $now in $tz: $days', ({ from, now, tz, days }) => {
    expect(calendarDaysSince(at(from), at(now), tz)).toBe(days);
  });

  it('reads stored date strings, and never invents a gap from a bad date', () => {
    expect(calendarDaysSince('2026-10-17T12:00:00Z', at('2026-10-18T12:00:00Z'), 'UTC')).toBe(1);
    expect(calendarDaysSince('not a date', at('2026-10-18T12:00:00Z'), 'UTC')).toBe(0);
  });
});

describe('greeting "last talked"', () => {
  it.each([
    { n: 1, last: '2026-10-18T03:00:00Z', days: 1 },
    { n: 3, last: '2026-10-16T13:00:00Z', days: 2 },
  ])('n=$n: daysSince $days on the calendar in their zone', ({ n, last, days }) => {
    const history = callerHistory(
      { totalConversations: n, lastContact: last },
      new Date('2026-10-18T13:00:00Z'),
      'America/New_York'
    );
    expect(history?.daysSince).toBe(days);
  });

  it('n=0: no history', () => {
    expect(callerHistory({ totalConversations: 0 }, new Date())).toBeUndefined();
  });
});
