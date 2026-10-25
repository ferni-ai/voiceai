import type { FlagSpec } from '../flag-spec.js';

// On: one per-call laugh ledger (agents/personas/laugh-ledger.ts) every laugh path asks:
// at most 4 a call, 2 replies apart, only after a caller cue, never within 3 turns of a
// heavy, venting or crisis turn, never on a reply an opening or laugh clip already opened.
// Off (the kill switch): laughs as before.
export const LAUGH_CAP = {
  default: 'on',
  owner: 'voice',
  kind: 'kill-switch',
} as const satisfies FlagSpec;
