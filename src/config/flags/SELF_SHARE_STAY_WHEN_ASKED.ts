import type { FlagSpec } from '../flag-spec.js';

// on (with FERNI_STATE): asked about himself, he answers and isn't told to hand the question straight back (self-share-asked.ts); callerMove also hears more ways of asking about him, "what'd you get up to", "is that a normal day for you" (caller-move.ts). Off: every line and every turn's reading as before.
export const SELF_SHARE_STAY_WHEN_ASKED = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-03',
  issue: '#3475',
  context:
    'Keep if your-day-specific dev evals with it on show no question handed back and understanding >= 3; else delete.',
} as const satisfies FlagSpec;
