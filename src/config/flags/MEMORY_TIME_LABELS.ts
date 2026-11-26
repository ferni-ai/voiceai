import type { FlagSpec } from '../flag-spec.js';

export const MEMORY_TIME_LABELS = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
  expires: '2027-02-21',
  issue: '#2530',
} as const satisfies FlagSpec;
