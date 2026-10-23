import type { FlagSpec } from '../flag-spec.js';

// On: retrieved memories (and the background judge picks, which join retrieval) join after
// what processTurn kept, which stays untouched, and use only the budget it leaves, through
// the crisis/mode filter (agents/voice-agent/retrieval-join.ts). Off: appended, no limit.
export const RETRIEVAL_FILTERED = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
} as const satisfies FlagSpec;
