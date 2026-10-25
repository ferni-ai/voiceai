import type { FlagSpec } from '../flag-spec.js';

// on (with NAME_FALLING_INTONATION): the caller's name ends its own sentence where it would run on at the start of a reply: the TTS gateway says a reply-opening "Seth, ..." as "Seth. ..." (not for word-names like Will or Hope) and "Oh hey Seth," as "Hey Seth." (speech/tts-gateway/name-intonation.ts); the name gate ends a kept "Yes, Seth, I'm" whose comma went out first, and mid-call holds an opening hello so a dropped name takes it too ("Morning.", not "Hey, morning."; agents/personas/name-gate.ts). Replies without the caller's name are unchanged.
export const NAME_FALLING_SPLIT = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
