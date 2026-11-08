import type { FlagSpec } from '../flag-spec.js';

// on: phone (SIP) callers need 500 ms of speech before Ferni pauses (not 150 ms) and a pause with no words resumes after 1 s (not 2 s). Read in agents/multi-agent/interruption-config.ts.
export const PHONE_INTERRUPT_TUNING = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
