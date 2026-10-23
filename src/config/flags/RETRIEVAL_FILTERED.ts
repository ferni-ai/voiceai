import type { FlagSpec } from '../flag-spec.js';

// On: retrieved memories (and the background judge picks, which join retrieval) join the turn injections
// before the dedup and the crisis/mode filter, not after them, so a crisis turn filter sees them
// (agents/voice-agent/retrieval-join.ts). Off: appended after the filter, as before.
export const RETRIEVAL_FILTERED = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
} as const satisfies FlagSpec;
