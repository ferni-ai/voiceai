import type { FlagSpec } from '../flag-spec.js';

export const MAYA_HABIT_TRIGGERS = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-22',
  issue: '#1431',
} as const satisfies FlagSpec;
