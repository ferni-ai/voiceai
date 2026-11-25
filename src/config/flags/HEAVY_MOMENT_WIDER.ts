import type { FlagSpec } from '../flag-spec.js';

// on: the heavy-moment check (speech/adaptive-ssml/heavy-moment.ts) also reads loss said without a death word: "buried my uncle", "she passed in 2019", "my aunt has been gone since 2011", a cemetery or a eulogy. Wider heavy only holds laughs, play and bright sounds back; it never adds one. Off: as before.
export const HEAVY_MOMENT_WIDER = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: '#3845',
} as const satisfies FlagSpec;
