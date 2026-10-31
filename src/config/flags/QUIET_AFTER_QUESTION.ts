import type { FlagSpec } from '../flag-spec.js';

// With LISTEN_FIRST=on, late at night (11 pm to 5 am for the caller): after Ferni asks a
// question, one soft check-in after 9 s of quiet instead of the 45 s hold; and on a call with
// any crisis signal, the usual daytime silence response instead of any night hold.
// Read in agents/voice-agent/quiet-presence.ts.
export const QUIET_AFTER_QUESTION = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
