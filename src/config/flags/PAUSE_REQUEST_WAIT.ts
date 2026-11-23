import type { FlagSpec } from '../flag-spec.js';

export const PAUSE_REQUEST_WAIT = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: '#3983',
} as const satisfies FlagSpec;
