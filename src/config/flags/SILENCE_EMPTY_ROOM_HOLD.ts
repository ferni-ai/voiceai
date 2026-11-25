import type { FlagSpec } from '../flag-spec.js';

// on: a room whose participant map is empty counts as empty, so no silence remark, presence check
// or idle check-in is spoken into it. Off reads an empty map as "has participants", as before
// (agents/voice-agent/silence-response-blockers.ts, #4152).
export const SILENCE_EMPTY_ROOM_HOLD = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4152',
  context:
    'Keep if no silence response is spoken into an empty room and no call with a caller loses one; else delete.',
} as const satisfies FlagSpec;
