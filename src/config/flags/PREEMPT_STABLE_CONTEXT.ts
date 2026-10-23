import type { FlagSpec } from '../flag-spec.js';

// Keep LiveKit's preemptive reply: notes and tool changes for the next reply wait until it is
// decided; on: a memory note for this reply restarts it at once; defer: memory notes wait too
// (multi-agent/preempt-stable-context.ts). off: as before.
export const PREEMPT_STABLE_CONTEXT = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
