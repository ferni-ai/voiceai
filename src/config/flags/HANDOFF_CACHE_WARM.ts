import type { FlagSpec } from '../flag-spec.js';

// on: a handoff arms the prompt-cache warm (cache-warm.ts) for the incoming persona, with its own instructions and tools; read in handoff-cache-warm.ts, called from orchestrator.ts.
export const HANDOFF_CACHE_WARM = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
