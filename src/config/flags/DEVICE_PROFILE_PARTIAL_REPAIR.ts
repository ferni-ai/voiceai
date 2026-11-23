import type { FlagSpec } from '../flag-spec.js';

export const DEVICE_PROFILE_PARTIAL_REPAIR = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
  expires: '2027-02-21',
  issue: '#4293',
} as const satisfies FlagSpec;
