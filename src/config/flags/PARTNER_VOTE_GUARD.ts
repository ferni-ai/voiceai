import type { FlagSpec } from '../flag-spec.js';

// on: partner feedback counts only from a verified email or a phone/Apple/Google sign-in that has had a referral from that partner (anything else is thanked but moves nothing), and votes never push a partner below the recommendation floor (logged once as partner_deactivation_review) (api/partner-vote-guard.ts). off = every verified caller's first vote counts and eight not_helpful votes deactivate.
export const PARTNER_VOTE_GUARD = {
  default: 'off',
  owner: 'billing',
  kind: 'experiment',
  expires: '2027-02-22',
  issue: '#2356',
} as const satisfies FlagSpec;
