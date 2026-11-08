import type { FlagSpec } from '../flag-spec.js';

// The RSS, in MB, past which WORKER_RECYCLE drains and restarts the worker (worker-recycle.ts).
export const WORKER_RECYCLE_RSS_MB = {
  default: '1024',
  owner: 'platform',
  kind: 'config',
} as const satisfies FlagSpec;
