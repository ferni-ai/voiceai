import type { FlagSpec } from '../flag-spec.js';

// On: when an on-behalf call ends while the requesting call is still live, Ferni tells the owner at a pause, once (claimed on the call record's own liveReport.claimedAt; never told.*), never on a call with crisis risk (held for the next opener), and once heard it is marked delivered by voice so the next opener doesn't repeat it: in-process from call-result-capture.ts, or from the owner's own worker, which watches the call it placed (services/outreach/call-result-live.ts, call-result-watch.ts, live-report-record.ts). Off: the old room lookup by session id, and no watch.
export const CALL_RESULT_LIVE_REPORT = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
} as const satisfies FlagSpec;
