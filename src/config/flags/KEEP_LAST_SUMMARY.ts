import type { FlagSpec } from '../flag-spec.js';

// on: a call whose summary has no key points leaves the profile's last summaries alone (services/session/last-summary.ts, #2744). Off: they are overwritten with '' and the save safeguard stores "Had a N-minute conversation", as before.
export const KEEP_LAST_SUMMARY = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
} as const satisfies FlagSpec;
