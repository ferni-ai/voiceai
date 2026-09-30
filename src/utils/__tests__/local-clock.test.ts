import { describe, expect, it } from 'vitest';

import { isValidTimezone, localClock, partOfDayFor, timezoneFromMetadata } from '../local-clock.js';

// 2026-09-30 02:00 UTC = Tue 20:00 in Denver (MDT), Wed 11:00 in Tokyo
const now = new Date('2026-09-30T02:00:00Z');

describe('localClock', () => {
  it("reads the caller's hour and weekday, not the server's", () => {
    expect(localClock('America/Denver', now)).toEqual({
      hour: 20,
      dayOfWeek: 2,
      partOfDay: 'evening',
      timezone: 'America/Denver',
    });
    expect(localClock('Asia/Tokyo', now)).toMatchObject({
      hour: 11,
      dayOfWeek: 3,
      partOfDay: 'morning',
    });
  });

  it('falls back to server time for a missing or invalid timezone', () => {
    const fallback = localClock('Mars/Olympus', now);
    expect(fallback.timezone).toBeUndefined();
    expect(fallback.hour).toBe(now.getHours());
    expect(localClock(undefined, now).hour).toBe(now.getHours());
  });
});

describe('helpers', () => {
  it('validates timezones', () => {
    expect(isValidTimezone('Europe/London')).toBe(true);
    expect(isValidTimezone('not a zone')).toBe(false);
    expect(isValidTimezone(42)).toBe(false);
  });

  it('names parts of the day', () => {
    expect([2, 9, 14, 19, 23].map(partOfDayFor)).toEqual([
      'late night',
      'morning',
      'afternoon',
      'evening',
      'late evening',
    ]);
  });

  it('reads a valid timezone from metadata, as JSON or an object', () => {
    expect(timezoneFromMetadata('{"timezone":"America/Denver"}')).toBe('America/Denver');
    expect(timezoneFromMetadata({ timezone: 'Nope/Zone' })).toBeUndefined();
    expect(timezoneFromMetadata('not json')).toBeUndefined();
  });
});
