import type { FlagSpec } from '../flag-spec.js';

// on: a crisis alarm from the classifier alone (no pattern, imminent) speaks one warm check that still names 988 instead of the full script; only a clear "I'm okay" with no pattern and no imminent re-read clears it, anything else gets the script (services/safety/crisis-classifier-check.ts). Cohort-capable.
export const CRISIS_CLASSIFIER_CHECK = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;
