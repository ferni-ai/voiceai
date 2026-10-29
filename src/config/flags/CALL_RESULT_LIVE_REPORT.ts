import type { FlagSpec } from '../flag-spec.js';

// On: when an on-behalf call ends while the requesting call is still live in this worker, Ferni tells the owner at a pause (services/outreach/call-result-live.ts, read in call-result-capture.ts). Off: the old room lookup by session id.
export const CALL_RESULT_LIVE_REPORT = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
} as const satisfies FlagSpec;
