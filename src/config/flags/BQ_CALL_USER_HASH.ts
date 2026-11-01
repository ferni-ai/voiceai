import type { FlagSpec } from '../flag-spec.js';

// on (with BQ_EVENTS): a call started before the caller was identified takes the caller's id
// from a later event, so its call_events row carries user_hash (analytics/call-quality-monitor.ts).
// Turn on only after BQ_ERASURE and the bq-erasure scheduler job are live on the web service.
export const BQ_CALL_USER_HASH = {
  default: 'off',
  owner: 'platform',
  kind: 'experiment',
} as const satisfies FlagSpec;
