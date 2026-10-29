import type { FlagSpec } from '../flag-spec.js';

// on: the early-warning detectors match whole words, so 'end it' no longer fires on "send it" (utils/phrase-match.ts)
export const EARLY_WARNING_WORD_BOUNDARY = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;
