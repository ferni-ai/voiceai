import type { FlagSpec } from '../flag-spec.js';

// on: at a single-session handoff the teammate is set up while the goodbye plays, and the
// speech coordinator's echo cooldown (750 ms to 2 s) between the goodbye and the teammate's
// first line drops to 150 ms (agents/multi-agent/handoff-fast-arrival.ts).
export const HANDOFF_FAST_ARRIVAL = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
