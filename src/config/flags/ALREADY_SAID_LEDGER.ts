import type { FlagSpec } from '../flag-spec.js';

// on: the told-this-call note (told-this-call.ts, needs TOLD_THIS_CALL, on by default) also lists Ferni's own recent reply openers and any sentence he said word for word (after normalising case and punctuation) in 2+ of his last replies (already-said.ts), so the next reply doesn't repeat them. Crisis, safety, 988 and notice lines are never listed. A note only; no reply is rewritten. Off: the note is exactly as before. Experiment: review by 2027-02-03.
export const ALREADY_SAID_LEDGER = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
