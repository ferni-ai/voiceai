import type { FlagSpec } from '../flag-spec.js';

// On: a lone hold on, hang on or wait (and please wait, no wait, can you wait) commits the caller turn at once (#3047). Off: they are held like any unpunctuated turn, since a caller who says hold on usually keeps talking (#2657). Read in unfinished-turn.ts.
export const PAUSE_REQUEST_COMMITS_TURN = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
