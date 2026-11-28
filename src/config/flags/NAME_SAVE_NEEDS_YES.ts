import type { FlagSpec } from '../flag-spec.js';

// on: a name said on a call renames the account only after their yes, as with CALL_ME_VOCATIVE (rememberName asks "want me to call you Sam from now on?" and saves on the yes; name-correction renames this call only), without CALL_ME_VOCATIVE's ringing on "call me, Ferni". Off: as before.
export const NAME_SAVE_NEEDS_YES = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
  expires: '2027-02-25',
  issue: '#4389',
} as const satisfies FlagSpec;
