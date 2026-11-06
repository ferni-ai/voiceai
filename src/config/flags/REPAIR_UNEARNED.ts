import type { FlagSpec } from '../flag-spec.js';

// on: when the caller sets the record straight with a 'no, X, not Y' or 'no, not Y. X' whose Y is nothing Ferni said, the turn gets one note to take their version without apologising or saying he misunderstood (correction-repair.ts). Never on a line about how someone is ('I'm not okay') or a turn in distress. Off: no note, as before.
export const REPAIR_UNEARNED = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-03',
  issue: '#3490',
  context: 'dev eval of rt repair scenarios: blame-taking rate on unearned corrections',
} as const satisfies FlagSpec;
