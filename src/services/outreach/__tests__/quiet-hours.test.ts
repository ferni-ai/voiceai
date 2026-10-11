/**
 * One quiet-hours predicate, read in the user's local time. Cloud Run's clock
 * is UTC, so a server-clock 22:00-08:00 check lets messages reach an ET user
 * at 04:00. All instants below are UTC; 2026-10-11 is EDT (UTC-4) / PDT (UTC-7).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let userDoc: Record<string, unknown> | undefined;
vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: () => ({
      doc: () => ({ get: async () => ({ exists: !!userDoc, data: () => userDoc }) }),
    }),
  }),
}));
vi.mock('../../contacts/optimal-timing.js', () => ({ getTimingRecommendation: vi.fn() }));

const qh = await import('../quiet-hours.js');
const { evaluateTiming } = await import('../scheduling/send-window-optimizer.js');

const at = (iso: string): Date => new Date(iso);
/** 04:00 in New York. */
const NY_4AM = at('2026-10-11T08:00:00Z');
/** 09:30 in New York, 06:30 in Los Angeles. */
const NY_930 = at('2026-10-11T13:30:00Z');
const NY = 'America/New_York';
const LA = 'America/Los_Angeles';

const savedTz = process.env.TZ;
beforeEach(() => {
  userDoc = undefined;
  delete process.env.QUIET_HOURS_UNIFIED;
});
afterEach(() => {
  delete process.env.QUIET_HOURS_UNIFIED;
  process.env.TZ = savedTz;
});

describe('isUserQuiet: time zone', () => {
  it('a New York user at 4am ET is quiet, and at 9:30am is not', () => {
    const ny = { outreachPreferences: { timezone: NY } };
    expect(qh.isUserQuiet(ny, NY_4AM)).toBe(true);
    expect(qh.isUserQuiet(ny, NY_930)).toBe(false);
  });

  it('falls back from outreachPreferences.timezone to contactInfo.timezone', () => {
    expect(qh.isUserQuiet({ contactInfo: { timezone: LA } }, NY_930)).toBe(true);
    expect(qh.isUserQuiet({ contactInfo: { timezone: NY } }, NY_930)).toBe(false);
    const both = { outreachPreferences: { timezone: NY }, contactInfo: { timezone: LA } };
    expect(qh.isUserQuiet(both, NY_930)).toBe(false);
    const invalid = {
      outreachPreferences: { timezone: 'Not/AZone' },
      contactInfo: { timezone: LA },
    };
    expect(qh.isUserQuiet(invalid, NY_930)).toBe(true);
  });

  it('with no time zone, it is quiet while it is quiet on either coast', () => {
    expect(qh.quietZonesOf(undefined)).toEqual([NY, LA]);
    expect(qh.isUserQuiet(undefined, NY_930)).toBe(true); // 06:30 in LA
    expect(qh.isUserQuiet(undefined, at('2026-10-11T16:00:00Z'))).toBe(false); // noon ET, 9am PT
  });
});

describe('quietWindowOf: both stored shapes', () => {
  const nineThirtyPmET = at('2026-10-12T01:30:00Z');
  it('reads quietHours {enabled, start, end}', () => {
    const user = {
      outreachPreferences: {
        timezone: NY,
        quietHours: { enabled: true, start: '21:00', end: '07:00' },
      },
    };
    expect(qh.quietWindowOf(user)).toEqual({ startMin: 21 * 60, endMin: 7 * 60 });
    expect(qh.isUserQuiet(user, nineThirtyPmET)).toBe(true);
  });

  it('reads quietHoursStart/End hours', () => {
    const user = { outreachPreferences: { timezone: NY, quietHoursStart: 21, quietHoursEnd: 7 } };
    expect(qh.quietWindowOf(user)).toEqual({ startMin: 21 * 60, endMin: 7 * 60 });
    expect(qh.isUserQuiet(user, nineThirtyPmET)).toBe(true);
  });

  it('defaults to 22:00-08:00, and quietHours turned off means none', () => {
    expect(qh.quietWindowOf({})).toEqual(qh.DEFAULT_QUIET_WINDOW);
    expect(qh.isUserQuiet({ outreachPreferences: { timezone: NY } }, nineThirtyPmET)).toBe(false);
    const off = { outreachPreferences: { timezone: NY, quietHours: { enabled: false } } };
    expect(qh.quietWindowOf(off)).toBeNull();
    expect(qh.isUserQuiet(off, NY_4AM)).toBe(false);
  });
});

describe('quietEndsAt', () => {
  it('ends at 8am local, and on the later coast when the zone is unknown', () => {
    const w = qh.DEFAULT_QUIET_WINDOW;
    expect(qh.quietEndsAt(NY_4AM, w, [NY]).toISOString()).toBe('2026-10-11T12:00:00.000Z');
    expect(qh.quietEndsAt(NY_930, w, [NY, LA]).toISOString()).toBe('2026-10-11T15:00:00.000Z');
    expect(qh.quietEndsAt(NY_930, w, [NY])).toBe(NY_930);
  });
});

describe('userQuietHours reads the stored user', () => {
  it('a NY user at 4am ET is quiet until 8am ET', async () => {
    userDoc = { outreachPreferences: { timezone: NY } };
    const r = await qh.userQuietHours('u1', NY_4AM);
    expect(r.quiet).toBe(true);
    expect(r.until.toISOString()).toBe('2026-10-11T12:00:00.000Z');
  });

  it('callQuietHours is the old server-clock check unless QUIET_HOURS_UNIFIED=on', async () => {
    process.env.TZ = 'UTC';
    userDoc = { outreachPreferences: { timezone: NY } };
    expect((await qh.callQuietHours('u1', NY_4AM)).quiet).toBe(false);
    process.env.QUIET_HOURS_UNIFIED = 'on';
    expect((await qh.callQuietHours('u1', NY_4AM)).quiet).toBe(true);
  });
});

describe('send-window-optimizer behind QUIET_HOURS_UNIFIED', () => {
  const state = {
    userId: 'u1',
    preferences: { quietHoursStart: '22:00', quietHoursEnd: '08:00', timezone: NY },
    patterns: { preferredHours: [], preferredDays: [] },
  } as never;
  const trigger = { priority: 'high' } as never;

  it('off: the server clock (UTC) lets 4am ET through', async () => {
    process.env.TZ = 'UTC';
    const r = await evaluateTiming(state, trigger, NY_4AM);
    expect(r.reason).not.toBe('Quiet hours');
  });

  it('on: 4am ET is quiet and waits until 8am ET', async () => {
    process.env.TZ = 'UTC';
    process.env.QUIET_HOURS_UNIFIED = 'on';
    const r = await evaluateTiming(state, trigger, NY_4AM);
    expect(r).toMatchObject({ defer: true, reason: 'Quiet hours' });
    expect(r.deferUntil?.toISOString()).toBe('2026-10-11T12:00:00.000Z');
  });
});
