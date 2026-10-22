import type { FlagSpec } from '../flag-spec.js';

// on: sustained caller speech pauses Ferni and cuts the reply only when words or the barge-in model confirm (multi-agent/barge-in-soft-pause.ts)
export const BARGE_IN_SOFT_PAUSE = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
