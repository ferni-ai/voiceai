import type { FlagSpec } from '../flag-spec.js';

// on: a handoff whose swap fails after the tool was told it worked is said plainly: the persona still on the call gets a note and says the teammate could not join (multi-agent/handoff-failed-say-so.ts)
export const HANDOFF_FAILED_SAY_SO = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
