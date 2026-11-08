import type { FlagSpec } from '../flag-spec.js';

// on: each Cartesia STT stream logs STT_AUDIO every 30 s (frames, all-zero share, peak and
// RMS dBFS, transcript counts) and warns STT_HEARD_NO_WORDS and STT_INPUT_DISCARD
// (agents/model-provider/stt-audio-diagnostics.ts). Remove once silent-STT calls are explained.
export const STT_AUDIO_DIAGNOSTICS = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
