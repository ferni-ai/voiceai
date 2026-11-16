import type { FlagSpec } from '../flag-spec.js';

// on: a text from a number that is not a member's verified phone gets one fixed reply (services/outreach/sms-reply/sms-unverified.ts), at most once per number per 24 hours. Never after an opt-out, a pause or a consent record that can't be read, and never for a text a check-in, contact YES or holder code record used. No memory read or written. Needs SMS_CRISIS_SCREEN=on. Off: no reply, as before.
export const SMS_REPLY_UNVERIFIED = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
  expires: '2027-02-08',
  issue: 'https://github.com/ferni-ai/voiceai/issues/3682',
  context:
    "Memory step 7: on in dev after the reply rows and an independent verify; prod only on Seth's yes.",
} as const satisfies FlagSpec;
