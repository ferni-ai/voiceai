import type { FlagSpec } from '../flag-spec.js';

// on: a call to a saved contact (callOnBehalf, callAndConverse, reachOut by call or voicemail) is read back by who and why only, "a call to Mom, to see how she's feeling", never digit by digit; the number stays with the model for "which number?" and the yes still dials exactly that number. A number the owner gave, or one with no saved name, is still read back in full (telephony/saved-contact-readback.ts). Off: every call read-back says the full number, as before. Owner decision 2026-11-26.
export const CALL_READBACK_SAVED_NAME_ONLY = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
  expires: '2027-02-24',
  issue: '#4519',
} as const satisfies FlagSpec;
