import type { FlagSpec } from '../flag-spec.js';

// on: every call Ferni answers gets a block in the cached model-level instructions: no record of an earlier call is not proof it didn't happen, so never deny what the caller says he told them before and never pretend to remember it; say the call isn't in front of him and ask; what's true of him now still holds. The director's and deliberator's guard rule adds that such a caller may be right and is never to be called lying or stood firm against. And the notes for a caller with no past calls (call-start awareness, persona beats, first-call rapport) say no earlier call is on record instead of "first call", and the stranger's hello and FIRST_CALL_INTRO's say "you don't know them yet" and turn away a hello claiming no past (agents/personas/earlier-call-honest.ts, #3134). off = none of it.
export const EARLIER_CALL_NO_DENIAL = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-21',
  issue: '#3134',
} as const satisfies FlagSpec;
