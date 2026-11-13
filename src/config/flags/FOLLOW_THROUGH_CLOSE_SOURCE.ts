import type { FlagSpec } from '../flag-spec.js';

// on: when the owner tells the call opener a todo is done or not happening, Ferni's acknowledgement asks once whether to take it off their list too, and only the owner's clear yes to that question closes it where it lives (the task, reminder or commitment) through each store's compare-and-set writer (follow-through/close-confirm.ts, close-to-source.ts, stores/source-closers.ts). Never a safety item, never on a crisis call. Off: no question, and nothing writes to those stores.
export const FOLLOW_THROUGH_CLOSE_SOURCE = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
  expires: '2027-02-10',
  issue: 'https://github.com/ferni-ai/voiceai/issues/3793',
  context: 'Turn on in dev, read FOLLOW_THROUGH_SOURCE_CONFIRM counts for a week, then prod.',
} as const satisfies FlagSpec;
