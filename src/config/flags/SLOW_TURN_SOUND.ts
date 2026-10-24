import type { FlagSpec } from '../flag-spec.js';

// on: a slow turn with no reply words at TTS 900 ms after the commit gets one cached Mm, sharing one sound a turn with the early opening sound (integrations/slow-turn-sound.ts)
export const SLOW_TURN_SOUND = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
