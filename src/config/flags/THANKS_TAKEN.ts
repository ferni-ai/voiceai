import type { FlagSpec } from '../flag-spec.js';

// on: a caller's mid-call thank-you or kind word about Ferni adds a one-turn note to take it in his own words before going on (thanks-taken.ts, turn-extras.ts, #3877). Off: no note, as before.
export const THANKS_TAKEN = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
