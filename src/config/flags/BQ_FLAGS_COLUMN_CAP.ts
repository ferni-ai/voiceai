import type { FlagSpec } from '../flag-spec.js';

// on: call_events.flags is the first 200 sorted experiment-flag names instead of the row being refused when more than 200 are on (analytics/bq-call-events.ts).
export const BQ_FLAGS_COLUMN_CAP = {
  default: 'off',
  owner: 'platform',
  kind: 'experiment',
  expires: '2027-02-23',
  issue: '#4402',
} as const satisfies FlagSpec;
