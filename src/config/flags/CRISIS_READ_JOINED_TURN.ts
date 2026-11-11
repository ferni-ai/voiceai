import type { FlagSpec } from '../flag-spec.js';

// off | on (review by 2027-02-01): with UNFINISHED_TURN_HOLD installed, the reply gate's classifier read of a caller line the hold is still holding (no end punctuation, or a dangling last word) waits until the line settles: read as it is when it is committed unchanged or nothing settles in time, never read when the caller goes on (the joined turn's own request reads the whole sentence). Patterns, imminent detection and any call with risk noted read at once, as off (agents/personas/crisis-read-joined-turn.ts).
export const CRISIS_READ_JOINED_TURN = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-01',
  issue: 'TBD',
  context:
    'Safety: expiry only warns, never turns it off. Decide permanent (kill-switch, on) or replace; never just delete.',
} as const satisfies FlagSpec;
