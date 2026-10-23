import type { FlagSpec } from '../flag-spec.js';

// on: a phone caller's PAUSE_HOLD stops treating a wordless "speaking" state (line noise, a room
// behind the caller) as the caller going on, and a hold with no new words ends by 1.3 s instead of
// 2.5 s. New words during the hold keep the full hold (speech/output-control/pause-hold.ts).
export const PAUSE_HOLD_PHONE_CAP = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
