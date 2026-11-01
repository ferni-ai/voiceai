import type { FlagSpec } from '../flag-spec.js';

// on: a crisis risk phrase never counts inside a longer, different everyday word ("end it" in "resend it", "die" in "diet", "son" in "song"): a risk check counts only where it still matches with the listed everyday words blanked out, so it can only remove such a match (utils/crisis-word-boundaries.ts). Read by early-warning's phrase lists, human-transfer detectCrisisSignals and the crisis gate's passive, implicit, plan and session-context patterns. Off: every check as before.
export const CRISIS_WORD_BOUNDARIES = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
