/**
 * How a third party's consent becomes 'in' (the design owner's rules,
 * 2026-10-18). For a third party, unknown consent means hold (needs-consent),
 * never send. 'in' comes only from:
 *
 * 1. Their own YES (YES, Y, OK or SURE as the whole message) answering a
 *    consent ask sent to them in the last 30 days: source 'contact-yes', for
 *    the channels that ask was about.
 * 2. The owner's attestation at the ActionGate confirm, only when the owner
 *    is in the friends-and-family cohort: source 'owner-attested', with the
 *    owner's uid and the time. Anyone else's contacts need (1).
 *
 * The only first message to a contact with no consent is the consent ask:
 * owner-confirmed, at most one per contact per 30 days (claimConsentAsk). A
 * recorded opt-out always wins: neither a YES nor an attestation undoes a
 * STOP (only the contact's START does). The owner's own number is unaffected.
 *
 * @module services/messaging/consent-grants
 */
import { createLogger } from '../../utils/safe-logger.js';
import { last4, phoneHash, toE164 } from '../outreach/checkin-replies.js';
import { isCohortMember } from '../platform/cohort-flags.js';
import {
  consentBlocks,
  defaultConsentDeps,
  normalizeReply,
  readConsent,
  writeConsent,
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

/**
 * Takes this phone's one consent ask for the next 30 days, atomically: true
 * when it may be sent now, false when one was asked within the window.
 * Returns the claim's time, for releaseConsentAsk if the text then doesn't go.
 */
export async function claimConsentAsk(
  hash: string,
  ownerUid: string,
  deps: ConsentDeps = defaultConsentDeps()
): Promise<string | null> {
  const now = deps.now();
  const at = now.toISOString();
  let claimed = false;
  await deps.store.apply(hash, (doc) => {
    const prev = askOf(doc);
    claimed = !prev || !within(prev.at, now);
    if (!claimed) return doc ?? {};
    return { ...doc, ask: { at, by: ownerUid, channels: ['sms'] }, updatedAt: at };
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

/**
 * Inbound hook: a contact's YES to a consent ask from the last 30 days turns
 * the asked channels 'in' (source contact-yes) and closes the ask. A YES with
 * no open ask, or from a number that opted out, changes nothing. Never throws.
 */
export async function recordContactYes(
  from: unknown,
  body: unknown,
  deps: ConsentDeps = defaultConsentDeps()
): Promise<ConsentChannel[] | null> {
  if (typeof from !== 'string' || typeof body !== 'string' || !isConsentYes(body)) return null;
  const e164 = toE164(from);
  const hash = e164 ? phoneHash(e164, deps.env) : null;
  if (!e164 || !hash) return null;
  try {
    const doc = await deps.store.read(hash);
    const ask = askOf(doc);
    if (!ask || !within(ask.at, deps.now())) return null;
    const consent = await readConsent(hash, deps);
    const channels = ask.channels.filter((c) => consent[c].state !== 'opted-out');
    if (channels.length > 0) await writeConsent(hash, channels, 'opted-in', 'contact-yes', deps);
    await releaseConsentAsk(hash, ask.at, deps);
    log.info({ phoneLast4: last4(e164), channels }, 'Contact said yes to texts');
    return channels;
  } catch (error) {
    log.error({ error: String(error), phoneLast4: last4(e164) }, 'Contact yes not saved');
    return null;
  }
}

/**
 * The owner attests, at the ActionGate confirm, that this contact is happy to
 * hear from Ferni on `channel`. Recorded only for a friends-and-family owner,
 * and never over an opt-out. Returns whether it was recorded. Never throws.
 */
export async function recordOwnerAttestation(
  phone: string,
  channel: ConsentChannel,
  ownerUid: string,
  deps: ConsentDeps = defaultConsentDeps(),
  isMember: (uid: string) => Promise<boolean> = async (uid) =>
    isCohortMember(uid, FRIENDS_AND_FAMILY)
): Promise<boolean> {
  const e164 = toE164(phone);
  const hash = e164 ? phoneHash(e164, deps.env) : null;
  if (!e164 || !hash) return false;
  try {
    if (!(await isMember(ownerUid))) return false;
    if ((await readConsent(hash, deps))[channel].state === 'opted-out') return false;
    await writeConsent(hash, [channel], 'opted-in', 'owner-attested', deps, { by: ownerUid });
    return true;
  } catch (error) {
    log.error({ error: String(error), phoneLast4: last4(e164) }, 'Owner attestation not saved');
    return false;
  }
}

/** True when this phone's consent on `channel` came from an owner's attestation. */
export async function isOwnerAttested(
  hash: string,
  channel: ConsentChannel,
  deps: ConsentDeps = defaultConsentDeps()
): Promise<boolean> {
  const doc = await deps.store.read(hash);
  const c = (doc?.[channel] ?? {}) as { state?: unknown; source?: unknown };
  return c.state === 'opted-in' && c.source === 'owner-attested';
}

/** True when `claim` (from claimConsentAsk) is still this phone's open consent ask. */
export async function holdsConsentAsk(
  hash: string,
  claim: string,
  deps: ConsentDeps = defaultConsentDeps()
): Promise<boolean> {
  return askOf(await deps.store.read(hash))?.at === claim;
}

/** The owner's first name from their account (displayName, then name), for intros. */
export function ownerFirstName(userDoc: Record<string, unknown> | undefined): string {
  const name = [userDoc?.displayName, userDoc?.name].find((n) => typeof n === 'string' && n);
  return typeof name === 'string' ? (name.trim().split(/\s+/)[0] ?? name) : 'your friend';
}

/**
 * For a caller that knows it is reaching someone for an owner: null when
 * `channel` to `phone` may go, else why not. The owner's own verified number
 * needs only no opt-out; anyone else needs consent 'in' (needs-consent).
 */
export async function thirdPartyRefusal(
  ownerUid: string,
  phone: string,
  channel: ConsentChannel
): Promise<ConsentBlock | null> {
  return consentBlocks(phone, channel, async () =>
    (await import('../outreach/guarded-text.js')).isOwnVerifiedPhone(ownerUid, phone)
  );
}
