import type { FlagSpec } from '../flag-spec.js';

// on: a variant set to 0% traffic stays at 0% when an experiment is created (experiment-manager.ts initializeABTest), so smart-context-routing-v1 runs 100/0/0 as written. off = a 0 is read as unset and becomes an equal share, which is how prod ran it as a three-way split (#4397).
export const EXPERIMENT_KEEP_ZERO_TRAFFIC = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-23',
  issue: '#4397',
} as const satisfies FlagSpec;
