import type { FlagSpec } from '../flag-spec.js';

// on (with BQ_EVENTS): one ferni_events.turn_metrics row per TURN_RECEIPT (agents/shared/turn-receipt-bq.ts)
export const TURN_METRICS_BQ = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
