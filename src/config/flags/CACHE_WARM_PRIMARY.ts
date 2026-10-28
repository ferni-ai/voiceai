import type { FlagSpec } from '../flag-spec.js';

// on: the prompt-cache warm (cache-warm.ts) goes to the hedge primary model directly, so a backup that answers first cannot cancel the primary warm.
export const CACHE_WARM_PRIMARY = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
