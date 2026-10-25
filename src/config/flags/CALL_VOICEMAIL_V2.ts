import type { FlagSpec } from '../flag-spec.js';

// on: an on-behalf call opened with CALL_OPENING_AMD waits ~6 s (not 2.5 s) for first words after pickup, and after the opener to a silent pickup keeps listening; a voicemail greeting that starts then stops Ferni, waits it out and leaves one short message before hanging up (agents/outbound-call/call-opening.ts, livekit-call-opening.ts). Prod 10-24: a greeting began ~4.5 s after pickup and the opener played over it.
export const CALL_VOICEMAIL_V2 = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
