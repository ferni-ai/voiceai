import { describe, expect, it } from 'vitest';
import { greetingFacts, partOfDayFor } from '../../multi-agent/greeting-direction.js';
import { callerHour } from '../time-context.js';

describe('the caller hour for a greeting', () => {
  // 05:10 UTC: morning on the server, 1:10 a.m. for a caller in New York (dev, 2026-10-06).
  const now = new Date('2026-10-06T05:10:00Z');

  it("is the caller's hour, not the server's", () => {
    expect(callerHour(now, 'America/New_York')).toBe(1);
    expect(callerHour(now, 'America/Denver')).toBe(23);
    expect(partOfDayFor(callerHour(now, 'America/New_York') as number)).toBe('late night');
  });

  it('is unknown without a valid time zone, and the greeting then names no time of day', () => {
    expect(callerHour(now, undefined)).toBeNull();
    expect(callerHour(now, 'Not/AZone')).toBeNull();
    expect(greetingFacts('', 'Sam', undefined)).toEqual({ 'their name': 'Sam' });
    expect(greetingFacts('morning', 'Sam', undefined)).toEqual({
      'time of day': 'morning',
      'their name': 'Sam',
    });
  });
});
