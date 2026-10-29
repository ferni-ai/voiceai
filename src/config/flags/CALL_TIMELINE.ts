import type { FlagSpec } from '../flag-spec.js';

// on: one ordered timeline per call (caller finals, replies heard vs generated, backchannel/opener/laugh/presence clips and their cuts, soft pauses, holds, overlaps, barge-ins, tools, handoffs) written to bogle_users/{uid}/conversations/{conv}/timeline at call end and every 60 s (agents/shared/call-timeline.ts). Only for callers in CALL_TIMELINE_UIDS (comma-separated uids; unset or empty records nobody). Skipped when memory is held and for non-members. Off: no recorder, no writes.
export const CALL_TIMELINE = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
} as const satisfies FlagSpec;
// throwaway: exercises the 4-shard affected run (draft, will be closed)
