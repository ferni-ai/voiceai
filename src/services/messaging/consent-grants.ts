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
 * 1. Their own YES (YES, Y, OK or SURE as the whole message) answering a
 *    consent ask from the last 30 days: source 'contact-yes', for the owner
 *    who asked (ask.by) and the channels asked about.
 * 2. The owner's attestation at the ActionGate confirm, only when the owner
 *    is in the friends-and-family cohort: source 'owner-attested', with the
 *    time. Anyone else's contacts need (1).
 *
 * The only first message to a contact with no consent is the consent ask:
 * owner-confirmed, at most one per contact per 30 days (claimConsentAsk). A
 * recorded opt-out always wins: neither a YES nor an attestation undoes a
 * STOP (only the contact's START does). The owner's own number is unaffected.
 *
 * @module services/messaging/consent-grants
 */
import { createLogger } from '../../utils/safe-logger.js';
import {
  firestoreReplyStore,
  last4,
  phoneHash,
  phoneHashKeyVersion,
  toE164,
  type StoredCheckin,
} from '../outreach/checkin-replies.js';
import { isCohortMember } from '../platform/cohort-membership.js';
import {
  consentBlocks,
  defaultConsentDeps,
  normalizeReply,
  readConsent,
  type ConsentBlock,
  type ConsentChannel,
  type ConsentDeps,
} from './consent.js';

const log = createLogger({ module: 'messaging-consent-grants' });

export const FRIENDS_AND_FAMILY = 'friends-and-family';
export const CONSENT_ASK_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const YES_WORDS: ReadonlySet<string> = new Set(['yes', 'y', 'ok', 'sure']);

/** YES, Y, OK or SURE as the whole message (any case, punctuation stripped), never inside one. */
export const isConsentYes = (body: string): boolean => YES_WORDS.has(normalizeReply(body));

interface ConsentAsk {
  at: string;
  by: string;
  channels: ConsentChannel[];
  /** The ask text's refId in feature_checkins, to tell it from any later text. */
  ref?: string;
}

/** A YES counts only while the ask is the last text to that number, and this recent. */
export const YES_WINDOW_MS = 48 * 60 * 60 * 1000;
const MESSAGE_SID = /^[A-Za-z0-9]{10,64}$/;
/** The texts sent to a phone (feature_checkins), newest not guaranteed first. */
export type TextsToPhone = (hash: string) => Promise<StoredCheckin[]>;

/** The newest text actually sent to this phone, from anyone. */
function latestSent(texts: readonly StoredCheckin[]): StoredCheckin | undefined {
  return texts
    .filter((t) => t.status === 'sent' && !Number.isNaN(Date.parse(t.sentAt)))
    .sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt))[0];
}

function askOf(doc: Record<string, unknown> | undefined): ConsentAsk | null {
  const a = (doc?.ask ?? null) as Partial<ConsentAsk> | null;
  return a && typeof a.at === 'string' && Array.isArray(a.channels) ? (a as ConsentAsk) : null;
}

const within = (iso: string, now: Date): boolean =>
  now.getTime() - Date.parse(iso) < CONSENT_ASK_WINDOW_MS;

/** The consent-ask text: names the owner and offers YES or STOP. */
export const consentAskText = (owner: string): string =>
  `Ferni here, ${owner}'s AI friend. Reply YES if it's OK for Ferni to text you for ${owner}, or STOP.`;

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
 * Takes this phone's one consent ask for the next 30 days, atomically, for
 * `ownerUid`. Returns the claim (its time) when it may be sent now, null when
 * one was asked within the window; releaseConsentAsk gives it back.
 */
export async function claimConsentAsk(
  hash: string,
  ownerUid: string,
  deps: ConsentDeps = defaultConsentDeps(),
  ref?: string
): Promise<string | null> {
  const now = deps.now();
  const at = now.toISOString();
  let claimed = false;
  await deps.store.apply(hash, (doc) => {
    const prev = askOf(doc);
    claimed = !prev || !within(prev.at, now);
    if (!claimed) return doc ?? {};
    const ask = { at, by: ownerUid, channels: ['sms'], ...(ref !== undefined && { ref }) };
    return { ...doc, ask, updatedAt: at };
  });
  return claimed ? at : null;
}

/** Gives the ask back when it never went out (quiet hours, a failed send), so it can be retried. */
export async function releaseConsentAsk(
  hash: string,
  at: string,
  deps: ConsentDeps = defaultConsentDeps()
): Promise<void> {
  await deps.store.apply(hash, (doc) => {
    if (askOf(doc)?.at !== at) return doc ?? {};
    const { ask: _ask, ...rest } = doc ?? {};
    return rest;
  });
}

/** True when `claim` is still this phone's open consent ask, and `ownerUid` made it. */
export async function holdsConsentAsk(
  hash: string,
  claim: string,
  ownerUid: string,
  deps: ConsentDeps = defaultConsentDeps()
): Promise<boolean> {
  const ask = askOf(await deps.store.read(hash));
  return ask?.at === claim && ask.by === ownerUid;
}

/**
 * Inbound hook: a contact's YES grants the owner who asked (ask.by) the asked
 * channels (source contact-yes) and closes the ask, but only when that ask is
 * still the LAST text sent to the number, within 48 hours: an "ok" after any
 * later text (another owner's, a reminder) may answer that one instead. Each
 * inbound MessageSid counts once, so a replayed webhook grants nothing. A YES
 * from a number that opted out changes nothing. Never throws.
 */
export async function recordContactYes(
  from: unknown,
  body: unknown,
  messageSid: unknown,
  deps: ConsentDeps = defaultConsentDeps(),
  textsTo: TextsToPhone = async (h) => firestoreReplyStore.forPhoneHash(h)
): Promise<ConsentChannel[] | null> {
  if (typeof from !== 'string' || typeof body !== 'string' || !isConsentYes(body)) return null;
  const e164 = toE164(from);
  const hash = e164 ? phoneHash(e164, deps.env) : null;
  const sid = typeof messageSid === 'string' && MESSAGE_SID.test(messageSid) ? messageSid : null;
  if (!e164 || !hash || !sid) return null;
  try {
    const ask = askOf(await deps.store.read(hash));
    const last = latestSent(await textsTo(hash));
    const now = deps.now().getTime();
    const answersAsk =
      ask?.ref !== undefined &&
      last?.refId === ask.ref &&
      now - Date.parse(last.sentAt) < YES_WINDOW_MS;
    if (!ask || !answersAsk || !(await firstSighting(hash, sid, deps))) return null;
    const consent = await readConsent(hash, deps);
    const channels = ask.channels.filter((c) => consent[c].state !== 'opted-out');
    if (channels.length > 0) await writeGrant(hash, ask.by, channels, 'contact-yes', deps);
    await releaseConsentAsk(hash, ask.at, deps);
    log.info({ phoneLast4: last4(e164), channels }, 'Contact said yes to texts for one owner');
    return channels;
  } catch (error) {
    log.error({ error: String(error), phoneLast4: last4(e164) }, 'Contact yes not saved');
    return null;
  }
}

/** Records an inbound MessageSid atomically; false when it was seen before (a replay). */
async function firstSighting(hash: string, sid: string, deps: ConsentDeps): Promise<boolean> {
  let fresh = false;
  await deps.store.apply(hash, (doc) => {
    const seen = Array.isArray(doc?.seenSids) ? (doc.seenSids as string[]) : [];
    fresh = !seen.includes(sid);
    return fresh ? { ...doc, seenSids: [...seen, sid].slice(-20) } : (doc ?? {});
  });
  return fresh;
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
