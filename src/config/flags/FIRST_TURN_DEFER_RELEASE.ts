import type { FlagSpec } from '../flag-spec.js';

// When FIRST_TURN_DEFER_BACKGROUND holds turn 1's context build, what releases it once Ferni replies.
// off (default) and settle: 600 ms into the reply (SPEAKING_SETTLE_MS). reply_end: when the reply ends or is interrupted,
// so the build's event-loop stalls land while Ferni listens (multi-agent/first-turn-defer.ts).
export const FIRST_TURN_DEFER_RELEASE = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
