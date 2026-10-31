import type { FlagSpec } from '../flag-spec.js';

// on: a rejected final transcript (one-word backchannel, echo) no longer cancels a reply Ferni began before the caller spoke (rejected-transcript-policy.ts)
export const REJECTED_TRANSCRIPT_KEEPS_SPEECH = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
