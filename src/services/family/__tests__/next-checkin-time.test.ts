/**
 * Check-ins come due at preferredTime on the family member's clock, not the
 * server's (Cloud Run is UTC), including across daylight-saving changes.
 */
import { describe, expect, it } from 'vitest';
import { calculateNextCallTime, type NextCheckinInput } from '../next-checkin-time.js';

const base: NextCheckinInput = {
  frequency: 'daily',
  preferredTime: '18:00',
  timezone: 'America/Los_Angeles',
};

describe('calculateNextCallTime', () => {
  it('rings at 6pm Pacific, not 6pm UTC', () => {
    // 2026-10-17 15:00 UTC is 08:00 in Los Angeles (PDT, UTC-7).
    const next = calculateNextCallTime(base, new Date('2026-10-17T15:00:00Z'));
    expect(next).toBe('2026-10-19T01:00:00.000Z');
  });

  it('uses the family member’s date, not the server’s', () => {
    // 2026-10-18 03:00 UTC is still Oct 17 at 20:00 in Los Angeles.
    const next = calculateNextCallTime(base, new Date('2026-10-18T03:00:00Z'));
    expect(next).toBe('2026-10-19T01:00:00.000Z');
  });

  it('keeps the wall time across the end of daylight saving', () => {
    // US DST ends 2026-11-01; a call on Nov 1 at 18:00 is PST (UTC-8).
    const next = calculateNextCallTime(base, new Date('2026-10-31T15:00:00Z'));
    expect(next).toBe('2026-11-02T02:00:00.000Z');
  });

  it('lands a weekly check-in on the chosen local day', () => {
    // Sat 2026-10-17 in Tokyo; next Monday 09:30 JST is Sun 00:30 UTC.
    const next = calculateNextCallTime(
      {
        frequency: 'weekly',
        daysOfWeek: ['monday'],
        preferredTime: '09:30',
        timezone: 'Asia/Tokyo',
      },
      new Date('2026-10-17T05:00:00Z')
    );
    expect(next).toBe('2026-10-19T00:30:00.000Z');
  });

  it('adds a week for biweekly', () => {
    const next = calculateNextCallTime(
      {
        frequency: 'biweekly',
        daysOfWeek: ['monday'],
        preferredTime: '09:30',
        timezone: 'Asia/Tokyo',
      },
      new Date('2026-10-17T05:00:00Z')
    );
    expect(next).toBe('2026-10-26T00:30:00.000Z');
  });

  it('lands a monthly check-in on the same day next month', () => {
    const next = calculateNextCallTime(
      { ...base, frequency: 'monthly' },
      new Date('2026-10-17T15:00:00Z')
    );
    expect(next).toBe('2026-11-18T02:00:00.000Z');
  });

  it('ignores a day it does not know instead of looping', () => {
    const next = calculateNextCallTime(
      { ...base, frequency: 'weekly', daysOfWeek: ['someday' as 'monday'] },
      new Date('2026-10-17T15:00:00Z')
    );
    expect(next).toBe('2026-10-19T01:00:00.000Z');
  });

  it('falls back to UTC for an unknown zone', () => {
    const next = calculateNextCallTime(
      { ...base, timezone: 'Not/AZone' },
      new Date('2026-10-17T15:00:00Z')
    );
    expect(next).toBe('2026-10-18T18:00:00.000Z');
  });
});
