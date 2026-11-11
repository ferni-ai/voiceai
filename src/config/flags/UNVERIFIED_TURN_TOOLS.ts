import type { FlagSpec } from '../flag-spec.js';

export const UNVERIFIED_TURN_TOOLS = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
