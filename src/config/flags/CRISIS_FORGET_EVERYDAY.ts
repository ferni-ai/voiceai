import type { FlagSpec } from '../flag-spec.js';

export const CRISIS_FORGET_EVERYDAY = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: '#4159',
} as const satisfies FlagSpec;
