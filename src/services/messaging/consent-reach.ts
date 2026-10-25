/**
 * Who may reach a phone for an owner (split from consent-grants.ts, which
 * records the grants): the owner's own verified number, or the owner's own
 * grant, and never past the contact's own opt-out.
 *
 * @module services/messaging/consent-reach
 */
import { phoneHash } from '../outreach/checkin-replies.js';
import {
  consentBlocks,
  defaultConsentDeps,
  readConsent,
  type ConsentBlock,
  type ConsentChannel,
  type ConsentDeps,
} from './consent.js';
import { hasGrant, holdsConsentAsk } from './consent-grants.js';

/** Is `phone` the owner's own verified number? (guarded-text's isOwnVerifiedPhone; pass it when imported.) */
export type OwnNumberCheck = (ownerUid: string, phone: string) => Promise<boolean>;
const defaultIsOwn: OwnNumberCheck = async (uid, phone) =>
  (await import('../outreach/guarded-text.js')).isOwnVerifiedPhone(uid, phone);

/** Did this phone opt out of anything (a plain STOP, or "stop calling")? */
async function anyGlobalOptOut(hash: string, deps: ConsentDeps): Promise<boolean> {
  const { sms, call } = await readConsent(hash, deps);
  return sms.state === 'opted-out' || call.state === 'opted-out';
}

/**
 * May `ownerUid` reach this phone when nothing global forbids it? Yes for the
 * owner's own verified number, or with their own grant for `channel`. A grant
 * never outlives the contact's own opt-out: a plain STOP (texts only) also
 * ends every owner's call grant, since it beats every grant.
 */
export async function mayReachForOwner(
  ownerUid: string,
  phone: string,
  channel: ConsentChannel,
  isOwn: OwnNumberCheck = defaultIsOwn,
  deps: ConsentDeps = defaultConsentDeps()
): Promise<boolean> {
  if (await isOwn(ownerUid, phone)) return true;
  const hash = phoneHash(phone, deps.env);
  if (hash === null || (await anyGlobalOptOut(hash, deps))) return false;
  return hasGrant(hash, ownerUid, channel, deps);
}

/**
 * For a caller that knows it is reaching someone for an owner: null when
 * `channel` to `phone` may go, else why not. A global opt-out refuses; the
 * owner's own number, or the owner's own grant, lets it go; else needs-consent.
 */
export async function thirdPartyRefusal(
  ownerUid: string,
  phone: string,
  channel: ConsentChannel,
  isOwn: OwnNumberCheck = defaultIsOwn,
  deps: ConsentDeps = defaultConsentDeps()
): Promise<ConsentBlock | null> {
  const block = await consentBlocks(
    phone,
    channel,
    async (d) => mayReachForOwner(ownerUid, phone, channel, isOwn, d),
    deps
  );
  if (block !== 'needs-consent') return block;
  const hash = phoneHash(phone, deps.env);
  return hash !== null && (await anyGlobalOptOut(hash, deps)) ? 'opted-out' : block;
}

/** The sender's own text grant, or their live consent-ask claim (the one ask may go). */
export async function grantedOrAsked(
  hash: string,
  senderUid: string,
  claim: string | undefined,
  deps: ConsentDeps = defaultConsentDeps()
): Promise<boolean> {
  if (claim !== undefined && (await holdsConsentAsk(hash, claim, senderUid, deps))) return true;
  return hasGrant(hash, senderUid, 'sms', deps);
}
