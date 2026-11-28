import type { FlagSpec } from '../flag-spec.js';

// on: LiveKit's barge-in pause of Ferni's reply (the model called the caller's overlap an interruption) is applied only if the caller is still speaking PAUSE_HOLD_MS later (resume-buffer.ts). A backchannel ("mm-hm") that ends first never pauses or clears the audio, and the reply plays straight through; a caller still speaking, or a verdict to cut the reply, stops it as before (the soft pause's own pause is never held). Dev 2026-11-28: the model scored "mm-hm" an interruption after 0.02 s of overlap, BARGE_IN_FAST_STOP cleared the audio at once, and 2 of 3 backchannels stopped Ferni mid-sentence for ~1.7 s (#4548). Off: the pause is applied at once, as on main.
export const BARGE_IN_PAUSE_HOLD = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
