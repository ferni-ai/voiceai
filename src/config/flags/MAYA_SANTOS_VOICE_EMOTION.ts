import type { FlagSpec } from '../flag-spec.js';

// Unset: Maya's tone is the Director's (her upbeat manifest names all reach Cartesia as
// `content`). A Sonic 3 emotion (e.g. happy): her resting tone, replacing only the
// Director's resting picks; sympathetic, calm, contemplative and curious replies keep
// theirs (director/ferni-resting-voice.ts).
export const MAYA_SANTOS_VOICE_EMOTION = {
  default: 'off',
  owner: 'voice',
  kind: 'config',
} as const satisfies FlagSpec;
