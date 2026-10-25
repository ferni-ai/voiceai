import type { FlagSpec } from '../flag-spec.js';

export const CUSTOM_AGENT_LIVE = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
