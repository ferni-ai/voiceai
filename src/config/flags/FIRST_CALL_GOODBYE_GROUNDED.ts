import type { FlagSpec } from '../flag-spec.js';

export const FIRST_CALL_GOODBYE_GROUNDED = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-21',
  issue: '#4287',
} as const satisfies FlagSpec;
