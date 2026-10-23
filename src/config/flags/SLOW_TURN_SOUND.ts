import type { FlagSpec } from '../flag-spec.js';

// on: a slow turn with no reply words at TTS 900 ms after the commit gets one cached Mm (integrations/slow-turn-sound.ts), and calls, contact tools and marketData get a lead-in or an On it. before the tool (personas/tool-lead-in.ts)
export const SLOW_TURN_SOUND = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
