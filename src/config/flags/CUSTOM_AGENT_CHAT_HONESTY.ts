import type { FlagSpec } from '../flag-spec.js';

export const CUSTOM_AGENT_CHAT_HONESTY = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
