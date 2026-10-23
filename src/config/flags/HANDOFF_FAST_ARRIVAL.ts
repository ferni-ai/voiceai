import type { FlagSpec } from '../flag-spec.js';

// on: at a single-session handoff the teammate is set up while the goodbye plays, and the
// speech coordinator's echo cooldown (750 ms to 2 s) after any speech end during the handoff
// drops to 150 ms (agents/multi-agent/handoff-fast-arrival.ts).
// The 150 ms window is process-wide (speech/coordination/arrival-cooldown.ts), like the speech
// coordinator itself: unsafe with AGENT_MAX_JOBS_PER_WORKER > 1, where one call's handoff would
// shorten another call's cooldown.
export const HANDOFF_FAST_ARRIVAL = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
