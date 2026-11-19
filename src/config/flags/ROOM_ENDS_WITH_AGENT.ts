import type { FlagSpec } from '../flag-spec.js';

// on: when the agent's job ends with a caller still in the room, the room is deleted, so
// nobody holds it open after the agent left; kept when LiveKit ended the job or another agent
// is in the room (agents/gce/room-ends-with-agent.ts, #1403).
export const ROOM_ENDS_WITH_AGENT = {
  default: 'off',
  owner: 'platform',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: 'https://github.com/ferni-ai/voiceai/issues/1403',
  context:
    'Keep if no call is cut off by it and no room outlives its agent with it on; else delete.',
} as const satisfies FlagSpec;
