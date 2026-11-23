import type { FlagSpec } from '../flag-spec.js';

// on: a persona's spontaneous self-shares back off in two steps within a session, as the code intended: more than 4 shares so far scales the chance by 0.2, more than 2 by 0.5 (spontaneous-vulnerability.ts calculateProbabilityAdjustment). Off: the 0.2 step is never reached, so 5 or more shares back off only by 0.5, as today.
export const SPONTANEOUS_SHARE_BACKOFF = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-16',
  issue: '#4045',
  context: 'Make permanent once dev shows no change beyond fewer late-session shares; else delete.',
} as const satisfies FlagSpec;
