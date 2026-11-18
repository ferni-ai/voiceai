import type { FlagSpec } from '../flag-spec.js';

// on: DELETE /api/export/all (delete my data, keep my account) holds the sign-in during the erasure and restores it once every step succeeded (platform/erase-user-record.ts, identity/token-revocation.ts); a failed erasure keeps it refused. off = the sign-in is refused on this instance until restart, as before. Account deletion is unchanged either way.
export const DATA_ERASE_KEEPS_SIGNIN = {
  default: 'off',
  owner: 'platform',
  kind: 'experiment',
  expires: '2027-02-16',
  issue: '#3292',
} as const satisfies FlagSpec;
