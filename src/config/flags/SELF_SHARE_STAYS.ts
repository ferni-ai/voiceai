import type { FlagSpec } from '../flag-spec.js';

export const SELF_SHARE_STAYS = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-21',
  issue: '#3475',
} as const satisfies FlagSpec;
