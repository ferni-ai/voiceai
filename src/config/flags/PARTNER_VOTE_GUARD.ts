import type { FlagSpec } from '../flag-spec.js';

// on: partner feedback from an anonymous Firebase sign-in, or from someone with no referral from that partner, is thanked but moves nothing, and feedback never deactivates a partner (logged as partner_deactivation_review instead) (api/partner-vote-guard.ts). off = every verified caller's first vote counts and eight not_helpful votes deactivate.
export const PARTNER_VOTE_GUARD = {
  default: 'off',
  owner: 'billing',
  kind: 'experiment',
  expires: '2027-02-22',
  issue: '#2356',
} as const satisfies FlagSpec;
