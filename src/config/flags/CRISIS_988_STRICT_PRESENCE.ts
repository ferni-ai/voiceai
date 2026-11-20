import type { FlagSpec } from '../flag-spec.js';

// on: names988 and says988 (the 988 floor, the timeout check-in, the SMS lifeline tail) no longer read "988 dollars", "1-988-555" or "9 8 8 0" as the crisis line, so those replies still get the line added (#4026). offersCrisisLine, reachesHelp, isCrisisCall and the speech rewrite keep the wide reader. Off: main's reader everywhere.
export const CRISIS_988_STRICT_PRESENCE = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: '#4026',
  context:
    'Make permanent once the equivalence table holds on dev replies (only the three non-line forms differ); else delete.',
} as const satisfies FlagSpec;
