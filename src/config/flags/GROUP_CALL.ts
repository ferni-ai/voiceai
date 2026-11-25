import type { FlagSpec } from '../flag-spec.js';

export const GROUP_CALL = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-14',
  issue: '#3979',
} as const satisfies FlagSpec;
