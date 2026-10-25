import type { FlagSpec } from '../flag-spec.js';

// on (with CALL_HOURS_GUARD=on): a "call me" text from the account's own verified phone places that call through callUserAdapter.call (the same path as asking in a call), and the reply says it is ringing or scheduled; off = no call, and the reply no longer claims one (sms-call-me.ts). DO NOT turn on yet: a word match can't tell "sure, call me 🙄" from a real ask (verifier r2, 2026-10-25). The next PR dials only on a YES to "Want me to call you now?".
export const SMS_CALL_ME = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
} as const satisfies FlagSpec;
