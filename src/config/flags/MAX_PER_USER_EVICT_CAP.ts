import type { FlagSpec } from '../flag-spec.js';

// On: one write under an entity type's maxPerUser cap removes at most two of the user's oldest docs of that type (MAX_EVICTIONS_PER_WRITE, services/data-layer/max-per-user.ts), so a user already over the cap drains by one per write instead of losing the whole backlog at once. Off (the kill switch): every excess doc is removed in one write, as before.
export const MAX_PER_USER_EVICT_CAP = {
  default: 'on',
  owner: 'memory',
  kind: 'kill-switch',
  issue: '#3489',
  context:
    'Kill-switch, not experiment: a guard that only ever removes fewer docs than before, so it is on before #3479 deploys with no env flip; remove it per #3489 once over-cap users have drained.',
} as const satisfies FlagSpec;
