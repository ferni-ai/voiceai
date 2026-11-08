import type { FlagSpec } from '../flag-spec.js';

// on: a phone (SIP) caller's audio goes through LiveKit's telephony background voice cancellation (TelephonyBackgroundVoiceCancellation, LiveKit Cloud only) instead of the AGC + high-pass frame processor. Read in agents/multi-agent/room-input-options.ts.
export const PHONE_NOISE_CANCEL = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
