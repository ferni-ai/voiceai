/**
 * "Time together" lines count calendar time in the user's zone and need real conversations.
 *
 * Before: the insights card said "It's been a month since we first talked" at 250 days
 * (anything past 30 days was "a month"), and Your Story's "One Week Together" needed only
 * seven elapsed days, even when the user had talked once.
 */
import { describe, expect, it } from 'vitest';
import {
  buildRelationship,
  calendarDaysBetween,
  calendarMonthsBetween,
} from '../insights-relationship.js';
import { oneWeekTogetherAt } from '../your-story-routes.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 18, 15); // 18 Oct 2026, 15:00 UTC

const card = (daysAgo: number, totalConversations: number, timezone?: string) =>
  buildRelationship(
    { firstContact: new Date(NOW - daysAgo * DAY), totalConversations, contactInfo: { timezone } },
    NOW
  );

describe('insights relationship card', () => {
  it.each([
    { days: 250, conversations: 12, says: "It's been 8 months since we first talked" },
    { days: 400, conversations: 12, says: "It's been a year since we first talked" },
    { days: 800, conversations: 12, says: "It's been 2 years since we first talked" },
    { days: 45, conversations: 3, says: "It's been a month since we first talked" },
    { days: 20, conversations: 3, says: "It's been 2 weeks since we first talked." },
    { days: 8, conversations: 2, says: "It's been a week since we first talked." },
  ])('$days days, $conversations conversations: "$says"', ({ days, conversations, says }) => {
    expect(card(days, conversations)?.milestone).toContain(says);
  });

  it.each([
    { n: 0, days: 250 },
    { n: 1, days: 250 },
    { n: 1, days: 30 },
  ])('n=$n conversations after $days days: no "time together" line', ({ n, days }) => {
    expect(card(days, n)).toBeUndefined();
  });

  it('never calls 250 days "a month"', () => {
    expect(card(250, 12)?.milestone).not.toContain('a month');
  });
});

describe('calendar math', () => {
  it('counts whole calendar months, not 30-day blocks', () => {
    expect(calendarMonthsBetween(Date.UTC(2026, 0, 31), Date.UTC(2026, 1, 28), 'UTC')).toBe(0);
    expect(calendarMonthsBetween(Date.UTC(2026, 0, 31), Date.UTC(2026, 2, 1), 'UTC')).toBe(1);
    expect(calendarMonthsBetween(Date.UTC(2026, 1, 18), Date.UTC(2026, 9, 18), 'UTC')).toBe(8);
  });

  it("counts days in the user's zone", () => {
    // 03:00 UTC on the 18th is still the 17th in Los Angeles: one calendar day after the 16th
    const first = Date.UTC(2026, 9, 16, 20);
    const now = Date.UTC(2026, 9, 18, 3);
    expect(calendarDaysBetween(first, now, 'America/Los_Angeles')).toBe(1);
    expect(calendarDaysBetween(first, now, 'UTC')).toBe(2);
  });
});

describe('Your Story: One Week Together', () => {
  const first = NOW - 8 * DAY;
  it.each([
    { n: 0, firstAt: undefined, reached: false },
    { n: 1, firstAt: first, reached: false }, // eight days, but they never came back
    { n: 3, firstAt: first, reached: true },
    { n: 3, firstAt: NOW - 3 * DAY, reached: false }, // three calls, three days
  ])('$n sessions: reached = $reached', ({ n, firstAt, reached }) => {
    const at = oneWeekTogetherAt(firstAt, n, NOW);
    expect(at !== undefined).toBe(reached);
    if (reached) expect(at).toBe(first + 7 * DAY);
  });
});
