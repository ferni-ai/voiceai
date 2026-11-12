import type { FlagSpec } from '../flag-spec.js';

// on: a todo the owner says in a call is done or not happening closes where it lives (the task, reminder or commitment) and its follow-up with it, through each store's compare-and-set writer (follow-through/close-to-source.ts, stores/source-closers.ts, agents/follow-through-close.ts); the call opener's reply close does the same. Off: nothing writes to those stores.
export const FOLLOW_THROUGH_CLOSE_SOURCE = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
  expires: '2027-02-10',
  issue: 'TBD',
  context: 'Turn on in dev, read FOLLOW_THROUGH_CLOSE counts for a week, then prod.',
} as const satisfies FlagSpec;
