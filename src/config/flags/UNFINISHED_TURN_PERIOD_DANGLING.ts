import type { FlagSpec } from '../flag-spec.js';

// off | on (#4242): a turn the speech-to-text punctuated with a period right after and, but, or, um, uh, er or erm ('...and.') is held as dangling instead of answered at once. Off answers it as finished (agents/multi-agent/unfinished-turn.ts).
export const UNFINISHED_TURN_PERIOD_DANGLING = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: '#4242',
  context:
    'dev on: TURN_RECEIPT hold counts on period-ended connective turns, and how often the caller goes on within the hold',
} as const satisfies FlagSpec;
