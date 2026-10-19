import { describe, expect, it } from 'vitest';
import { describeApproval, isSafePlaceId, sameApproval, STEP_VERSIONS } from '../errand.js';

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

  it('lists the rules versions there are', () => {
    expect(STEP_VERSIONS).toEqual([1]);
  });
});
