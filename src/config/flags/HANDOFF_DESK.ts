import type { FlagSpec } from '../flag-spec.js';

// on: at a handoff the leaving persona's desk (the caller's last asks, a read-back waiting on their
// yes, refused sends, follow-ups set this call) goes into the teammate's prompt in place of the
// pre_briefings read, the teammate's first line names that thread, and with nothing passed on a
// first line never claims a briefing (agents/multi-agent/handoff-desk.ts, plan S1). Off: as before.
export const HANDOFF_DESK = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
