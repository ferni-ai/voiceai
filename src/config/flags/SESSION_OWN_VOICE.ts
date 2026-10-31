import type { FlagSpec } from '../flag-spec.js';

export const SESSION_OWN_VOICE = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
