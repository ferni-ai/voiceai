import type { FlagSpec } from '../flag-spec.js';

// off | on: after the crisis line was given, a crisis turn keeps the 988 number with a note to say it briefly instead of re-reading the script (#1464); the agreement gate reads only the caller's words (main's risk words), two reads of one turn are not agreement, and it never eases on a call where anything read a turn imminent; a short answer to the 911 script is read by its question, and a safe one is a check-in only on a call with no imminent read and no caller risk. An imminent read always gets the 911 script; CRISIS_IMMINENT_NEEDS_AGREEMENT is its own flag. Never for a caller who may be under 18.
export const CRISIS_BRAKE_V2 = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
