import type { FlagSpec } from '../flag-spec.js';

// On: a phone number the LLM wrote as comma- or space-separated groups ("415, 555, 0147") or as +1 E.164 is rewritten to (415) 555-0147, which Sonic reads digit by digit. Read by speech/tts-gateway/director/spoken-phone-numbers.ts via normalize.ts. Off: those numbers pass through as written.
export const SPEAK_PHONE_DIGITS = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
