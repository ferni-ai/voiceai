/**
 * How a third party's consent becomes 'in' (the design owner's rules,
 * 2026-10-18). For a third party, unknown consent means hold (needs-consent),
 * never send.
 *
 * Consent to hear from Ferni is given FOR one owner, so it is a grant per
 * owner: consent/{phoneHash}.grants.{ownerUid}.{sms|call} = {source, at}. Only
 * the contact's own STOP/START (and a do-not-call) live on the global record,
 * because a STOP must block everyone; a global opt-out beats every grant, and
 * a global START grants nobody. A grant comes only from:
 *
 * 1. Their own YES to a consent ask from that owner: source 'contact-yes'
 *    (the consent ask and the YES land in the next stacked PR).
 * 2. The owner's attestation at the ActionGate confirm, only when the owner
 *    is in the friends-and-family cohort: source 'owner-attested', with the
 *    time. Anyone else's contacts need (1).
 *
 * A recorded opt-out always wins: an attestation never undoes a STOP (only
 * the contact's START does). The owner's own number is unaffected.
 *
 * @module services/messaging/consent-grants
 */
import { createLogger } from '../../utils/safe-logger.js';
import { last4, phoneHash, phoneHashKeyVersion, toE164 } from '../outreach/checkin-replies.js';
import { isCohortMember } from '../platform/cohort-membership.js';
import {
  consentBlocks,
  defaultConsentDeps,
  readConsent,
  type ConsentBlock,
  type ConsentChannel,
  type ConsentDeps,
} from './consent.js';

const log = createLogger({ module: 'messaging-consent-grants' });

export const FRIENDS_AND_FAMILY = 'friends-and-family';
/** The first real text after an owner's attestation opens with who is writing and for whom. */
export const attestedIntro = (owner: string, body: string): string =>
  `Ferni here, ${owner}'s AI friend. ${owner.charAt(0).toUpperCase()}${owner.slice(1)} asked me to send this: ${body}`;

/** The grants the owner holds for this phone: which channels, and how each was given. */
type Grant = Partial<Record<ConsentChannel, { source: string; at: string }>>;

function grantOf(doc: Record<string, unknown> | undefined, ownerUid: string): Grant {
  const grants = (doc?.grants ?? {}) as Record<string, unknown>;
  const g = grants[ownerUid];
  return g && typeof g === 'object' ? (g as Grant) : {};
}

/** Records `ownerUid`'s grant for `channels` (one transaction), keeping the history short codes. */
async function writeGrant(
  hash: string,
  ownerUid: string,
  channels: readonly ConsentChannel[],
  source: 'contact-yes' | 'owner-attested',
  deps: ConsentDeps
): Promise<void> {
  const at = deps.now().toISOString();
  await deps.store.apply(hash, (doc) => {
    const grants = (doc?.grants ?? {}) as Record<string, Grant>;
    const mine: Grant = { ...grantOf(doc, ownerUid) };
    for (const c of channels) mine[c] = { source, at };
    const history = Array.isArray(doc?.history) ? (doc.history as unknown[]) : [];
    return {
      ...doc,
      grants: { ...grants, [ownerUid]: mine },
      updatedAt: at,
      keyVersion: phoneHashKeyVersion(deps.env),
      history: [...history, ...channels.map((c) => `${at} ${c} grant ${source}`)].slice(-20),
    };
  });
}

/** True when `ownerUid` holds a grant for `channel` to this phone (whatever the global state). */
export async function hasGrant(
  hash: string,
  ownerUid: string,
  channel: ConsentChannel,
  deps: ConsentDeps = defaultConsentDeps()
): Promise<boolean> {
  return grantOf(await deps.store.read(hash), ownerUid)[channel] !== undefined;
}

/**
 * The owner attests, at the ActionGate confirm, that this contact is happy to
 * hear from Ferni for them on `channel`. Recorded only for a friends-and-family
 * owner, as that owner's grant, and never over an opt-out. Never throws.
 */
export async function recordOwnerAttestation(
  phone: string,
  channel: ConsentChannel,
  ownerUid: string,
  deps: ConsentDeps = defaultConsentDeps(),
  isMember: (uid: string) => Promise<boolean> = async (uid) =>
    isCohortMember(FRIENDS_AND_FAMILY, uid)
): Promise<boolean> {
  const e164 = toE164(phone);
  const hash = e164 ? phoneHash(e164, deps.env) : null;
  if (!e164 || !hash) return false;
  try {
    if (!(await isMember(ownerUid))) return false;
    if ((await readConsent(hash, deps))[channel].state === 'opted-out') return false;
    await writeGrant(hash, ownerUid, [channel], 'owner-attested', deps);
    return true;
  } catch (error) {
    log.error({ error: String(error), phoneLast4: last4(e164) }, 'Owner attestation not saved');
    return false;
  }
}

/** True when `ownerUid`'s grant on `channel` came from their own attestation. */
export async function isOwnerAttested(
  hash: string,
  channel: ConsentChannel,
  ownerUid: string,
  deps: ConsentDeps = defaultConsentDeps()
): Promise<boolean> {
  return grantOf(await deps.store.read(hash), ownerUid)[channel]?.source === 'owner-attested';
}

/** The owner's first name from their account (displayName, then name), for intros. */
export function ownerFirstName(userDoc: Record<string, unknown> | undefined): string {
  const name = [userDoc?.displayName, userDoc?.name].find((n) => typeof n === 'string' && n);
  return typeof name === 'string' ? (name.trim().split(/\s+/)[0] ?? name) : 'your friend';
}

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
