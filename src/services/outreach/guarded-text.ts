/**
 * One way for Ferni to text a member, with every guard in one place.
 *
 * About 15 places in the codebase send texts and only one honoured a STOP
 * (register, 2026-10-12). This is that one's guards, lifted out of the
 * after-call check-in so reminders and follow-ups use the same path:
 *
 * - only a number known to be theirs (sponsor-confirmed, verified on the
 *   account, or Firebase Auth's), never an unverified profile phone;
 * - never when they turned texts off in settings or sent STOP;
 * - never twice within `minGapMs` of the same kind of text, per person and
 *   per phone (two accounts can share a number);
 * - the number is stored only as a salted hash plus its last four digits,
 *   and Twilio errors are logged with numbers redacted.
 *
 * Every send is written to feature_checkins with its kind and the thing it
 * was about (`refId`), so a reply can be matched back to it.
 *
 * @module services/outreach/guarded-text
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getFirebaseUser } from '../identity/firebase-auth.js';
import {
  CHECKINS,
  checkinDb,
  firestoreReplyStore,
  last4,
  phoneHash,
  phoneHashKey,
  toE164,
  toStoredCheckin,
  type CheckinRecord,
  type Env,
  type ReplyStore,
  type StoredCheckin,
  type TextKind,
} from './checkin-replies.js';
import type { SMSDeliveryResult, SMSMessage } from './delivery/sms-delivery.js';
import { verifiedPhoneOf } from './user-reach.js';
import { userTimeZone } from '../../utils/caller-time-zone.js';
import { isValidTimeZone } from '../../utils/time-zone.js';
import { isQuietHour } from '../follow-through/index.js';

const log = createLogger({ module: 'guarded-text' });

export interface TextStore extends Pick<ReplyStore, 'forPhoneHash' | 'isOptedOut'> {
  forUser: (userId: string) => Promise<StoredCheckin[]>;
  add: (record: CheckinRecord) => Promise<string>;
  sponsoredPhone: (userId: string) => Promise<string | undefined>;
  userDoc: (userId: string) => Promise<Record<string, unknown> | undefined>;
  /** outreach_profiles/{userId}.state.allowedChannels, where the webhook's global STOP lands. */
  legacySmsChannels: (userId: string) => Promise<unknown>;
}

export interface TextDeps {
  env: Env;
  store: TextStore;
  /** The Firebase Auth phoneNumber, which only phone verification sets. */
  authPhone: (uid: string) => Promise<string | undefined>;
  send: (message: SMSMessage) => Promise<SMSDeliveryResult>;
  now: () => Date;
}

export interface GuardedText {
  readonly userId: string;
  readonly body: string;
  readonly kind: TextKind;
  /** What it is about (a session id, a follow-up id), stored with the record. */
  readonly refId: string;
  /** No second text of this kind to this person or phone within this many ms. */
  readonly minGapMs: number;
}

export type TextSkip =
  | 'no-hash-secret'
  | 'no-verified-phone'
  | 'recently-sent'
  | 'sms-off'
  | 'opted-out'
  | 'send-failed';
export type TextOutcome = { sent: true } | { sent: false; reason: TextSkip };

/** The most recent text of `kind` actually sent, if any. Records from before kinds existed are check-ins. */
export function lastSentAt(
  records: readonly CheckinRecord[],
  kind: TextKind = 'checkin'
): Date | null {
  let latest: number | null = null;
  for (const r of records) {
    const t = Date.parse(r.sentAt);
    if ((r.kind ?? 'checkin') !== kind || r.status !== 'sent' || Number.isNaN(t)) continue;
    if (latest === null || t > latest) latest = t;
  }
  return latest === null ? null : new Date(latest);
}

const sentWithin = (at: Date | null, now: Date, gapMs: number): boolean =>
  at !== null && now.getTime() - at.getTime() < gapMs;

/**
 * A number known to be the member's, as E.164 (toE164, the same normalizer the reply side
 * hashes with): the one their sponsor confirmed, the verified phone on the account
 * (user-reach), else Firebase Auth's. Never profile.contactInfo.phone, which can be
 * overwritten without verification.
 */
export async function resolveCheckinPhone(
  userId: string,
  userDoc: Record<string, unknown> | undefined,
  deps: Pick<TextDeps, 'store' | 'authPhone'>
): Promise<string | undefined> {
  let phone: string | undefined;
  if (userId.startsWith('sponsored_')) phone = await deps.store.sponsoredPhone(userId);
  else phone = verifiedPhoneOf(userId, userDoc);
  // A phone: id that isn't E.164 is not a Firebase uid; don't look it up (and log it) as one.
  if (!phone && !userId.startsWith('sponsored_') && !userId.startsWith('phone:')) {
    phone = await deps.authPhone(userId);
  }
  return phone === undefined ? undefined : (toE164(phone) ?? undefined);
}

/** The member explicitly turned texts off, in outreach settings or by a STOP to the webhook. */
export function smsTurnedOff(
  userDoc: Record<string, unknown> | undefined,
  legacyChannels: unknown
): boolean {
  const prefs = (userDoc?.outreachPreferences ?? {}) as { enabled?: unknown; channels?: unknown };
  const withoutSms = (c: unknown): boolean => Array.isArray(c) && !c.includes('sms');
  return prefs.enabled === false || withoutSms(prefs.channels) || withoutSms(legacyChannels);
}

/** Twilio errors can quote the number (21211: "The 'To' number +1555... is not valid"). */
export const redactNumbers = (text?: string): string | undefined =>
  text?.replace(/\+?\d[\d ().-]{5,}\d/g, '[number]');

/**
 * The userId to store, query by and hand to SMS delivery. A `phone:` id is the caller's
 * number, so it is replaced by its hash (sms-delivery logs userId). Null for a `phone:` id
 * that isn't a usable number, so malformed ids never share one record bucket.
 */
export function recordUserId(userId: string, env: Env = process.env): string | null {
  if (!userId.startsWith('phone:')) return userId;
  const hash = phoneHash(userId.slice('phone:'.length), env);
  return hash ? `phone#${hash}` : null;
}

/** Sends `t` if every guard allows it, and records the attempt. Never throws for a skip. */
export async function sendGuardedText(
  t: GuardedText,
  deps: TextDeps = defaultTextDeps()
): Promise<TextOutcome> {
  const logCtx = { kind: t.kind, refId: t.refId };
  const skip = (reason: TextSkip): TextOutcome => {
    log.info({ ...logCtx, reason }, 'Text skipped');
    return { sent: false, reason };
  };
  if (!phoneHashKey(deps.env)) return skip('no-hash-secret');
  const storedId = recordUserId(t.userId, deps.env);
  if (!storedId) return skip('no-verified-phone');

  const sponsored = t.userId.startsWith('sponsored_');
  const [records, userDoc, legacyChannels] = await Promise.all([
    deps.store.forUser(storedId),
    sponsored ? undefined : deps.store.userDoc(t.userId),
    deps.store.legacySmsChannels(t.userId),
  ]);
  const now = deps.now();
  if (sentWithin(lastSentAt(records, t.kind), now, t.minGapMs)) return skip('recently-sent');
  const phone = await resolveCheckinPhone(t.userId, userDoc, deps);
  if (!phone) return skip('no-verified-phone');
  if (smsTurnedOff(userDoc, legacyChannels)) return skip('sms-off');

  const hash = phoneHash(phone, deps.env);
  if (!hash) return skip('no-verified-phone');
  const [optedOut, toPhone] = await Promise.all([
    deps.store.isOptedOut(hash),
    deps.store.forPhoneHash(hash),
  ]);
  if (optedOut) return skip('opted-out');
  // Per phone too: two accounts can share a number.
  if (sentWithin(lastSentAt(toPhone, t.kind), now, t.minGapMs)) return skip('recently-sent');

  const phoneLast4 = last4(phone);
  const result = await deps.send({
    to: phone,
    body: t.body,
    personaId: 'ferni',
    userId: storedId,
    outreachId: `${t.kind}_${t.refId}`,
  });
  await deps.store.add({
    userId: storedId,
    sessionId: t.refId,
    sentAt: now.toISOString(),
    question: t.body,
    status: result.success ? 'sent' : 'failed',
    phoneLast4,
    phoneHash: hash,
    kind: t.kind,
    refId: t.refId,
  });
  if (!result.success) {
    log.warn({ ...logCtx, phoneLast4, error: redactNumbers(result.error) }, 'Text not sent');
    return { sent: false, reason: 'send-failed' };
  }
  log.info({ ...logCtx, phoneLast4 }, 'Text sent');
  return { sent: true };
}

// ---------------------------------------------------------------------------
// Texts a member asks Ferni to send to someone else
// ---------------------------------------------------------------------------

export function onBehalfTextsOn(env: Env = process.env): boolean {
  return env.ON_BEHALF_TEXTS === 'on';
}

/** No more than one text to the same person every 10 minutes: a loop can't spam them. */
export const ON_BEHALF_GAP_MS = 10 * 60 * 1000;

export interface OnBehalfText {
  /** The member it is sent for. */
  readonly senderUserId: string;
  readonly toPhone: string;
  readonly body: string;
  /** What it is about (the outreach id), stored with the record. */
  readonly refId: string;
  /** The recipient's IANA zone when known; else the member's. */
  readonly zone?: string;
}

export type OnBehalfSkip =
  | 'flag-off'
  | 'no-hash-secret'
  | 'bad-number'
  | 'opted-out'
  | 'recently-sent'
  | 'quiet-hours'
  | 'send-failed';
export type OnBehalfOutcome = { sent: true } | { sent: false; reason: OnBehalfSkip };

/** Quiet hours (21:00 to 08:00, follow-through's) in their zone, else the member's; none when unknown. */
function quietFor(now: Date, zone: string | undefined): boolean {
  return zone !== undefined && isValidTimeZone(zone) && isQuietHour(now, zone);
}

/**
 * Sends a text to someone else for a member (the caller has already said yes,
 * outreach-confirm.ts): only to a valid number, never after that number sent
 * STOP (any STOP to our number is recorded, checkin-replies.ts), not twice in
 * ten minutes, not in their quiet hours. Off unless ON_BEHALF_TEXTS=on.
 */
export async function sendOnBehalfText(
  t: OnBehalfText,
  deps: TextDeps = defaultTextDeps()
): Promise<OnBehalfOutcome> {
  const skip = (reason: OnBehalfSkip): OnBehalfOutcome => {
    log.info({ kind: 'on-behalf', refId: t.refId, reason }, 'Text skipped');
    return { sent: false, reason };
  };
  if (!onBehalfTextsOn(deps.env)) return skip('flag-off');
  if (!phoneHashKey(deps.env)) return skip('no-hash-secret');
  const to = toE164(t.toPhone);
  const hash = to ? phoneHash(to, deps.env) : null;
  if (!to || !hash) return skip('bad-number');
  const now = deps.now();
  if (quietFor(now, t.zone ?? userTimeZone({ userId: t.senderUserId }))) return skip('quiet-hours');
  const [optedOut, toPhone] = await Promise.all([
    deps.store.isOptedOut(hash),
    deps.store.forPhoneHash(hash),
  ]);
  if (optedOut) return skip('opted-out');
  if (sentWithin(lastSentAt(toPhone, 'on-behalf'), now, ON_BEHALF_GAP_MS))
    return skip('recently-sent');

  const storedId = recordUserId(t.senderUserId, deps.env) ?? 'unknown';
  const result = await deps.send({
    to,
    body: t.body,
    personaId: 'ferni',
    userId: storedId,
    outreachId: t.refId,
  });
  await deps.store.add({
    userId: storedId,
    sessionId: t.refId,
    sentAt: now.toISOString(),
    question: t.body,
    status: result.success ? 'sent' : 'failed',
    phoneLast4: last4(to),
    phoneHash: hash,
    kind: 'on-behalf',
    refId: t.refId,
  });
  if (!result.success) {
    log.warn(
      { kind: 'on-behalf', refId: t.refId, error: redactNumbers(result.error) },
      'Text not sent'
    );
    return { sent: false, reason: 'send-failed' };
  }
  return { sent: true };
}

export const firestoreTextStore: TextStore = {
  ...firestoreReplyStore,
  async forUser(userId) {
    // userId equality only; the gap window is filtered in memory to avoid a composite index.
    const snap = await checkinDb().collection(CHECKINS).where('userId', '==', userId).get();
    return snap.docs.map((d) => toStoredCheckin(d.id, d.data()));
  },
  async add(record) {
    return (await checkinDb().collection(CHECKINS).add(record)).id;
  },
  async userDoc(userId) {
    const doc = await checkinDb().collection('bogle_users').doc(userId).get();
    return doc.exists ? (doc.data() as Record<string, unknown>) : undefined;
  },
  async legacySmsChannels(userId) {
    const doc = await checkinDb().collection('outreach_profiles').doc(userId).get();
    const state = (doc.exists ? doc.data()?.state : undefined) as
      { allowedChannels?: unknown } | undefined;
    return state?.allowedChannels;
  },
  async sponsoredPhone(userId) {
    const doc = await checkinDb().collection('sponsored_identities').doc(userId).get();
    const phone: unknown = doc.exists ? doc.data()?.phoneNumber : undefined;
    return typeof phone === 'string' ? phone : undefined;
  },
};

/** sendSMS reports "not initialized" until delivery is set up, which the voice agent never does itself. */
async function sendSms(message: SMSMessage): Promise<SMSDeliveryResult> {
  const sms = await import('./delivery/sms-delivery.js');
  const {
    TWILIO_ACCOUNT_SID: sid,
    TWILIO_AUTH_TOKEN: token,
    TWILIO_PHONE_NUMBER: from,
  } = process.env;
  if (!sms.isSMSDeliveryAvailable() && sid && token && from) {
    try {
      sms.initializeSMSDelivery({
        twilioAccountSid: sid,
        twilioAuthToken: token,
        twilioPhoneNumber: from,
      });
    } catch (error) {
      log.warn({ error: String(error) }, 'SMS delivery could not be set up');
    }
  }
  return sms.sendSMS(message);
}

export function defaultTextDeps(): TextDeps {
  return {
    env: process.env,
    store: firestoreTextStore,
    authPhone: async (uid) => (await getFirebaseUser(uid))?.phoneNumber ?? undefined,
    send: sendSms,
    now: () => new Date(),
  };
}
