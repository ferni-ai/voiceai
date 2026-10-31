import type { FlagSpec } from '../flag-spec.js';

// on: callStatus also finds a call by what it was about ("how's the dentist thing?"): when no call matches the person words, the query words (filler dropped, whole words only) are matched against each on_behalf_calls and deferred_calls request purpose and objective; calls to two or more people that match are named and the caller is asked which (services/outreach/call-purpose.ts, call-recall.ts). Off: person words only, as before.
export const CALL_STATUS_BY_PURPOSE = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
} as const satisfies FlagSpec;
