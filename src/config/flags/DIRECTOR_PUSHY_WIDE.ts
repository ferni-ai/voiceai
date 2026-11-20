import type { FlagSpec } from '../flag-spec.js';

// on: parseNotes also drops a director note that tells Ferni not to let something slide or to point it out ("Don't let it slide."), so an odd word, usually a speech-to-text slip, is not picked at (#2438). Off: only the older pushy phrasings are dropped, as before.
export const DIRECTOR_PUSHY_WIDE = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: '#2438',
  context: 'Make permanent once dev calls show no supportive note was dropped by it; else delete.',
} as const satisfies FlagSpec;
