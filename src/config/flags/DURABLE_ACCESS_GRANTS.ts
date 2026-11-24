import type { FlagSpec } from '../flag-spec.js';

// off | on (#2264): with WAITLIST_GATE on, a stored access grant made for a reason that ends (open access while the gate was off, a friends-and-family membership, the admission check itself) no longer admits by itself; the live admission rules decide each time, and a lapsed waitlist approval goes back in line. A live paid plan (Stripe or App Store), admin approvals and wave seats still last; unlabelled approvals older than APPROVAL_REASONS_SINCE (legacy, unless a profile grant records open access or admission) keep admitting and log access_grant_legacy (api/access-grant-standing.ts). The public feature vote never overwrites an existing waitlist entry, flag or no flag (api/waitlist-feature-interest.ts). BEFORE TURNING THIS ON: check APPROVAL_REASONS_SINCE equals the day #2264 deployed to prod (move it if not); it reverses #1953's grandfathering of everyone open access let in (their grants stop admitting), which is Seth's call; set WAITLIST_GATE_SINCE first so accounts created before the gate stay admitted by date.
export const DURABLE_ACCESS_GRANTS = {
  default: 'off',
  owner: 'platform',
  kind: 'experiment',
  expires: '2027-02-22',
  issue: '#2264',
} as const satisfies FlagSpec;
