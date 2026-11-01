import type { FlagSpec } from '../flag-spec.js';

// on: a caller who is not a verified account owner, or who sounds under 18, gets a brief boundary on sexual topics; a turn read as sexual holds the memory of the call (sexual-boundary.ts)
export const SEXUAL_TOPIC_BOUNDARY = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
