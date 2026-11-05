import type { FlagSpec } from '../flag-spec.js';

// on: one write under an entity type's maxPerUser cap removes at most two of the user's oldest docs of that type (MAX_EVICTIONS_PER_WRITE, services/data-layer/max-per-user.ts), so a user already over the cap drains by one per write instead of losing the whole backlog at once. off: every excess doc is removed in one write, as before.
export const MAX_PER_USER_EVICT_CAP = {
  default: 'on',
  owner: 'memory',
  kind: 'experiment',
  expires: '2027-02-03',
  issue: '#3489',
  context:
    'Keep while maxPerUser can find a user over the cap; delete once every store reads the per-type count (after #3479) and no capped write is logged for 30 days.',
} as const satisfies FlagSpec;
