import type { FlagSpec } from '../flag-spec.js';

// on: every process that runs calls flushes BTH capability events to Firestore every 30 s
// and drains them at shutdown (better-than-human-validation/telemetry-lifecycle.ts). Off,
// they land only in batches of 50 and the rest is lost when the process exits.

export const BTH_TELEMETRY_FLUSH = {
  default: 'off',
  owner: 'platform',
  kind: 'experiment',
  expires: '2027-02-17',
  issue: '#4069',
} as const satisfies FlagSpec;
