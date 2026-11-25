import type { FlagSpec } from '../flag-spec.js';

// off | on (2026-11-24, #3046): the reminder delivery job skips, before claiming it, a due reminder whose owner the synthetic write guard refuses (a harness owner on prod's data, off the emulator, unless PROD_EVAL_WRITES lets its class through). Counted as skipped, with skipped in the PROMISE_JOB_RUN line, instead of a failed send and a failed promise; dev and the emulator still deliver (services/scheduling/reminder-delivery-job.ts, utils/synthetic-write-guard.ts ownerRefusedByGuard).
export const REMINDER_SKIP_SYNTHETIC_OWNER = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
  expires: '2027-02-22',
  issue: '#3046',
} as const satisfies FlagSpec;
