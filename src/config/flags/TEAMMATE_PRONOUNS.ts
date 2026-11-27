import type { FlagSpec } from '../flag-spec.js';

export const TEAMMATE_PRONOUNS = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: '#1486',
} as const satisfies FlagSpec;
