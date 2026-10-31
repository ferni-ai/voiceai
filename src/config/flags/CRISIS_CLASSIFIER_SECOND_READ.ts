import type { FlagSpec } from '../flag-spec.js';

// crisis classifier second read with prompt v3, escalate only: off | shadow | on (crisis-classifier-v3.ts)
export const CRISIS_CLASSIFIER_SECOND_READ = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;
