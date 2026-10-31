import type { FlagSpec } from '../flag-spec.js';

// on: what a caller asks Ferni to remember (rememberAboutUser) is also written to dynamic_facts as a caller_asserted fact, embedded on write, so recall finds it by meaning. Read in memory/dynamic/remembered-facts.ts; off = only the memories write, as before.
export const REMEMBER_TO_RECALL = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
} as const satisfies FlagSpec;
