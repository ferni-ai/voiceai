import type { FlagSpec } from '../flag-spec.js';

// on: Ferni keeps one activity ledger per person (bogle_users/{uid}/activity): recordActivity writes, listActivity/getActivity read (services/stores/activity-store.ts); off = nothing is written or read.
export const ACTIVITY_LEDGER = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
} as const satisfies FlagSpec;
