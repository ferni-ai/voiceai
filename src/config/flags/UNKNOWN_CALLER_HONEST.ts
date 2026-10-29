import type { FlagSpec } from '../flag-spec.js';

// on: a caller with no account and no past calls gets a first meeting's hello, never a friend's, and the model is told nothing from the call is kept, so it never promises to remember them (agents/multi-agent/unknown-caller-honest.ts, greeting-direction.ts, agent-setup.ts). #3007 #3002
export const UNKNOWN_CALLER_HONEST = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
