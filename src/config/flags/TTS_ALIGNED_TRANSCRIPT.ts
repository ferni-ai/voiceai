import type { FlagSpec } from '../flag-spec.js';

// on: PersonaAwareTTS declares alignedTranscript when the Cartesia voice speaking the replies returns word timestamps (its inner Cartesia TTS with the TTS gateway off; with it on, the gateway Cartesia reply stream asks for add_timestamps and puts the words on its frames, speech/tts-gateway/word-timings.ts), so captions follow the Cartesia word timings instead of the 3.83 syllables/s estimate. Read in speech/tts/aligned-transcript.ts; ferni-agent.ts ttsNode captions the reply text itself, placed by whatever timings arrive, so a sentence with no timings is still captioned and saved to history (agents/shared/aligned-caption-backfill.ts). off = SDK estimate, unchanged.
// DO NOT ENABLE until the #3200 fix is verified: an independent verify, then a dev check against the real Cartesia API (timestamps arrive within 1 s of their audio; caption and saved reply equal the reply text). Known after the fix: with no timings, nothing is captioned for the first second of audio, so an interrupt in that second saves less than was said (never more).
export const TTS_ALIGNED_TRANSCRIPT = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
