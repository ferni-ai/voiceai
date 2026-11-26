import type { FlagSpec } from '../flag-spec.js';

// on: the director's and deliberator's guard rule adds that the caller's words come through speech-to-text, which sometimes swaps one pronoun or name: the director reads past it to what was meant and never tells the persona to point it out, question it or repeat it, while everything else, above all a hint of harm, gets notes as usual (agents/personas/director-stt-slips.ts, #2438). off = the rule is not there.
export const DIRECTOR_STT_SLIPS = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-24',
  issue: '#2438',
} as const satisfies FlagSpec;
