import type { FlagSpec } from '../flag-spec.js';

// on: a reply stream that fails after some words reached the caller ends with one short spoken repair line instead of a cut-off sentence and silence; never on a call with crisis risk, before any words, or on an abort (#4011). Off: the error ends the turn there, as before.
export const STREAM_ERROR_REPAIR = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: '#4011',
  context:
    'Make permanent once dev calls show the repair line only after real mid-reply stream failures; else delete.',
} as const satisfies FlagSpec;
