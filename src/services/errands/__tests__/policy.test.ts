import { describe, expect, it } from 'vitest';
import type { Errand } from '../errand.js';
import {
  DEFAULT_POLICY,
  inWindow,
  nextDialAt,
  parallelAllowed,
  textWaitMs,
  withinHours,
} from '../policy.js';

const ZONE = 'America/New_York';
const at = (iso: string): Date => new Date(iso);
const iso = (d: Date): string => d.toISOString();
// 2026-10-20 is a Tuesday; 10:00 in New York is 14:00Z.
const TUE_10 = at('2026-10-20T14:00:00.000Z');

describe('withinHours', () => {
  it('keeps a weekday time inside 09:00-17:00', () => {
    expect(withinHours(TUE_10, undefined, ZONE)).toBe(TUE_10);
  });

  it('before opening waits for that morning; after closing, the next weekday morning', () => {
    expect(iso(withinHours(at('2026-10-20T11:00:00.000Z'), undefined, ZONE))).toBe(
      '2026-10-20T13:00:00.000Z'
    );
    expect(iso(withinHours(at('2026-10-20T22:00:00.000Z'), undefined, ZONE))).toBe(
      '2026-10-21T13:00:00.000Z'
    );
  });

  it('skips the weekend by default: Friday evening waits for Monday', () => {
    const friEvening = at('2026-10-23T22:00:00.000Z');
    expect(iso(withinHours(friEvening, undefined, ZONE))).toBe('2026-10-26T13:00:00.000Z');
    const saturdayNoon = at('2026-10-24T16:00:00.000Z');
    expect(iso(withinHours(saturdayNoon, undefined, ZONE))).toBe('2026-10-26T13:00:00.000Z');
  });

  it('place hours override, including the days they name', () => {
    const saturdayNoon = at('2026-10-24T16:00:00.000Z');
    const weekend = { open: '10:00', close: '14:00', days: [6] };
    expect(withinHours(saturdayNoon, weekend, ZONE)).toBe(saturdayNoon);
    const late = at('2026-10-20T22:00:00.000Z'); // Tue 18:00
    expect(withinHours(late, { open: '08:00', close: '20:00' }, ZONE)).toBe(late);
  });

  it('falls back to the default for malformed hours', () => {
    const late = at('2026-10-20T22:00:00.000Z');
    for (const bad of [
      { open: '9am', close: '5pm' },
      { open: '20:00', close: '08:00' },
    ]) {
      expect(iso(withinHours(late, bad, ZONE))).toBe('2026-10-21T13:00:00.000Z');
    }
  });
});

describe('nextDialAt: 2 calls per number per rolling day', () => {
  it('allows a call when fewer than 2 were made in the last 24 hours', () => {
    expect(nextDialAt(TUE_10, ['2026-10-20T12:00:00.000Z'], 2, undefined, ZONE)).toBe(TUE_10);
  });

  it('a third call waits until the oldest of the two is a day old, inside hours', () => {
    const dials = ['2026-10-20T13:30:00.000Z', '2026-10-20T15:30:00.000Z']; // 09:30, 11:30
    const third = nextDialAt(at('2026-10-20T17:30:00.000Z'), dials, 2, undefined, ZONE);
    expect(third.getTime()).toBe(Date.parse('2026-10-21T13:30:00.000Z') + 1);
  });

  it('calls older than a day do not count', () => {
    const old = ['2026-10-19T12:00:00.000Z', '2026-10-19T13:00:00.000Z'];
    expect(nextDialAt(TUE_10, old, 2, undefined, ZONE)).toBe(TUE_10);
  });
});

describe('booking window, parallel and text waits', () => {
  it('a booking must be a real time inside the window', () => {
    const window = { from: '2026-10-21T00:00:00.000Z', to: '2026-11-26T00:00:00.000Z' };
    expect(inWindow('2026-10-27T13:00:00.000Z', window)).toBe(true);
    expect(inWindow('2026-12-01T13:00:00.000Z', window)).toBe(false);
    expect(inWindow('2026-10-20T13:00:00.000Z', window)).toBe(false);
    expect(inWindow('next tuesday', window)).toBe(false);
    expect(inWindow(undefined, undefined)).toBe(false);
    expect(inWindow('2026-10-27T13:00:00.000Z', undefined)).toBe(true);
  });

  const errand = (urgency?: 'normal' | 'any-slot') =>
    ({ constraints: { prefs: [], ...(urgency ? { urgency } : {}) } }) as unknown as Errand;

  it('parallel needs both the policy and an any-slot errand', () => {
    expect(parallelAllowed(errand('any-slot'), { ...DEFAULT_POLICY, parallel: true })).toBe(true);
    expect(parallelAllowed(errand('normal'), { ...DEFAULT_POLICY, parallel: true })).toBe(false);
    expect(parallelAllowed(errand('any-slot'), DEFAULT_POLICY)).toBe(false);
  });

  it('an any-slot text waits 2 hours for a reply, anything else a day', () => {
    expect(textWaitMs(errand('any-slot'), DEFAULT_POLICY)).toBe(2 * 3_600_000);
    expect(textWaitMs(errand(), DEFAULT_POLICY)).toBe(24 * 3_600_000);
  });
});
