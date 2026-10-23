import type { FlagSpec } from '../flag-spec.js';

// off: POST /api/call-telemetry answers 404 and stores nothing.
// reports: "That felt off" reports only (a per-call summary gets 404).
// on: felt-off reports plus per-call summaries.
// Read in src/api/call-telemetry/call-telemetry-store.ts.
export const CALL_TELEMETRY = {
  default: 'off',
  owner: 'platform',
  kind: 'experiment',
} as const satisfies FlagSpec;
