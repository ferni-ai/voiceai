// Prod servers run in UTC; pin it so a dev machine's own zone can't mask the bug.
process.env.TZ = 'UTC';

import { describe, expect, it } from 'vitest';
import { parseNaturalTime } from '../reminder-scheduler.js';
import { formatStoredLocalTime } from '../../../utils/time-zone.js';

const NY = 'America/New_York';
// 22:41 on Sunday 2026-10-11 in New York (EDT, UTC-4): already Monday in UTC.
const LATE_SUNDAY_NY = new Date('2026-10-12T02:41:00Z');

describe('parseNaturalTime in the user zone', () => {
  it('"tomorrow at noon" at 22:41 New York is noon Monday New York, not UTC', () => {
    const t = parseNaturalTime('tomorrow at noon', NY, LATE_SUNDAY_NY);
    // Before the fix this was 2026-10-13T12:00Z: 8 AM ET the day after.
    expect(t?.toISOString()).toBe('2026-10-12T16:00:00.000Z');
    expect(formatStoredLocalTime(t!, NY, LATE_SUNDAY_NY)).toBe(
      'tomorrow, Oct 12, 12:00 PM your time'
    );
  });

  it('uses the offset of the target day across a DST change', () => {
    // Sat 2026-03-07 22:00 EST (UTC-5); clocks go forward Sun 03-08 at 2 AM.
    const saturdayNight = new Date('2026-03-08T03:00:00Z');
    expect(parseNaturalTime('tomorrow at 9am', NY, saturdayNight)?.toISOString()).toBe(
      '2026-03-08T13:00:00.000Z' // 9 AM EDT (UTC-4)
    );
    // An hour after the jump: needs the offset in force at the result, not at the guess.
    expect(parseNaturalTime('tomorrow at 3:30am', NY, saturdayNight)?.toISOString()).toBe(
      '2026-03-08T07:30:00.000Z'
    );
    expect(parseNaturalTime('in 1 day', NY, saturdayNight)?.toISOString()).toBe(
      '2026-03-09T02:00:00.000Z' // 22:00 EDT Sunday: same wall time, 23 h later
    );
  });

  it('works for a zone east of UTC with a half-hour offset', () => {
    // 2026-10-12 23:30 in Kolkata (UTC+5:30) is 18:00Z.
    const lateKolkata = new Date('2026-10-12T18:00:00Z');
    expect(
      parseNaturalTime('tomorrow at 8:30 am', 'Asia/Kolkata', lateKolkata)?.toISOString()
    ).toBe('2026-10-13T03:00:00.000Z');
    expect(formatStoredLocalTime('2026-10-13T03:00:00.000Z', 'Asia/Kolkata', lateKolkata)).toBe(
      'tomorrow, Oct 13, 8:30 AM your time'
    );
  });

  it('reads weekday names, noon and evening times in the user zone', () => {
    // Sunday 22:41 NY: "Monday" is tomorrow there.
    expect(parseNaturalTime('Monday at 8am', NY, LATE_SUNDAY_NY)?.toISOString()).toBe(
      '2026-10-12T12:00:00.000Z'
    );
    // A bare time that has passed today is tomorrow's.
    expect(parseNaturalTime('at 7pm', NY, LATE_SUNDAY_NY)?.toISOString()).toBe(
      '2026-10-12T23:00:00.000Z'
    );
    expect(parseNaturalTime('tomorrow evening at 8', NY, LATE_SUNDAY_NY)?.toISOString()).toBe(
      '2026-10-13T00:00:00.000Z'
    );
  });

  it('reads an offset-less ISO time as the user wall time', () => {
    expect(parseNaturalTime('2026-10-13T08:00', NY, LATE_SUNDAY_NY)?.toISOString()).toBe(
      '2026-10-13T12:00:00.000Z'
    );
    expect(parseNaturalTime('2026-10-13T08:00:00Z', NY, LATE_SUNDAY_NY)?.toISOString()).toBe(
      '2026-10-13T08:00:00.000Z'
    );
  });

  it('keeps relative minutes and hours absolute', () => {
    expect(parseNaturalTime('in 30 minutes', NY, LATE_SUNDAY_NY)?.toISOString()).toBe(
      '2026-10-12T03:11:00.000Z'
    );
  });

  it('falls back to UTC without a zone and says so when read back', () => {
    const t = parseNaturalTime('tomorrow at noon', undefined, LATE_SUNDAY_NY);
    expect(t?.toISOString()).toBe('2026-10-13T12:00:00.000Z');
    expect(formatStoredLocalTime(t!, undefined, LATE_SUNDAY_NY)).toBe(
      "tomorrow, Oct 13, 12:00 PM UTC (I don't know your time zone yet)"
    );
    expect(parseNaturalTime('whenever', NY, LATE_SUNDAY_NY)).toBeNull();
  });
});
