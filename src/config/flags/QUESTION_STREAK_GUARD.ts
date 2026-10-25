import type { FlagSpec } from '../flag-spec.js';

// on: when Ferni's last 2+ replies in a row ended on a question (cut replies count, backchannels skipped), the told-this-call note (told-this-call.ts, needs TOLD_THIS_CALL, on by default) asks the next reply to end without one (question-streak.ts). Never when the streak holds a safety question, nor on a call with crisis risk noted. A note only; no reply is rewritten. Off: the note is exactly as before.
export const QUESTION_STREAK_GUARD = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
