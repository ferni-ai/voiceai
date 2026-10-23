import type { FlagSpec } from '../flag-spec.js';

// Unset: Maya rests at her manifest's pace (TEAM_VOICES). A number, clamped to 0.85-1.2:
// her resting pace, her pace band moved with it; the Director still slows heavy replies
// from there (director/ferni-resting-voice.ts).
export const MAYA_SANTOS_VOICE_SPEED = {
  default: 'off',
  owner: 'voice',
  kind: 'config',
} as const satisfies FlagSpec;
