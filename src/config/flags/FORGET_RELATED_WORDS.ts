import type { FlagSpec } from '../flag-spec.js';

export const FORGET_RELATED_WORDS = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
  expires: '2027-02-17',
  issue: '#3682',
} as const satisfies FlagSpec;
