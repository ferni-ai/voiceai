import type { FlagSpec } from '../flag-spec.js';

// on: early-warning phrases also match speech-to-text spellings and forms ("cant go on", "wanna die", "killing myself"); crisis router context boost matches whole words (utils/phrase-match.ts)
export const EARLY_WARNING_STT_FORMS = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;
