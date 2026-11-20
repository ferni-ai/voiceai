import type { FlagSpec } from '../flag-spec.js';

// on: a wind-down line with no goodbye word ("thanks, man. I'll call him tonight", "night",
// "thanks. I needed that") gets the goodbye note too, so the reply lets them go with no new
// topic or question (#3197). Needs HAPPY_EXITS or SHORT_GOODBYE on; the call still ends only
// on a goodbye. Read in agents/shared/wind-down.ts.
export const SIGNOFF_READ_WIDE = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: '#3197',
} as const satisfies FlagSpec;
