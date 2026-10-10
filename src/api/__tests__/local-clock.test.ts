/**
 * The Sanctuary's clock is the person's: the same instant is morning in one zone and
 * night in another.
 */
import { describe, expect, it, vi } from 'vitest';
import { timeOfDay, wallClock } from '../local-clock.js';

// Saturday 2026-10-10, 08:31 UTC: when CI's walk saw "Saturday morning"
const INSTANT = new Date('2026-10-10T08:31:00Z');

describe('wallClock', () => {
  it('reads the hour and the weekday where the person is', () => {
    const london = wallClock('Europe/London', INSTANT); // BST, UTC+1
    expect([london.getHours(), london.getMinutes(), london.getDay()]).toEqual([9, 31, 6]);

    const la = wallClock('America/Los_Angeles', INSTANT); // PDT, UTC-7: still Saturday, 1:31am
    expect([la.getHours(), la.getDay()]).toEqual([1, 6]);

    const tokyo = wallClock('Asia/Tokyo', INSTANT); // UTC+9: 5:31pm
    expect([tokyo.getHours(), tokyo.getDay()]).toEqual([17, 6]);

    const auckland = wallClock('Pacific/Auckland', new Date('2026-10-10T14:00:00Z')); // NZDT: Sunday 3am
    expect([auckland.getHours(), auckland.getDay()]).toEqual([3, 0]);
  });

  it("names the person's weekday, not the server's", () => {
    const auckland = wallClock('Pacific/Auckland', new Date('2026-10-10T14:00:00Z'));
    expect(auckland.toLocaleDateString('en-US', { weekday: 'long' })).toBe('Sunday');
  });

  it("falls back to the server's clock without a zone it knows", () => {
    expect(wallClock(undefined, INSTANT)).toBe(INSTANT);
    expect(wallClock('', INSTANT)).toBe(INSTANT);
    expect(wallClock('Not/AZone', INSTANT)).toBe(INSTANT);
    expect(wallClock('Europe/London'.padEnd(200, 'x'), INSTANT)).toBe(INSTANT);
  });

  it('falls back rather than return an Invalid Date when Intl leaves a part out', () => {
    const spy = vi
      .spyOn(Intl.DateTimeFormat.prototype, 'formatToParts')
      .mockReturnValue([{ type: 'hour', value: '9' }]);
    try {
      expect(wallClock('Asia/Kolkata', INSTANT)).toBe(INSTANT);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('timeOfDay', () => {
  it('is morning in London and night in Los Angeles at the same instant', () => {
    expect(timeOfDay(wallClock('Europe/London', INSTANT))).toBe('morning');
    expect(timeOfDay(wallClock('America/Los_Angeles', INSTANT))).toBe('night');
    expect(timeOfDay(wallClock('Asia/Tokyo', INSTANT))).toBe('evening');
  });

  it('keeps the boundaries', () => {
    const at = (h: number) => timeOfDay(new Date(2026, 9, 10, h));
    expect([4, 5, 11, 12, 16, 17, 20, 21].map(at)).toEqual([
      'night',
      'morning',
      'morning',
      'afternoon',
      'afternoon',
      'evening',
      'evening',
      'night',
    ]);
  });
});
