import type { FlagSpec } from '../flag-spec.js';

// on: the director's and deliberator's guard rule adds that the caller's words come through speech-to-text, which mishears, so one word that doesn't fit is a mishearing: no note about it, and no note telling the persona to point it out, question it or repeat it (agents/personas/director-stt-slips.ts, #2438). off = the rule is not there.
export const DIRECTOR_STT_SLIPS = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-24',
  issue: '#2438',
} as const satisfies FlagSpec;
