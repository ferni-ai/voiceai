import type { FlagSpec } from '../flag-spec.js';

// on: the told-this-call note (told-this-call.ts, needs TOLD_THIS_CALL, on by default) also names any sentence 2+ of Ferni's last replies said word for word (after normalising case and punctuation; already-said.ts), so the next reply doesn't say it a third time. Never a line said once, a question, a short confirmation, a sign-off, a number, or crisis, safety, care or notice wording; no ledger for a window that touches safety or a number to call, on a crisis-noted call, or on a turn where the caller asks him to say it again. A note only; no reply is rewritten. Off: the note is exactly as before.
export const ALREADY_SAID_LEDGER = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-03',
  issue: 'TBD',
  context:
    'Keep if verbatim repeats drop on dev calls with no safety or notice line ever named; else delete.',
} as const satisfies FlagSpec;
