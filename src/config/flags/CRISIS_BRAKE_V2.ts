import type { FlagSpec } from '../flag-spec.js';

// off | on: crisis mode can ease (services/safety/crisis-brake.ts). The agreement gate reads only the caller's words, with everyday words ("bye", "done", "tonight") risk only inside a risk phrase, and two reads of one turn are not agreement; a split imminent read needs agreement (implies CRISIS_IMMINENT_NEEDS_AGREEMENT); a short answer to the 911 script's "have you taken something" is an answer (no: a check-in, yes or a means word: the script); the crisis line is given in full once per call unless asked for or new risk is said (#1464). Never for a caller who may be under 18.
export const CRISIS_BRAKE_V2 = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
