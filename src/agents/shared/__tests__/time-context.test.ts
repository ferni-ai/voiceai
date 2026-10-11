import { describe, expect, it } from 'vitest';
import { isValidTimeZone, partOfDay, timeContext } from '../time-context.js';

// 2026-09-30 23:40 UTC: 7:40 pm in New York, 5:40 pm in Denver.
const now = new Date('2026-09-30T23:40:00Z');

describe('time context', () => {
  it("states the caller's local time and part of the day, not the server's clock", () => {
    const ny = timeContext(now, 'America/New_York');
    expect(ny).toContain('7:40 PM (America/New_York): evening');
    expect(ny).toContain('keep it in step with this time of day');
    expect(ny).not.toContain('11:40');
    expect(timeContext(now, 'America/Denver')).toContain('5:40 PM (America/Denver): evening');
  });

  it('gives the local date, which can differ from UTC', () => {
    expect(timeContext(new Date('2026-10-01T02:00:00Z'), 'America/Los_Angeles')).toContain(
      'Wednesday, September 30, 2026, 7:00 PM'
    );
  });

  it("without a zone, never presents UTC as the caller's time", () => {
    const text = timeContext(now, undefined);
    expect(text).not.toMatch(/\d:\d\d [AP]M/);
    expect(text).toContain("You don't know the caller's local time");
    expect(timeContext(now, 'Mars/Olympus')).toContain("You don't know the caller's local time");
  });

  it('validates zones and names the part of the day', () => {
    expect(isValidTimeZone('Europe/London')).toBe(true);
    expect(isValidTimeZone('not a zone')).toBe(false);
    expect([5, 12, 17, 21, 2].map(partOfDay)).toEqual(['morning', 'afternoon', 'evening', 'night', 'night']);
  });
});
