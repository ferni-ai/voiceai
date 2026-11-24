import type { FlagSpec } from '../flag-spec.js';

// on: the single-agent call wait ends the way a multi-agent call does: after 10 minutes with no
// sign of life (speech, a data message, a participant or track arriving), or at the 3-hour cap,
// instead of a fixed 10 minutes that ended calls mid-conversation (run-until-call-ends.ts, #4157).
// Turn it on before ROOM_ENDS_WITH_AGENT, which would otherwise hang up on a caller at 10:00.
export const SINGLE_AGENT_IDLE_WAIT = {
  default: 'off',
  owner: 'platform',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4157',
  context:
    'Keep if no single-agent call ends while someone is still talking and no idle room outlives its call; else delete.',
} as const satisfies FlagSpec;
