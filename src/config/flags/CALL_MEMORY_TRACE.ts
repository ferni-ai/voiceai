import type { FlagSpec } from '../flag-spec.js';

// on: each call's process logs CALL_MEMORY every minute and HEAP_SAMPLE (live allocations by
// owner) every five minutes and after cleanup (agents/shared/call-memory-trace.ts).
export const CALL_MEMORY_TRACE = {
  default: 'off',
  owner: 'platform',
  kind: 'config',
} as const satisfies FlagSpec;
