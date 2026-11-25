import type { FlagSpec } from '../flag-spec.js';

// on: closes travel both ways between an item and its follow-up (plan
// docs/plans/2026-11-16-one-open-loop-record.md, Task 2). The caller's answer that closes a raised
// follow-up in a call also closes its task, reminder or commitment (agents/follow-through-source-close.ts),
// and completing a task with the task tool closes its follow-up. Off: neither, as on main.
export const FOLLOW_THROUGH_SOURCE_CLOSE = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
  expires: '2027-02-23',
  issue: '#4390',
} as const satisfies FlagSpec;
