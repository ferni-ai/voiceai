import type { FlagSpec } from '../flag-spec.js';

// With WORKER_RECYCLE on, also recycle the worker after this many calls; 0 never (worker-recycle.ts).
export const WORKER_RECYCLE_MAX_CALLS = {
  default: '0',
  owner: 'platform',
  kind: 'config',
} as const satisfies FlagSpec;
