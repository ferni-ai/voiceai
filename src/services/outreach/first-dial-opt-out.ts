/**
 * The do-not-call list, checked before the first dial of an on-behalf call.
 *
 * Someone who tells Ferni "don't call me again" goes on call_opt_outs
 * (call-retry.ts). Retries and family check-ins already honour that list, but a
 * new on-behalf request dialled straight through, so the same person could be
 * rung again by the next request. 47 CFR 64.1200(a)(10) asks for an opt-out to
 * be honoured however it was given.
 *
 * Behind ON_BEHALF_DNC_CHECK (off by default). When on it fails closed, like
 * isCallOptedOut: a list that can't be read, or a number that can't be
 * normalized, means no call.
 *
 * @module services/outreach/first-dial-opt-out
 */

import { flagOn } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { isCallOptedOut } from './call-retry.js';
import { consentBlocks, type ConsentDeps } from '../messaging/consent.js';
import { mayReachForOwner } from '../messaging/consent-grants.js';
import { isOwnVerifiedPhone } from './guarded-text.js';

const log = createLogger({ module: 'FirstDialOptOut' });

/** The recipient is on the do-not-call list, or hasn't agreed to calls, so no call was placed. */
export class RecipientOptedOutError extends Error {
  constructor(needsConsent = false) {
    super(
      needsConsent
        ? 'The recipient has not agreed to calls from Ferni'
        : 'The recipient asked not to be called'
    );
    this.name = 'RecipientOptedOutError';
  }
}

/** Throws RecipientOptedOutError when the check is on and this number must not be rung. */
export async function assertNotOptedOut(
  phone: string,
  isOptedOut: (phone: string) => Promise<boolean> = isCallOptedOut,
  ownerUserId?: string
): Promise<void> {
  // MESSAGING_PIPELINE: the one consent record (call_opt_outs as its fallback). Someone
  // other than the owner must have agreed to calls; unknown is not enough.
  const own = async (deps: ConsentDeps): Promise<boolean> =>
    ownerUserId !== undefined &&
    mayReachForOwner(ownerUserId, phone, 'call', isOwnVerifiedPhone, deps);
  const refused = await consentBlocks(phone, 'call', own);
  if (refused) throw new RecipientOptedOutError(refused === 'needs-consent');
  // MINOR_CARE_SHARED_HOLD: not to a number (or for a member) a call held under 18; a deferred
  // call is checked again when it is placed (it comes back through here)
  const { heldSender } = await import('./checkin-replies.js');
  if (await heldSender(ownerUserId, phone)) throw new Error('Not calling: held (MINOR_CARE)');
  if (!flagOn('ON_BEHALF_DNC_CHECK')) return;
  if (!(await isOptedOut(phone))) return;
  log.info('On-behalf call not placed: the number is on the do-not-call list');
  throw new RecipientOptedOutError();
}
