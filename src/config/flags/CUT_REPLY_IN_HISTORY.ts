import type { FlagSpec } from '../flag-spec.js';

// on: a reply the caller cut off goes into the chat context, marked as cut (the part they didn't hear, or all of it), so the model, the director and TOLD_THIS_CALL see it; and the next reply, if it opens as a near-copy of the cut one, is asked again once with a note to answer what the caller just said (cut-reply-history.ts, cut-reply-guard.ts, #2422). Off: the chat keeps only what LiveKit committed, as before.
export const CUT_REPLY_IN_HISTORY = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
