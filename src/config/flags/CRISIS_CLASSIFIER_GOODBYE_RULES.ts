import type { FlagSpec } from '../flag-spec.js';

export const CRISIS_CLASSIFIER_GOODBYE_RULES = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;
