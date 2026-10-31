import type { FlagSpec } from '../flag-spec.js';

// on (with BQ_EVENTS): one ferni_events.followthrough_outcomes row per settled follow-up answer
// (analytics/bq-followthrough.ts, from the commitment context builder). The row carries
// user_hash: turn on only after BQ_ERASURE and the bq-erasure scheduler job are live.
export const FOLLOWTHROUGH_BQ = {
  default: 'off',
  owner: 'platform',
  kind: 'experiment',
} as const satisfies FlagSpec;
