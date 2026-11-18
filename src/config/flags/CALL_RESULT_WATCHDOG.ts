import type { FlagSpec } from '../flag-spec.js';

// on: an on-behalf call that never reports a result within 25 minutes is stored as "I couldn't confirm how the call to X went" (noReport) and told through tellOwnerOnce, by a durable watch the per-minute execute-scheduled-outreach job settles; a late real result replaces it; and callOnBehalf's promise says how the result will reach the owner (call-result-watchdog.ts, call-result-promise.ts). Set on the agent and the API server. Off: nothing is written or swept and the promise is unchanged.
export const CALL_RESULT_WATCHDOG = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
  expires: '2027-02-16',
  issue: '#4094',
  context: 'Keep once dev shows no-report results told once and no double tell; else delete.',
} as const satisfies FlagSpec;
