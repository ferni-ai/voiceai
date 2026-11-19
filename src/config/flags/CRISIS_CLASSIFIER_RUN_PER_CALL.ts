import type { FlagSpec } from '../flag-spec.js';

// on: the crisis classifier's and adjudicator's shared runs and turn reads are kept per call (#4005). A run is shared only within one call (never with no call id), a failed read is never reused, a run is joined only while it has half its deadline left, twin scopes never push out a call's entries, and a call whose turn reads were pushed out gets a missing read (escalates). Off: main's caches.
export const CRISIS_CLASSIFIER_RUN_PER_CALL = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: '#4005',
  context:
    'Make permanent once CRISIS_CLASSIFIER_JOINED ages on dev stay under half the deadline and no call logs a pushed-out read; else delete.',
} as const satisfies FlagSpec;
