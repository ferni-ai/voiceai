import type { FlagSpec } from '../flag-spec.js';

// on: a pattern-mirror (self-sabotage) insight reaches the prompt once per call and is then stored as shared, so it stops coming back every third turn of every call (agents/voice-agent/commitment-follow-up-gate.ts, #3167); off = it is never marked shared, as before.
export const PATTERN_MIRROR_ONCE = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;
