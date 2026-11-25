import type { FlagSpec } from '../flag-spec.js';

// on: the after-call follow-up import (FOLLOW_THROUGH_IMPORT) brings the caller's open tasks
// (productivityData.tasks, pending or in progress) into the follow-up record, one follow-up each, so
// the 48 h ask spacing and closes reach tasks too (plan docs/plans/2026-11-16-one-open-loop-record.md,
// Task 1). Off: no task is imported, as on main.
export const FOLLOW_THROUGH_TASKS = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
  expires: '2027-02-23',
  issue: '#4390',
} as const satisfies FlagSpec;
