import type { FlagSpec } from '../flag-spec.js';

// On: the TTS parser's comma and period cleanup looks past held native breaks and spaced comma
// runs, so a scripted line like the late-night greeting no longer plays "What's on your mind?,"
// (#3165). Off: the old cleanup. Read in speech/tts-gateway/ssml/stuck-punctuation.ts.
export const HELD_BREAK_PUNCTUATION = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
