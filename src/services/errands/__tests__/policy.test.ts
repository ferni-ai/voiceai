import { describe, expect, it } from 'vitest';
import { DEFAULT_POLICY, parallelAllowed, withinHours } from '../policy.js';
import { describeApproval, isSafePlaceId, sameApproval, type Errand } from '../errand.js';

const ZONE = 'America/New_York';
const at = (iso: string): Date => new Date(iso);

describe('withinHours', () => {
  it('keeps a time inside the default 09:00-17:00', () => {
    const t = at('2026-10-20T14:00:00.000Z'); // 10:00 in New York
    expect(withinHours(t, undefined, ZONE)).toBe(t);
  });

  it('moves a time before opening to that morning, and after closing to the next morning', () => {
    expect(withinHours(at('2026-10-20T11:00:00.000Z'), undefined, ZONE).toISOString()).toBe(
      '2026-10-20T13:00:00.000Z'
    );
    expect(withinHours(at('2026-10-20T22:00:00.000Z'), undefined, ZONE).toISOString()).toBe(
      '2026-10-21T13:00:00.000Z'
    );
  });

  it('uses the place hours when they are well formed, else the default', () => {
    const t = at('2026-10-20T22:00:00.000Z'); // 18:00 in New York
    expect(withinHours(t, { open: '08:00', close: '20:00' }, ZONE)).toBe(t);
    expect(withinHours(t, { open: '9am', close: '5pm' }, ZONE).toISOString()).toBe(
      '2026-10-21T13:00:00.000Z'
    );
    expect(withinHours(t, { open: '20:00', close: '08:00' }, ZONE).toISOString()).toBe(
      '2026-10-21T13:00:00.000Z'
    );
  });
});

describe('parallelAllowed', () => {
  const errand = (urgency?: 'normal' | 'any-slot') =>
    ({ constraints: { prefs: [], ...(urgency ? { urgency } : {}) } }) as unknown as Errand;

  it('needs both the policy and an any-slot errand', () => {
    expect(parallelAllowed(errand('any-slot'), { ...DEFAULT_POLICY, parallel: true })).toBe(true);
    expect(parallelAllowed(errand('normal'), { ...DEFAULT_POLICY, parallel: true })).toBe(false);
    expect(parallelAllowed(errand('any-slot'), DEFAULT_POLICY)).toBe(false);
  });
});

describe('approvals', () => {
  it('match only the same verb and the same places in the same order', () => {
    const a = { verb: 'call', placeIds: ['p1', 'p2'] } as const;
    expect(sameApproval(a, { verb: 'call', placeIds: ['p1', 'p2'] })).toBe(true);
    expect(sameApproval(a, { verb: 'call', placeIds: ['p1'] })).toBe(false);
    expect(sameApproval(a, { verb: 'book', placeIds: ['p1', 'p2'] })).toBe(false);
    expect(describeApproval(a)).toBe('call:p1+p2');
  });

  it('a place id with a separator or control character is not safe', () => {
    expect(isSafePlaceId('ChIJN1t_tDeuEmsRUsoyG83frY4')).toBe(true);
    for (const bad of ['p1+p2', 'call:p2', 'p1\n', '', 'a/b'])
      expect(isSafePlaceId(bad)).toBe(false);
  });
});
