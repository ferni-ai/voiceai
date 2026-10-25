import type { FlagSpec } from '../flag-spec.js';

// off|shadow|on: one per-call sound conductor (sound-conductor.ts) every clip asks before it plays: one sound per turn edge, no clip repeat within 60 s, per-kind budget a minute. shadow logs SOUND_DECISION and still plays every sound; on skips a blocked one. Read in clip-player.ts startBackchannelClips; off = the conductor is never built.
export const SOUND_CONDUCTOR = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
