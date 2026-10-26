import type { FlagSpec } from '../flag-spec.js';

// on: the told-this-call note (told-this-call.ts, needs TOLD_THIS_CALL, on by default) also names the stock phrases Ferni said in 2+ of his last 8 replies (phrase-loops.ts): lead-ins, closers and 3-6 word runs like "fair and square" or "glad to hear it", minus function-word-only runs, the caller's own topic words and any reply with a crisis resource. A note only; no reply is rewritten. Off: the note is exactly as before.
export const PHRASE_LOOP_GUARD = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
