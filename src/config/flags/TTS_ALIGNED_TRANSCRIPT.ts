import type { FlagSpec } from '../flag-spec.js';

// on: PersonaAwareTTS declares alignedTranscript when its inner Cartesia TTS returns word timestamps and the TTS gateway is off (USE_TTS_GATEWAY=false), so captions follow the Cartesia word timings instead of the 3.83 syllables/s estimate. Read in speech/tts/aligned-transcript.ts; ferni-agent.ts ttsNode keeps the reply text when no frame carries timings (agents/shared/aligned-caption-backfill.ts). off = SDK estimate, unchanged.
export const TTS_ALIGNED_TRANSCRIPT = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
