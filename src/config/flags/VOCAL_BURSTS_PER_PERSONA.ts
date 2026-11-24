import type { FlagSpec } from '../flag-spec.js';

export const VOCAL_BURSTS_PER_PERSONA = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-22',
  issue: '#4218',
} as const satisfies FlagSpec;
