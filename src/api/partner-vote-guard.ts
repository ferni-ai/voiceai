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
 * - an anonymous sign-in's vote is thanked and has no effect;
 * - a vote counts only from someone who has had a referral from that partner
 *   (the click route records one);
 * - a vote can lower the score but never deactivates the partner: that is
 *   logged (`partner_deactivation_review`) for an admin to decide.
 *
 * Anonymity comes from the verified token (AuthContext.isAnonymous), never from
 * the request body.
 *
 * @module api/partner-vote-guard
 */
import { flagOn } from '../config/env-flag.js';
import { bqHash } from '../services/analytics/bq-events.js';
import { contextualPartnerships } from '../services/monetization/contextual-partnerships.js';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'PartnerVoteGuard' });

export type PartnerVoteSkip = 'anonymous' | 'no_interaction';

export interface PartnerVoter {
  uid: string;
  /** From the verified token: an anonymous Firebase sign-in */
  isAnonymous?: boolean;
}

/** Whether the guard is on; with it on a vote never deactivates a partner. */
export function partnerVoteGuardOn(): boolean {
  return flagOn('PARTNER_VOTE_GUARD');
}

/**
 * Why this vote must not move the partner's score, or null when it may.
 * Always null with PARTNER_VOTE_GUARD off.
 */
export function partnerVoteSkip(voter: PartnerVoter, partnerId: string): PartnerVoteSkip | null {
  if (!partnerVoteGuardOn()) return null;
  let skip: PartnerVoteSkip | null = null;
  if (voter.isAnonymous === true) skip = 'anonymous';
  else if (!contextualPartnerships.hasReferral(voter.uid, partnerId)) skip = 'no_interaction';
  if (skip) {
    log.info({ partnerId, skip, user_tag: bqHash('user', voter.uid) }, 'Partner vote not counted');
  }
  return skip;
}
