import type { FlagSpec } from '../flag-spec.js';

export const BACKCHANNEL_RESUME_ON_FINAL = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-25',
  issue: '#4548',
} as const satisfies FlagSpec;
