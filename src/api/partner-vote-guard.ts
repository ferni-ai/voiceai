/**
 * Which partner feedback votes may move a partner's quality score
 * (PARTNER_VOTE_GUARD, off by default, #2356).
 *
 * Partner feedback is shared state: votes move one global score per partner.
 * Since iOS signs every install in with an anonymous Firebase account, a
 * "verified caller" can be a free, throwaway identity, so per-user dedup alone
 * lets one person reinstall (or script anonymous tokens) into many votes. With
 * the guard on:
 *
 * - only a sign-in that costs something to make counts: a verified email, or
 *   a phone, Apple or Google sign-in. An anonymous sign-in, or an email nobody
 *   verified, is thanked and has no effect;
 * - a vote counts only from someone who has had a referral from that partner
 *   (the click route records one);
 * - a vote can lower the score but never below the recommendation floor, so
 *   votes alone never take a partner out of rotation; reaching the floor is
 *   logged once (`partner_deactivation_review`) for an admin to decide.
 *
 * The sign-in provider and email verification come from the verified token
 * (AuthContext.signInProvider / emailVerified), never the request body. The
 * shared AuthContext.isAnonymous is not used: it is also true for phone
 * sign-ins, which have no email.
 *
 * Residual risk, left for a follow-up: the referral check is self-attested
 * (anyone signed in can POST /partners/click for any partner, then vote), and
 * the referral, voter and score stores are in memory per instance, so a voter
 * who lands on several instances can count once on each.
 *
 * @module api/partner-vote-guard
 */
import { flagOn } from '../config/env-flag.js';
import { bqHash } from '../services/analytics/bq-events.js';
import { contextualPartnerships } from '../services/monetization/contextual-partnerships.js';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'PartnerVoteGuard' });

export type PartnerVoteSkip = 'anonymous' | 'unverified' | 'no_interaction';

/** Who the verified token says the caller is: never read from the request body */
export interface VoterIdentity {
  /** Firebase sign_in_provider: 'anonymous', 'phone', 'apple.com', 'password', ... */
  signInProvider?: string;
  emailVerified?: boolean;
}

export interface PartnerVoter extends VoterIdentity {
  uid: string;
}

/** Providers whose sign-in proves a real phone or account without an email check */
const PROVEN_PROVIDERS = new Set(['phone', 'apple.com', 'google.com']);

/** Whether the guard is on; with it on a vote never drops a partner below the floor. */
export function partnerVoteGuardOn(): boolean {
  return flagOn('PARTNER_VOTE_GUARD');
}

function identitySkip(voter: PartnerVoter): PartnerVoteSkip | null {
  if (voter.signInProvider === 'anonymous') return 'anonymous';
  const proven = PROVEN_PROVIDERS.has(voter.signInProvider ?? '');
  return voter.emailVerified === true || proven ? null : 'unverified';
}

/**
 * Why this vote must not move the partner's score, or null when it may.
 * Always null with PARTNER_VOTE_GUARD off.
 */
export function partnerVoteSkip(voter: PartnerVoter, partnerId: string): PartnerVoteSkip | null {
  if (!partnerVoteGuardOn()) return null;
  let skip = identitySkip(voter);
  if (!skip && !contextualPartnerships.hasReferral(voter.uid, partnerId)) skip = 'no_interaction';
  if (skip) {
    log.info({ partnerId, skip, user_tag: bqHash('user', voter.uid) }, 'Partner vote not counted');
  }
  return skip;
}
