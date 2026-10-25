import { describe, expect, it } from 'vitest';

import type { Cohort, CohortStore } from '../cohort-flags.js';
import { isCohortMember } from '../cohort-membership.js';

const store = (cohorts: Record<string, Cohort[]>): Pick<CohortStore, 'cohortsFor'> => ({
  cohortsFor: async (u) => cohorts[u] ?? [],
});

describe('isCohortMember', () => {
  const ff = (enabled: boolean): Cohort => ({ id: 'friends-and-family', enabled, flags: {} });
  it('a named member of the enabled cohort is one; a disabled cohort or another cohort is not', async () => {
    const s = store({
      a: [ff(true)],
      b: [ff(false)],
      c: [{ id: 'seth', enabled: true, flags: {} }],
    });
    expect(await isCohortMember('friends-and-family', 'a', s)).toBe(true);
    expect(await isCohortMember('friends-and-family', 'b', s)).toBe(false);
    expect(await isCohortMember('friends-and-family', 'c', s)).toBe(false);
    expect(await isCohortMember('friends-and-family', 'nobody', s)).toBe(false);
  });
});
