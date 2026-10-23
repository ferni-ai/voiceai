import type { FlagSpec } from '../flag-spec.js';

// On: spoken text: ellipses become a short break, em dashes a comma.
// Read by speech/output-control/spoken-punctuation.ts, piped into the TTS text
// stream by agents/shared/tts-wrapper.ts.
// Off: TTS text passes through byte-identical.
export const SPOKEN_PUNCTUATION_NORMALIZE = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
