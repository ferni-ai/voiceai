import type { FlagSpec } from '../flag-spec.js';

// off | on (#2264): with WAITLIST_GATE on, a stored access grant made for a reason that ends (open access while the gate was off, a friends-and-family membership, the admission check itself) no longer admits by itself; the live admission rules decide each time, and a lapsed waitlist approval goes back in line. Admin approvals and wave seats still last; grants with no recorded reason (legacy) keep admitting and log access_grant_legacy (api/access-grant-standing.ts).
export const DURABLE_ACCESS_GRANTS = {
  default: 'off',
  owner: 'platform',
  kind: 'experiment',
  expires: '2027-02-22',
  issue: '#2264',
} as const satisfies FlagSpec;
