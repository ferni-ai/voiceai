import type { FlagSpec } from '../flag-spec.js';

// off | on: when the crisis classifier reads one turn twice (everyday rules on, risk words in the latest caller line) and one read is imminent while the other is none, the turn gets crisis guidance with 988 instead of the 911 script (crisis-everyday.ts combineReads). Agreement on imminent, a crisis read, a missing read or a pattern match keeps the script.
export const CRISIS_IMMINENT_NEEDS_AGREEMENT = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;
