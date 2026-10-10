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
 * @module services/outreach/call-retry
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  onBehalfDispatchFor,
  onBehalfRequestFromDispatch,
  parseOnBehalfDispatch,
  signOnBehalfDispatch,
  verifyOnBehalfDispatch,
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

/** The 10-digit North American number, or null for anything else. */
function nanpNumber(phone: string | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits.length === 10 ? digits : null;
}

/**
 * The default guard: 10:00-18:00 local in every continental zone, for a North
 * American number in those zones. Anything else is refused.
 */
export const safeWindowGuard: CallTimeGuard = (recipient, at) => {
  const nanp = nanpNumber(recipient.phone);
  if (!nanp || OUTSIDE_SAFE_ZONES.has(nanp.slice(0, 3))) return false;
  return SAFE_ZONES.every((zone) => {
    const [, , , hour, minute] = zoneParts(at, zone);
    const minutes = hour * 60 + minute;
    return minutes >= OPEN_MINUTE && minutes < CLOSE_MINUTE;
  });
};

function recipientOf(call: OnBehalfDispatch): CallRecipient {
  return { name: call.contact.name, phone: call.contact.phone };
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

function optOutKey(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 7 ? digits : null;
}

/** Record that the person at this number asked not to be called again. */
export async function recordCallOptOut(
  phone: string,
  context: { callId: string; requesterUserId: string }
): Promise<boolean> {
  const key = optOutKey(phone);
  const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
  const db = getFirestoreDb();
  if (!key || !db) return false;
  await db
    .collection('call_opt_outs')
    .doc(key)
    .set({ phone: key, optedOutAt: new Date().toISOString(), ...context });
  log.info({ callId: context.callId }, 'Recorded a do-not-call request');
  return true;
}

/** True when the number is on the do-not-call list, or the list can't be read. */
export async function isCallOptedOut(phone: string): Promise<boolean> {
  const key = optOutKey(phone);
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
  const secret = process.env.LIVEKIT_API_SECRET;
  if (call.retryOf || !call.contact.phone || !secret) return null;
  if (await isCallOptedOut(call.contact.phone)) return null;

  const now = deps.now?.() ?? new Date();
  const at = await nextAllowedSlot(call, now, deps.isAllowedCallTime ?? safeWindowGuard);
  if (!at) return null;

  const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
  const db = getFirestoreDb();
  if (!db) return null;
  const request = { ...onBehalfRequestFromDispatch(call), retryOf: call.callId };
  const signed = signOnBehalfDispatch(onBehalfDispatchFor(`retry_${call.callId}`, request), secret);
  const id = `retry_${call.callId}`;
  try {
    await db
      .collection('bogle_users')
      .doc(call.requester.userId)
      .collection('scheduled_outreach')
      .doc(id)
      .create({
        id,
        userId: call.requester.userId,
        personaId: 'ferni',
        status: 'pending',
        // A Date, not an ISO string: the scheduled-outreach job queries scheduledFor as a timestamp.
        scheduledFor: at,
        createdAt: now,
        updatedAt: now,
        retryCount: 0,
        maxRetries: 0,
        target: {
          contact: call.contact.name,
          purpose: call.purpose,
          channel: 'on_behalf_call',
          resolvedContactId: '',
          resolvedContactName: call.contact.name,
          resolvedPhone: call.contact.phone,
          onBehalfDispatch: JSON.parse(JSON.stringify(signed)),
        },
      });
    log.info(
      { callId: call.callId, retryAt: at.toISOString() },
      'Scheduled one retry for a missed call'
    );
    return at;
  } catch (error) {
    log.info(
      { error: String(error), callId: call.callId },
      'Retry not scheduled (already exists or write failed)'
    );
    return null;
  }
}

// Verified dispatches of calls running in this process, by callId (kept a day).
const verifiedCalls = new Map<string, { call: OnBehalfDispatch; at: number }>();
const VERIFIED_CALL_TTL_MS = 24 * 60 * 60 * 1000;

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
  if (!verifyOnBehalfDispatch(raw, process.env.LIVEKIT_API_SECRET)) {
    return { success: false, error: 'Retry is not signed by the server' };
  }
  const call = parseOnBehalfDispatch(signedDispatch as Record<string, unknown>);
  if (!call?.retryOf || !call.contact.phone || call.requester.userId !== ownerUserId) {
    return { success: false, error: 'Not a retry for this user' };
  }
  // Without the SIP trunk the orchestrator falls back to a one-way Twilio call.
  if (!process.env.SIP_TRUNK_ID) {
    return { success: false, error: 'No SIP trunk for a conversational call' };
  }
  if (await isCallOptedOut(call.contact.phone)) {
    return { success: false, error: 'Recipient asked not to be called' };
  }
  const guard = deps.isAllowedCallTime ?? safeWindowGuard;
  if (!(await guard(recipientOf(call), deps.now?.() ?? new Date()))) {
    return { success: false, error: 'Outside calling hours' };
  }
  try {
    const { getOnBehalfCallOrchestrator } = await import('./on-behalf-call-orchestrator.js');
    await getOnBehalfCallOrchestrator().initiateCall(onBehalfRequestFromDispatch(call));
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
