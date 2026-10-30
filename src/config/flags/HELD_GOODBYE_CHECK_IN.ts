import type { FlagSpec } from '../flag-spec.js';

// on: after a reopen, a goodbye pair whose end is held only because its turn got no crisis read (goodbye-read.ts) gets one gentle check-in after 20 s of quiet instead of 120 s of silence (#2695); the call still ends only by the reopen idle. Never on a call with crisis risk.
export const HELD_GOODBYE_CHECK_IN = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
