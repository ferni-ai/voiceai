import type { FlagSpec } from '../flag-spec.js';

// on: a reply drawn as a "restart" (TURN_TEXTURE=learned) gets one of several restart examples
// and is told never to restart on "I", instead of always seeing "I, I think", which the model
// copied on about one reply in ten (agents/personas/turn-length.ts, #3071).
export const RESTART_VARIED = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: 'https://github.com/ferni-ai/voiceai/issues/3071',
  context:
    'Keep if replies stop opening with a doubled "I" and restarts still sound natural; else delete.',
} as const satisfies FlagSpec;
