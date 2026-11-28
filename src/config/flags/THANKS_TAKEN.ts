import type { FlagSpec } from '../flag-spec.js';

// on: a caller's mid-call thank-you or kind word about Ferni adds a one-turn note to take it in his own words before going on (thanks-taken.ts, turn-extras.ts, #3877). Off: no note, as before.
export const THANKS_TAKEN = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-17',
  issue: 'https://github.com/ferni-ai/voiceai/issues/3877',
  context:
    'Keep if a mid-call thank-you is taken in a few words of his own and the story goes on; else delete.',
} as const satisfies FlagSpec;
