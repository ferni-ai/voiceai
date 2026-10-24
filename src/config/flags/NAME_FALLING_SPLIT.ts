import type { FlagSpec } from '../flag-spec.js';

// on: the caller's name ends its own sentence where it would run on: the name gate finds ", Seth, and ..." and keeps it as "Seth. And ..." (with NAME_FALLING_INTONATION) or drops it with the hello or comma before it (agents/personas/name-vocatives.ts, name-gate.ts); with NAME_FALLING_INTONATION, the TTS gateway also says a reply-opening "Seth, ..." as "Seth. ..." and drops the "Oh" in "Oh hey Seth," (speech/tts-gateway/name-intonation.ts).
export const NAME_FALLING_SPLIT = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
