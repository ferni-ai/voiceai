import type { FlagSpec } from '../flag-spec.js';

// on: "I'll call now." with no one named counts as a call claim (action-claims.ts), so after a held or unconfirmed call the action-claim guard says what really happened (#2735). Off: only "I'll call her now." and the like count, as before.
export const ACTION_CLAIM_BARE_WILL = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
} as const satisfies FlagSpec;
