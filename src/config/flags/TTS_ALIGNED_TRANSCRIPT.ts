import type { FlagSpec } from '../flag-spec.js';

// on: PersonaAwareTTS declares alignedTranscript when the Cartesia voice speaking the replies returns word timestamps (its inner Cartesia TTS with the TTS gateway off; with it on, the gateway Cartesia reply stream asks for add_timestamps and puts the words on its frames, speech/tts-gateway/word-timings.ts), so captions follow the Cartesia word timings instead of the 3.83 syllables/s estimate. Read in speech/tts/aligned-transcript.ts; ferni-agent.ts ttsNode keeps the reply text when no frame carries timings (agents/shared/aligned-caption-backfill.ts). off = SDK estimate, unchanged.
export const TTS_ALIGNED_TRANSCRIPT = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
