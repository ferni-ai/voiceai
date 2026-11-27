import type { FlagSpec } from '../flag-spec.js';

export const BIDS_TURN_TOWARD = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-24',
  issue: '#4509',
} as const satisfies FlagSpec;
