import type { FlagSpec } from '../flag-spec.js';

// on: "and you" with a word straight after ("And you know what the thing is?") is the caller's own setup, not a question about Ferni, and a short setup line holds his own story (caller-move.ts). off = every "and you" asks about him.
export const CALLER_SETUP_READ = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-23',
  issue: '#3810',
} as const satisfies FlagSpec;
