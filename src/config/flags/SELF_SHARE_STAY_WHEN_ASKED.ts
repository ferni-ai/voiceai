import type { FlagSpec } from '../flag-spec.js';

// on (with FERNI_STATE): a turn that is only a plain question about him (STAY_ASKS, self-share-stay.ts), on a call no safety reader has marked: he answers and isn't told to hand the question straight back. Any other turn reads as main. Off: every line as before.
export const SELF_SHARE_STAY_WHEN_ASKED = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-03',
  issue: '#3475',
  context:
    'Keep if your-day-specific dev evals with it on show no question handed back and understanding >= 3; else delete.',
} as const satisfies FlagSpec;
