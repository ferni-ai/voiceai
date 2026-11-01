import type { FlagSpec } from '../flag-spec.js';

// on: the arrival cue says the call is one-to-one, and group openers (hey everyone, listening in) are cut from the line (multi-agent/handoff-arrival.ts)
export const HANDOFF_ARRIVAL_ONE_TO_ONE = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
