import type { FlagSpec } from '../flag-spec.js';

// on: an on-behalf call that never reports is stored with status 'unconfirmed' ("I couldn't confirm how the call to X went") and told through tellOwnerOnce, by a durable watch the per-minute execute-scheduled-outreach job settles. A call whose LiveKit room is still open (or can't be read) is looked at again every 5 minutes, up to 4 hours after it was placed. Every reader says it couldn't confirm, never that it failed; a late real result replaces it; and callOnBehalf's promise says how the result will reach the owner (call-result-watchdog.ts, call-result-promise.ts). Set on the agent and the API server, with the call_result_watchdogs index and expireAt TTL deployed. Off: nothing is written or swept, and the promise and every reply are unchanged.
export const CALL_RESULT_WATCHDOG = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
  expires: '2027-02-16',
  issue: '#4094',
  context: 'Keep once dev shows no-report results told once and no double tell; else delete.',
} as const satisfies FlagSpec;
