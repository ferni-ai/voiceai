import type { FlagSpec } from '../flag-spec.js';

// off: POST /api/call-telemetry answers 404 and stores nothing. reports: "That felt off"
// reports only. on: felt-off plus per-call summaries. Read in api/call-telemetry/.
export const CALL_TELEMETRY = {
  default: 'off',
  owner: 'platform',
  kind: 'experiment',
} as const satisfies FlagSpec;
