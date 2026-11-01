import type { FlagSpec } from '../flag-spec.js';

// on: Ferni keeps facts about people as bi-temporal records (bogle_users/{uid}/facts): the memory writer adds, supersedes, confirms and forgets them, facts-store.ts reads them; off = nothing is written or read.
export const MEMORY_FACTS = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
} as const satisfies FlagSpec;
