import type { FlagSpec } from '../flag-spec.js';

// on: a soft pause decided 'interrupted' clears its watchdog, so the pause gets one outcome and
// the cut reply's held audio is never released (multi-agent/barge-in-fastpath.ts). Off, the
// watchdog still logs a second outcome and resumes the output mid-cut, as before.
export const SOFT_PAUSE_ONE_OUTCOME = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: '#3857',
} as const satisfies FlagSpec;
