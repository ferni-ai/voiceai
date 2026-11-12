import type { FlagSpec } from '../flag-spec.js';

// on: a first call's hello (and an unplaced caller's) is told to ask how it's going, not what's on their mind or how they're holding up (first-call-stranger.ts easyStrangerDirection). Off: the stranger direction is the same string as before.
export const STRANGER_GREETING_EASY = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-10',
  issue: 'https://github.com/ferni-ai/voiceai/issues/3668',
  context:
    'Keep if first-call hellos on dev stop opening with on-your-mind or holding-up check-ins; else delete.',
} as const satisfies FlagSpec;
