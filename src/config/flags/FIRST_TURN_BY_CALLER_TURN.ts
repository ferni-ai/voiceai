import type { FlagSpec } from '../flag-spec.js';

// on (#3114): the first-turn context (team huddle, outreach bridge, cross-channel; context-injections.ts 2d-2f) is built on the call's first caller turn (userData.callerTurn, agents/shared/caller-turn-count.ts), never on a later one, and not on a turn with safety guidance. Off, as before: turnCount 0, which the live voice path never reaches because the hook builds after turnCount steps. While You Were Away (2g) is CALL_REPORT_REACHES_YOU's (first-turn-context.ts).
export const FIRST_TURN_BY_CALLER_TURN = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;
