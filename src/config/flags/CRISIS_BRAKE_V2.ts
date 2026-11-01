import type { FlagSpec } from '../flag-spec.js';

// off | on: crisis mode can ease (services/safety/crisis-brake.ts). The agreement gate reads only the caller's words, with everyday words ("bye", "done", "tonight") risk only inside a risk phrase, and two reads of one turn are not agreement; a split imminent read needs agreement (implies CRISIS_IMMINENT_NEEDS_AGREEMENT); a short answer to the 911 script is an answer, read by its question (a yes, a means word or a hedge: the script; a no to "is anyone nearby" or any risk word: as with the flag off; a safe answer is a check-in only on a call with no imminent read and no caller risk); after the crisis line, a crisis turn keeps the 988 number with a note to say it briefly (#1464), and an imminent read always gets the 911 script. Never for a caller who may be under 18.
export const CRISIS_BRAKE_V2 = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
