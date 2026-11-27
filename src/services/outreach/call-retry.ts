/**
 * One retry for a missed on-behalf call (no answer or voicemail), the next day
 * inside calling hours. Scheduled as a scheduled-outreach item with channel
 * 'on_behalf_call'; the scheduled-outreach job places it.
 *
 * Fails closed:
 * - Calling hours: without a calling-hours guard wired in, a retry is only
 *   scheduled or placed inside 10:00-18:00 local time in every continental
 *   North American time zone, so it is inside hours wherever the number is.
 *   A number outside that area is never retried.
 * - Consent: a number on the do-not-call list (call_opt_outs, recorded when
 *   someone asks not to be called again) is never retried, and nothing is
 *   retried when the list can't be read.
 * - Authorization: the retry is stored as a dispatch signed by the server for
 *   the requester; the job places it only if the signature verifies and the
 *   requester is the user whose document it is.
 *
 * Part of call follow-through (CALL_FOLLOWTHROUGH=on).
 *
 * CALL_RETRY_ASKS_FIRST (owner, 2026-11-26): Ferni never redials on its own. The signed
 * retry is stored as an offer and only the owner's yes schedules it (call-retry-offer.ts),
 * for 10:00-18:00 where the callee is (calleeZoneOf), keeping the first call's own context.
 *
 * @module services/outreach/call-retry
 */

import { flagOn } from '../../config/env-flag.js';
import { getLogger } from '../../utils/safe-logger.js';
import { consentBlocks, writeOptOut, type ConsentDeps } from '../messaging/consent.js';
import { mayReachForOwner } from '../messaging/consent-reach.js';
import { isOwnVerifiedPhone } from './guarded-text.js';
import { phoneHash } from './checkin-replies.js';
import { timezoneFromPhone } from './area-code-timezones.js';
import { isValidTimezone } from './call-hours-guard.js';
import {
  callPreferencesOf,
  onBehalfDispatchFor,
  onBehalfRequestFromDispatch,
  parseOnBehalfDispatch,
  dispatchSigningSecret,
  dispatchVerifySecrets,
  signOnBehalfDispatch,
  takePreferencesForRetry,
  verifyOnBehalfDispatch,
  VERIFIED_CALL_TTL_MS,
  type CallPreferences,
  type OnBehalfDispatch,
} from './on-behalf-dispatch.js';

const log = getLogger().child({ service: 'call-retry' });

export interface CallRecipient {
  name?: string;
  phone?: string;
  /** The recipient's own IANA zone, when known (never the requester's). */
  timezone?: string;
}

/** May Ferni call this person at this time? Defaults to the safe window below. */
export type CallTimeGuard = (recipient: CallRecipient, at: Date) => boolean | Promise<boolean>;

export interface CallRetryDeps {
  isAllowedCallTime?: CallTimeGuard;
  now?: () => Date;
}

/** Call follow-through (outcome detail and the one retry) is off unless CALL_FOLLOWTHROUGH=on. */
export function isCallFollowthroughEnabled(): boolean {
  return process.env.CALL_FOLLOWTHROUGH === 'on';
}

/** The retry waits for the owner's yes, at the callee's hour, with the first call's context. */
export function isCallRetryAsksFirst(): boolean {
  return flagOn('CALL_RETRY_ASKS_FIRST');
}

// ============================================================================
// CALLING HOURS
// ============================================================================

/** Continental North American zones, Atlantic to Pacific. */
const SAFE_ZONES = [
  'America/Halifax',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
];
/** NANP area codes outside those zones (Hawaii, Alaska, Newfoundland, territories). */
const OUTSIDE_SAFE_ZONES = new Set([
  '808',
  '907',
  '709',
  '879',
  '787',
  '939',
  '340',
  '671',
  '670',
  '684',
]);
const OPEN_MINUTE = 10 * 60;
const CLOSE_MINUTE = 18 * 60;

function zoneParts(at: Date, timeZone: string): number[] {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return [get('year'), get('month'), get('day'), get('hour'), get('minute')];
}

/** The instant that is `hour:minute` local time in `timeZone`, `daysAhead` days after `from`. */
export function localTimeAfter(
  from: Date,
  timeZone: string,
  daysAhead: number,
  hour: number,
  minute: number
): Date {
  const [y, m, d] = zoneParts(from, timeZone);
  const guess = Date.UTC(y, m - 1, d + daysAhead, hour, minute);
  const [gy, gm, gd, gh, gmin] = zoneParts(new Date(guess), timeZone);
  const offset = Date.UTC(gy, gm - 1, gd, gh, gmin) - guess;
  return new Date(guess - offset);
}

/**
 * The one normalization for a recipient's number, used for every read and
 * write of the do-not-call list, for the retry, and for the calling-hours
 * window: '+1NXXNXXXXXX'. Formatting is stripped and a leading 1 or +1 is
 * accepted. Anything that isn't a valid North American number is null; it is
 * never guessed, and callers fail closed on null. A "+" with another country
 * code is never re-read as +1 ("+234 803 1234" is Nigeria, not +1 234...),
 * however it is dressed: invisible format characters (zero-width spaces, the
 * BOM), whitespace and leading brackets are stripped before that check.
 */
export function toE164(phone: string | undefined | null): string | null {
  const head = (phone ?? '').replace(/\p{Cf}/gu, '').replace(/^[\s([{]+/u, '');
  if (head.startsWith('+') && !/^\+[\s().-]*1/.test(head)) return null;
  const digits = head.replace(/\D/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(national) ? `+1${national}` : null;
}

/**
 * The default guard: 10:00-18:00 local in every continental zone, for a North
 * American number in those zones. Anything else is refused.
 */
export const safeWindowGuard: CallTimeGuard = (recipient, at) => {
  const e164 = toE164(recipient.phone);
  if (!e164 || OUTSIDE_SAFE_ZONES.has(e164.slice(2, 5))) return false;
  return SAFE_ZONES.every((zone) => inCallingHours(at, zone));
};

function inCallingHours(at: Date, zone: string): boolean {
  const [, , , hour, minute] = zoneParts(at, zone);
  const minutes = hour * 60 + minute;
  return minutes >= OPEN_MINUTE && minutes < CLOSE_MINUTE;
}

/** Where the callee's zone came from: their number's area code, or the owner's own (said so). */
export interface CalleeZone {
  zone: string;
  source: 'area_code' | 'owner';
}

/**
 * The callee's zone, never the server's (owner, 2026-11-26: a sensible hour where THEY are).
 * No contact record stores a zone, so the number's area code, else the owner's zone, which
 * the offer then says; null when neither is known. Never a guess.
 */
export function calleeZoneOf(call: OnBehalfDispatch): CalleeZone | null {
  const byNumber = timezoneFromPhone(call.contact.phone);
  if (byNumber) return { zone: byNumber, source: 'area_code' };
  const owner = call.requester.timezone;
  // 'UTC' is what parseOnBehalfDispatch puts in for a dispatch with no zone: not known.
  return owner !== 'UTC' && isValidTimezone(owner) ? { zone: owner, source: 'owner' } : null;
}

/** CALL_RETRY_ASKS_FIRST's guard: 10:00-18:00 in the recipient's own zone; no zone, no call. */
export const calleeHoursGuard: CallTimeGuard = (recipient, at) =>
  !!recipient.timezone && !!toE164(recipient.phone) && inCallingHours(at, recipient.timezone);

/** Tomorrow where the callee is: the first half hour from 10:00 the guard allows, before 18:00. */
export async function calleeRetrySlot(
  call: OnBehalfDispatch,
  zone: string,
  now: Date,
  guard: CallTimeGuard
): Promise<Date | null> {
  const recipient = { ...recipientOf(call), timezone: zone };
  for (let half = OPEN_MINUTE / 30; half < CLOSE_MINUTE / 30; half++) {
    const slot = localTimeAfter(now, zone, 1, Math.floor(half / 2), (half % 2) * 30);
    if (await guard(recipient, slot)) return slot;
  }
  return null;
}

function recipientOf(call: OnBehalfDispatch): CallRecipient {
  const recipient = { name: call.contact.name, phone: call.contact.phone };
  return isCallRetryAsksFirst() ? { ...recipient, timezone: calleeZoneOf(call)?.zone } : recipient;
}

/** Next-day candidates, every half hour from 9:00 to 20:30 Eastern; the guard picks. */
async function nextAllowedSlot(
  call: OnBehalfDispatch,
  now: Date,
  guard: CallTimeGuard
): Promise<Date | null> {
  for (let half = 18; half <= 41; half++) {
    const slot = localTimeAfter(now, 'America/New_York', 1, Math.floor(half / 2), (half % 2) * 30);
    if (await guard(recipientOf(call), slot)) return slot;
  }
  return null;
}

// ============================================================================
// DO-NOT-CALL LIST
// ============================================================================

/** Record that the person at this number asked not to be called again (keyed by toE164). */
export async function recordCallOptOut(
  phone: string,
  context: { callId: string; requesterUserId: string }
): Promise<boolean> {
  const key = toE164(phone);
  const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
  const db = getFirestoreDb();
  if (!key || !db) return false;
  await db
    .collection('call_opt_outs')
    .doc(key)
    .set({ phone: key, optedOutAt: new Date().toISOString(), ...context });
  log.info({ callId: context.callId }, 'Recorded a do-not-call request');
  // Also the one consent record (messaging/consent.ts), flag or not, so no opt-out is lost
  // before MESSAGING_PIPELINE is armed; nothing reads it while the flag is off.
  const hash = phoneHash(key);
  try {
    if (!hash) throw new Error('no LOG_HASH_SECRET');
    await writeOptOut(hash, 'call', 'voice-call');
  } catch (error) {
    // Still on call_opt_outs above, which every call path reads today.
    log.error({ error: String(error), callId: context.callId }, 'Call opt-out not in consent');
  }
  return true;
}

/**
 * True when the number is on the do-not-call list, when the list can't be
 * read, or when the number can't be normalized (looked up by toE164).
 */
export async function isCallOptedOut(phone: string): Promise<boolean> {
  const key = toE164(phone);
  if (!key) return true;
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) return true;
    return (await db.collection('call_opt_outs').doc(key).get()).exists;
  } catch (error) {
    log.warn({ error: String(error) }, 'Could not read the do-not-call list; not calling');
    return true;
  }
}

// ============================================================================
// SCHEDULE AND PLACE
// ============================================================================

/**
 * Schedule the one retry of a missed call. The document id comes from the
 * missed call and `create` fails if it exists, so a call is never retried
 * twice; a call that is itself a retry is never retried at all.
 */
export async function scheduleCallRetry(
  call: OnBehalfDispatch,
  deps: CallRetryDeps = {}
): Promise<Date | null> {
  // The first call's own words come from its signed dispatch, never the parsed call (#4497).
  // Taken first, so they are gone after this decision whether or not a retry is offered.
  const said = takePreferencesForRetry(call.callId);
  const secret = dispatchSigningSecret();
  const recipient = toE164(call.contact.phone);
  if (call.retryOf || !recipient || !secret) return null;
  if (await isCallOptedOut(recipient)) return null;

  const now = deps.now?.() ?? new Date();
  const request = { ...requestKeepingContext(call, said), retryOf: call.callId };
  const signed = signOnBehalfDispatch(onBehalfDispatchFor(`retry_${call.callId}`, request), secret);
  // Owner, 2026-11-26: no redial on Ferni's own. Null keeps the report's "try again?" offer.
  if (isCallRetryAsksFirst()) return offerRetry(signed, now);
  const at = await nextAllowedSlot(call, now, deps.isAllowedCallTime ?? safeWindowGuard);
  if (!at) return null;
  return storeScheduledRetry(signed, at, now);
}

/**
 * The request a dispatch describes. CALL_RETRY_ASKS_FIRST also keeps the first call's own words
 * (additionalContext, preferredTimes, constraints), read from a signed payload by
 * on-behalf-dispatch.ts, so the retry's script says what the first did. Flag off: main's request.
 */
function requestKeepingContext(call: OnBehalfDispatch, said: CallPreferences): OnBehalfRequest {
  const request = onBehalfRequestFromDispatch(call);
  if (!isCallRetryAsksFirst() || Object.keys(said).length === 0) return request;
  return { ...request, userPreferences: said };
}
type OnBehalfRequest = ReturnType<typeof onBehalfRequestFromDispatch>;

/** Where a signed retry waits for the owner's yes, by the retry's callId (call-retry-offer.ts). */
const RETRY_OFFERS = 'call_retry_offers';

/** Older offers are dropped: a days-old missed call is asked about afresh, never redialled. */
export const OFFER_TTL_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * The owner's retry offers; null without Firestore. call-retry-offer.ts reads and updates them
 * through here, so this file stays the one place outreach reaches the Firestore accessor.
 */
export async function retryOffersOf(userId: string) {
  const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
  return getFirestoreDb()?.collection('bogle_users').doc(userId).collection(RETRY_OFFERS) ?? null;
}

async function offerRetry(signed: OnBehalfDispatch, now: Date): Promise<null> {
  try {
    const offers = await retryOffersOf(signed.requester.userId);
    if (!offers) throw new Error('no Firestore');
    await offers.doc(signed.callId).create({
      status: 'offered',
      contactName: signed.contact.name,
      offeredAt: now.getTime(),
      onBehalfDispatch: JSON.parse(JSON.stringify(signed)),
      // expireAt (a Date is stored as a Timestamp): the TTL field that deletes the offer, with
      // the callee's number and the call's purpose, once it can no longer be said yes to.
      expireAt: new Date(now.getTime() + OFFER_TTL_MS),
    });
    log.info({ callId: signed.retryOf }, 'Offered one retry for a missed call');
  } catch (error) {
    log.info({ error: String(error), callId: signed.retryOf }, 'Retry not offered');
  }
  return null;
}

/**
 * Store a signed retry for the scheduled-outreach job. The document id is the retry's
 * callId and `create` fails if it exists, so a missed call is never retried twice.
 */
export async function storeScheduledRetry(
  signed: OnBehalfDispatch,
  at: Date,
  now: Date
): Promise<Date | null> {
  const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
  const db = getFirestoreDb();
  if (!db) return null;
  const id = signed.callId;
  try {
    await db
      .collection('bogle_users')
      .doc(signed.requester.userId)
      .collection('scheduled_outreach')
      .doc(id)
      .create({
        id,
        userId: signed.requester.userId,
        personaId: 'ferni',
        status: 'pending',
        // A Date, not an ISO string: the scheduled-outreach job queries scheduledFor as a timestamp.
        scheduledFor: at,
        createdAt: now,
        updatedAt: now,
        retryCount: 0,
        maxRetries: 0,
        target: {
          contact: signed.contact.name,
          purpose: signed.purpose,
          channel: 'on_behalf_call',
          resolvedContactId: '',
          resolvedContactName: signed.contact.name,
          resolvedPhone: toE164(signed.contact.phone),
          onBehalfDispatch: JSON.parse(JSON.stringify(signed)),
        },
      });
    log.info(
      { callId: signed.retryOf, retryAt: at.toISOString() },
      'Scheduled one retry for a missed call'
    );
    return at;
  } catch (error) {
    log.info(
      { error: String(error), callId: signed.retryOf },
      'Retry not scheduled (already exists or write failed)'
    );
    return null;
  }
}

// Verified dispatches of calls running in this process, by callId (kept a day).
const verifiedCalls = new Map<string, { call: OnBehalfDispatch; at: number }>();

/** Remember a call's verified dispatch. Call only after the dispatch's signature checked out. */
export function rememberVerifiedCall(call: OnBehalfDispatch): void {
  const now = Date.now();
  for (const [id, entry] of verifiedCalls) {
    if (now - entry.at > VERIFIED_CALL_TTL_MS) verifiedCalls.delete(id);
  }
  verifiedCalls.set(call.callId, { call, at: now });
}

/**
 * Schedule the retry of a call this process verified, by callId: for paths
 * that learn a call was missed (e.g. voicemail detection) but don't hold the
 * dispatch. Null for a call this process never verified, and with the flag off.
 */
export async function scheduleCallRetryById(
  callId: string,
  deps: CallRetryDeps = {}
): Promise<Date | null> {
  const entry = verifiedCalls.get(callId);
  if (!isCallFollowthroughEnabled() || !entry) return null;
  return scheduleCallRetry(entry.call, deps);
}

/**
 * Place a scheduled retry for the user who owns the scheduled item. Run by the
 * scheduled-outreach job; never throws.
 */
export async function placeCallRetry(
  signedDispatch: unknown,
  ownerUserId: string,
  deps: CallRetryDeps = {}
): Promise<{ success: boolean; error?: string }> {
  if (!isCallFollowthroughEnabled()) return { success: false, error: 'CALL_FOLLOWTHROUGH is off' };
  const raw = JSON.stringify(signedDispatch ?? null);
  if (!verifyOnBehalfDispatch(raw, dispatchVerifySecrets())) {
    return { success: false, error: 'Retry is not signed by the server' };
  }
  const call = parseOnBehalfDispatch(signedDispatch as Record<string, unknown>);
  if (!call?.retryOf || !toE164(call.contact.phone) || call.requester.userId !== ownerUserId) {
    return { success: false, error: 'Not a retry for this user' };
  }
  // Without the SIP trunk the orchestrator falls back to a one-way Twilio call.
  if (!process.env.SIP_TRUNK_ID) {
    return { success: false, error: 'No SIP trunk for a conversational call' };
  }
  // MESSAGING_PIPELINE: a third party must have agreed to calls (needs-consent otherwise).
  const own = async (deps: ConsentDeps): Promise<boolean> =>
    mayReachForOwner(ownerUserId, call.contact.phone, 'call', isOwnVerifiedPhone, deps);
  const refused = await consentBlocks(call.contact.phone, 'call', own);
  if (refused || (await isCallOptedOut(call.contact.phone))) {
    return { success: false, error: 'Recipient asked not to be called' };
  }
  const fallback = isCallRetryAsksFirst() ? calleeHoursGuard : safeWindowGuard;
  const guard = deps.isAllowedCallTime ?? fallback;
  if (!(await guard(recipientOf(call), deps.now?.() ?? new Date()))) {
    return { success: false, error: 'Outside calling hours' };
  }
  try {
    const { getOnBehalfCallOrchestrator } = await import('./on-behalf-call-orchestrator.js');
    // The words travel in the payload the job just verified: read there, not from the parse.
    await getOnBehalfCallOrchestrator().initiateCall(
      requestKeepingContext(call, callPreferencesOf(raw))
    );
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
