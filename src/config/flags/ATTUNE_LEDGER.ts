import type { FlagSpec } from '../flag-spec.js';

// on: ATTUNE reads low/upbeat/mixed from an evidence ledger (attune-ledger.ts): cues with source and expiry, 2 cues to enter low, 1 explicit positive exits, per-caller length baseline, prosody as arousal/conflict only. Read in turn-attunement.ts attunementNote; off = ATTUNE unchanged.
export const ATTUNE_LEDGER = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
