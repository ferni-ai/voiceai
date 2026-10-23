import type { FlagSpec } from '../flag-spec.js';

// crisis classifier prompt v3: quiet preparation, fragments, look-alikes (crisis-classifier-v3.ts)
export const CRISIS_CLASSIFIER_PROMPT_VARIANT = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;
