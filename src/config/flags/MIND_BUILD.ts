import type { FlagSpec } from '../flag-spec.js';

// On: the between-calls mind may build its canonical world model (entities, threads, brief) for a user.
// Nothing reads it yet: PR 1 adds only the types and the pure entity resolver (intelligence/mind/).
// Design: between-calls mind, 2026-10-25, section 1.
export const MIND_BUILD = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
} as const satisfies FlagSpec;
