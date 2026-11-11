import type { FlagSpec } from '../flag-spec.js';

// on: a worker whose RSS has passed WORKER_RECYCLE_RSS_MB reports itself full, lets its calls
// end, and exits so LiveKit Cloud starts a fresh one (agents/gce/worker-recycle.ts).
export const WORKER_RECYCLE = {
  default: 'off',
  owner: 'platform',
  kind: 'experiment',
} as const satisfies FlagSpec;
