import type { FlagSpec } from '../flag-spec.js';

// on: parseNotes drops a reply line that ends in ":" ("Here are the notes for Ferni:"), so a heading never takes one of the two note slots from a real note (#2658). Off: the heading is kept as a note, as before.
export const DIRECTOR_DROPS_HEADINGS = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: '#2658',
  context:
    'Make permanent once dev calls show no real note ending in a colon was lost; else delete.',
} as const satisfies FlagSpec;
