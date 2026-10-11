/**
 * After a call by a friends-and-family cohort member, Ferni texts them one
 * question, so their reactions to a call become data instead of anecdotes.
 *
 * Runs as an after-call task (registered in after-call-checkin-register.ts)
 * only when the agent has COHORT_FLAGS=on and the caller's own cohort flags
 * (read from Firestore) have POST_CALL_CHECKIN=on. Each check-in is written to
 * feature_checkins/{id}; replies to Ferni's number from that phone within
 * REPLY_WINDOW_MS land in feature_checkins/{id}/replies. A reply that opts out
 * writes feature_checkin_optouts/{phoneHash}, and no check-in goes to that
 * phone again. Phones are keyed by an HMAC under LOG_HASH_SECRET; without it,
 * nothing is sent or matched.
 *
 * Firestore, the caller's flags and SMS sending are injected so the logic is
 * testable without a network.
 *
 * @module services/outreach/after-call-checkin
 */
import { createHmac } from 'node:crypto';
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { getFirebaseUser } from '../identity/firebase-auth.js';
import { cohortFlagsEnabled, resolveCallerFlags } from '../platform/cohort-flags.js';
import type { AfterCallContext } from '../session/after-call-tasks.js';
import type { SMSDeliveryResult, SMSMessage } from './delivery/sms-delivery.js';
import { verifiedPhoneOf } from './user-reach.js';

const log = createLogger({ module: 'after-call-checkin' });

export const CHECKIN_QUESTION =
  "It's Ferni. Did that call feel like talking with someone who knows you? Anything feel off? Just reply here, I read every one.";
export const MIN_USER_TURNS = 4;
export const RATE_LIMIT_MS = 20 * 60 * 60 * 1000;
export const REPLY_WINDOW_MS = 72 * 60 * 60 * 1000;
const COLLECTION = 'feature_checkins';
const OPTOUTS = 'feature_checkin_optouts';
const HASH_PURPOSE = 'after-call-checkin/phone/v1';
// Missing a real opt-out keeps texting someone who asked us to stop, so this leans toward
// opting out. Unambiguous words count anywhere; stop/cancel/quit/end count in a short message
// ("please stop", "cancel please"); explicit asks count anywhere. A long reply that merely
// contains "end" ("in the end it felt real") stays a reply.
const OPT_OUT_ANYWHERE =
  /\b(unsubscribe|stopall)\b|\b(stop|quit) (texting|messaging)\b|\b(don'?t|do not) (text|message)\b|\bno more (texts|messages)\b/i;
const OPT_OUT_SHORT = /\b(stop|cancel|quit|end)\b/i;
const SHORT_WORDS = 4;
const MESSAGE_SID = /^[A-Za-z0-9]{10,64}$/;
const ALREADY_EXISTS = 6; // Firestore/gRPC status for create() on an existing doc
const keyword = (body: string): string =>
  body
    .trim()
    .toLowerCase()
    .replace(/[.!\s]+$/, '');

type Env = Record<string, string | undefined>;
export type SkipReason =
  | 'not-member-call'
  | 'short-call'
  | 'recently-sent'
  | 'no-verified-phone'
  | 'no-phone'
  | 'sms-off'
  | 'opted-out';
export type CheckinDecision = { send: true; phone: string } | { send: false; reason: SkipReason };

export interface CheckinRecord {
  userId: string;
  sessionId: string;
  /** ISO time. */
  sentAt: string;
  question: string;
  status: 'sent' | 'failed';
  phoneLast4: string;
  /** phoneHash() of the number, so a reply can be matched without storing the number. */
  phoneHash: string;
}

export interface StoredCheckin extends CheckinRecord {
  id: string;
}

export interface CheckinStore {
  forUser: (userId: string) => Promise<StoredCheckin[]>;
  forPhoneHash: (phoneHash: string) => Promise<StoredCheckin[]>;
  add: (record: CheckinRecord) => Promise<string>;
  /** replyId (Twilio's MessageSid) makes a retried webhook a no-op; without it, an auto id. */
  addReply: (
    checkinId: string,
    replyId: string | undefined,
    reply: { body: string; receivedAt: string }
  ) => Promise<void>;
  sponsoredPhone: (userId: string) => Promise<string | undefined>;
  userDoc: (userId: string) => Promise<Record<string, unknown> | undefined>;
  /** outreach_profiles/{userId}.state.allowedChannels, where the webhook's global STOP lands. */
  legacySmsChannels: (userId: string) => Promise<unknown>;
  isOptedOut: (phoneHash: string) => Promise<boolean>;
  addOptOut: (phoneHash: string, optOut: { at: string; via: 'reply' }) => Promise<void>;
  removeOptOut: (phoneHash: string) => Promise<void>;
}

export interface CheckinDeps {
  env: Env;
  resolveFlags: (userId: string) => Promise<Record<string, string>>;
  store: CheckinStore;
  /** The Firebase Auth phoneNumber, which only phone verification sets. */
  authPhone: (uid: string) => Promise<string | undefined>;
  send: (message: SMSMessage) => Promise<SMSDeliveryResult>;
  now: () => Date;
}

export interface CheckinOutcome {
  sent: boolean;
  reason?: SkipReason | 'gate-off' | 'flag-off' | 'no-hash-secret' | 'send-failed';
}

/** Calls placed on someone's behalf, or with no known person, are not the member's own call. */
export function isMemberCall(userId: string): boolean {
  const id = userId.trim();
  return id !== '' && id !== 'anonymous' && !id.startsWith('onbehalf:') && !id.startsWith('anon:');
}

/** The skip reasons that need no reads: whose call it was and how long it ran. */
export function callerSkipReason(userId: string, userTurns: number): SkipReason | null {
  if (!isMemberCall(userId)) return 'not-member-call';
  if (userTurns < MIN_USER_TURNS) return 'short-call';
  return null;
}

/** Whether to text this person, given everything known about the call. */
export function decideCheckin(input: {
  userId: string;
  userTurns: number;
  lastSentAt: Date | null;
  phone: string | undefined;
  now: Date;
}): CheckinDecision {
  const early = callerSkipReason(input.userId, input.userTurns);
  if (early) return { send: false, reason: early };
  if (sentRecently(input.lastSentAt, input.now)) return { send: false, reason: 'recently-sent' };
  if (!input.phone) return { send: false, reason: 'no-verified-phone' };
  return { send: true, phone: input.phone };
}

const sentRecently = (at: Date | null, now: Date): boolean =>
  at !== null && now.getTime() - at.getTime() < RATE_LIMIT_MS;

/** The most recent check-in actually sent to this person, if any. */
export function lastSentAt(records: readonly CheckinRecord[]): Date | null {
  let latest: number | null = null;
  for (const r of records) {
    const t = Date.parse(r.sentAt);
    if (r.status === 'sent' && !Number.isNaN(t) && (latest === null || t > latest)) latest = t;
  }
  return latest === null ? null : new Date(latest);
}

/**
 * A number known to be the member's: the one their sponsor confirmed, the verified phone on
 * the account (user-reach), else Firebase Auth's. Never profile.contactInfo.phone, which can
 * be overwritten without verification.
 */
export async function resolveCheckinPhone(
  userId: string,
  userDoc: Record<string, unknown> | undefined,
  deps: Pick<CheckinDeps, 'store' | 'authPhone'>
): Promise<string | undefined> {
  let phone: string | undefined;
  if (userId.startsWith('sponsored_')) phone = await deps.store.sponsoredPhone(userId);
  else phone = verifiedPhoneOf(userId, userDoc);
  // A phone: id that isn't E.164 is not a Firebase uid; don't look it up (and log it) as one.
  if (!phone && !userId.startsWith('sponsored_') && !userId.startsWith('phone:')) {
    phone = await deps.authPhone(userId);
  }
  const trimmed = phone?.trim();
  return trimmed ? trimmed : undefined;
}

/** Digits only, with a US country code added to a bare 10-digit number. Null if too short. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `1${digits}`;
  return digits.length >= 11 ? digits : null;
}

let warnedNoSecret = false;

/** This purpose's own key, derived from LOG_HASH_SECRET. Null, with one warning, without it. */
function phoneHashKey(env: Env): Buffer | null {
  const secret = env.LOG_HASH_SECRET;
  if (secret) return createHmac('sha256', secret).update(HASH_PURPOSE).digest();
  if (!warnedNoSecret) log.warn('LOG_HASH_SECRET is not set, so check-in texts are off');
  warnedNoSecret = true;
  return null;
}

/** HMAC of the E.164 number. Unkeyed, a ~10^10 number space is brute-forced in minutes. */
export function phoneHash(raw: string, env: Env = process.env): string | null {
  const n = normalizePhone(raw);
  const key = n ? phoneHashKey(env) : null;
  return n && key ? createHmac('sha256', key).update(`+${n}`).digest('hex') : null;
}

/** Whole-word, case-insensitive, so "unstoppable" is not an opt-out. iOS sends curly quotes. */
export const isOptOut = (raw: string): boolean => {
  const body = raw.replace(/[\u2018\u2019]/g, "'");
  return (
    OPT_OUT_ANYWHERE.test(body) ||
    (keyword(body).split(/\s+/).length <= SHORT_WORDS && OPT_OUT_SHORT.test(body))
  );
};

/** The member explicitly turned texts off, in outreach settings or by a STOP to the webhook. */
export function smsTurnedOff(
  userDoc: Record<string, unknown> | undefined,
  legacyChannels: unknown
): boolean {
  const prefs = (userDoc?.outreachPreferences ?? {}) as { enabled?: unknown; channels?: unknown };
  const withoutSms = (c: unknown): boolean => Array.isArray(c) && !c.includes('sms');
  return prefs.enabled === false || withoutSms(prefs.channels) || withoutSms(legacyChannels);
}
/** START undoes an opt-out, as the webhook's own reply to STOP promises. */
export const isOptIn = (body: string): boolean => keyword(body) === 'start';

const last4 = (phone: string): string => phone.replace(/\D/g, '').slice(-4);
/** Twilio errors can quote the number (21211: "The 'To' number +1555... is not valid"). */
export const redactNumbers = (text?: string): string | undefined =>
  text?.replace(/\+?\d[\d ().-]{5,}\d/g, '[number]');

/**
 * The userId to store, query by and hand to SMS delivery. A `phone:` id is
 * the caller's number, so it is replaced by the hash; sms-delivery logs userId.
 */
export function recordUserId(userId: string, env: Env = process.env): string {
  if (!userId.startsWith('phone:')) return userId;
  return `phone#${phoneHash(userId.slice('phone:'.length), env) ?? 'invalid'}`;
}

/** The after-call task. Never reads POST_CALL_CHECKIN from process.env. */
export async function runAfterCallCheckin(
  ctx: AfterCallContext,
  deps: CheckinDeps = defaultDeps()
): Promise<CheckinOutcome> {
  if (!cohortFlagsEnabled(deps.env)) return { sent: false, reason: 'gate-off' };
  const userTurns = ctx.turns.filter((t) => t.role === 'user').length;
  const early = callerSkipReason(ctx.userId, userTurns);
  if (early) return { sent: false, reason: early };

  // Read the flag from Firestore, not process.env: by now the next call may have replaced env with another caller's flags.
  const flags = await deps.resolveFlags(ctx.userId);
  if (flags.POST_CALL_CHECKIN !== 'on') return { sent: false, reason: 'flag-off' };
  if (!phoneHashKey(deps.env)) return { sent: false, reason: 'no-hash-secret' };

  const storedId = recordUserId(ctx.userId, deps.env);
  const sponsored = ctx.userId.startsWith('sponsored_');
  const [records, userDoc, legacyChannels] = await Promise.all([
    deps.store.forUser(storedId),
    sponsored ? undefined : deps.store.userDoc(ctx.userId),
    deps.store.legacySmsChannels(ctx.userId),
  ]);
  const phone = await resolveCheckinPhone(ctx.userId, userDoc, deps);
  const now = deps.now();
  const decision = decideCheckin({
    userId: ctx.userId,
    userTurns,
    lastSentAt: lastSentAt(records),
    phone,
    now,
  });
  const logCtx = { userId: storedId.slice(0, 8), sessionId: ctx.sessionId };
  const skip = (reason: SkipReason): CheckinOutcome => {
    log.info({ ...logCtx, reason }, 'Check-in text skipped');
    return { sent: false, reason };
  };
  if (!decision.send) return skip(decision.reason);
  if (smsTurnedOff(userDoc, legacyChannels)) return skip('sms-off');

  const hash = phoneHash(decision.phone, deps.env);
  const phoneLast4 = last4(decision.phone);
  if (!hash) return skip('no-phone');
  if (await deps.store.isOptedOut(hash)) return skip('opted-out');
  const result = await deps.send({
    to: decision.phone,
    body: CHECKIN_QUESTION,
    personaId: 'ferni',
    userId: storedId,
    outreachId: `checkin_${ctx.sessionId}`,
  });
  await deps.store.add({
    userId: storedId,
    sessionId: ctx.sessionId,
    sentAt: now.toISOString(),
    question: CHECKIN_QUESTION,
    status: result.success ? 'sent' : 'failed',
    phoneLast4,
    phoneHash: hash,
  });
  if (!result.success) {
    const error = redactNumbers(result.error);
    log.warn({ ...logCtx, phoneLast4, error }, 'Check-in text not sent');
    return { sent: false, reason: 'send-failed' };
  }
  log.info({ ...logCtx, phoneLast4 }, 'Check-in text sent');
  return { sent: true };
}

/** The check-in a reply belongs to: the latest one sent to that phone within REPLY_WINDOW_MS. */
export function matchCheckin(records: readonly StoredCheckin[], now: Date): StoredCheckin | null {
  let best: StoredCheckin | null = null;
  for (const r of records) {
    const t = Date.parse(r.sentAt);
    if (r.status !== 'sent' || Number.isNaN(t) || now.getTime() - t > REPLY_WINDOW_MS) continue;
    if (!best || t > Date.parse(best.sentAt)) best = r;
  }
  return best;
}

/**
 * Inbound SMS hook: if the sender got a check-in in the last 72 hours, keeps
 * their reply under it, and records an opt-out if it is one. Returns the
 * check-in id, or null. Never throws, so the caller's own handling of the
 * message is unaffected.
 */
export async function recordCheckinReply(
  from: unknown,
  body: unknown,
  messageSid: unknown,
  deps: Pick<CheckinDeps, 'store' | 'now' | 'env'> = {
    store: firestoreCheckinStore,
    now: () => new Date(),
    env: process.env,
  }
): Promise<string | null> {
  if (typeof from !== 'string' || typeof body !== 'string') return null;
  const hash = phoneHash(from, deps.env);
  if (!hash) return null;
  const now = deps.now();
  await recordOptChoice(deps.store, hash, body, now, last4(from));
  const replyId =
    typeof messageSid === 'string' && MESSAGE_SID.test(messageSid) ? messageSid : undefined;
  try {
    const match = matchCheckin(await deps.store.forPhoneHash(hash), now);
    if (!match) return null;
    await deps.store.addReply(match.id, replyId, { body, receivedAt: now.toISOString() });
    log.info({ checkinId: match.id, phoneLast4: last4(from) }, 'Check-in reply recorded');
    return match.id;
  } catch (error) {
    log.warn({ error: String(error), phoneLast4: last4(from) }, 'Check-in reply not recorded');
    return null;
  }
}

/**
 * Any STOP or START to our number sets or clears the opt-out first, whether or not it
 * answers a recent check-in, and on its own try so a failed reply write can't skip it.
 */
async function recordOptChoice(
  store: CheckinStore,
  hash: string,
  body: string,
  now: Date,
  phoneLast4: string
): Promise<void> {
  const optOut = isOptOut(body);
  if (!optOut && !isOptIn(body)) return;
  try {
    if (optOut) await store.addOptOut(hash, { at: now.toISOString(), via: 'reply' });
    else await store.removeOptOut(hash);
    log.info({ phoneLast4, optOut }, 'Check-in opt-out updated');
  } catch (error) {
    log.error({ error: String(error), phoneLast4, optOut }, 'Check-in opt-out not saved');
  }
}

function db(): NonNullable<ReturnType<typeof getFirestoreDb>> {
  const d = getFirestoreDb();
  // Without the store there is no rate limit, so fail rather than text unrecorded.
  if (!d) throw new Error('Firestore unavailable');
  return d;
}

function toStored(id: string, data: Record<string, unknown>): StoredCheckin {
  return { ...(data as unknown as CheckinRecord), id };
}

export const firestoreCheckinStore: CheckinStore = {
  async forUser(userId) {
    // userId equality only; the 20 h window is filtered in memory to avoid a composite index.
    const snap = await db().collection(COLLECTION).where('userId', '==', userId).get();
    return snap.docs.map((d) => toStored(d.id, d.data()));
  },
  async forPhoneHash(hash) {
    const snap = await db().collection(COLLECTION).where('phoneHash', '==', hash).get();
    return snap.docs.map((d) => toStored(d.id, d.data()));
  },
  async add(record) {
    return (await db().collection(COLLECTION).add(record)).id;
  },
  async addReply(checkinId, replyId, reply) {
    const replies = db().collection(COLLECTION).doc(checkinId).collection('replies');
    if (!replyId) {
      await replies.add(reply);
      return;
    }
    try {
      await replies.doc(replyId).create(reply);
    } catch (error) {
      if ((error as { code?: unknown }).code !== ALREADY_EXISTS) throw error;
    }
  },
  async userDoc(userId) {
    const doc = await db().collection('bogle_users').doc(userId).get();
    return doc.exists ? (doc.data() as Record<string, unknown>) : undefined;
  },
  async legacySmsChannels(userId) {
    const doc = await db().collection('outreach_profiles').doc(userId).get();
    const state = (doc.exists ? doc.data()?.state : undefined) as
      { allowedChannels?: unknown } | undefined;
    return state?.allowedChannels;
  },
  async sponsoredPhone(userId) {
    const doc = await db().collection('sponsored_identities').doc(userId).get();
    const phone: unknown = doc.exists ? doc.data()?.phoneNumber : undefined;
    return typeof phone === 'string' ? phone : undefined;
  },
  async isOptedOut(hash) {
    return (await db().collection(OPTOUTS).doc(hash).get()).exists;
  },
  async addOptOut(hash, optOut) {
    await db().collection(OPTOUTS).doc(hash).set(optOut);
  },
  async removeOptOut(hash) {
    await db().collection(OPTOUTS).doc(hash).delete();
  },
};

/** sendSMS reports "not initialized" until delivery is set up, which the voice agent never does itself. */
async function sendCheckinSms(message: SMSMessage): Promise<SMSDeliveryResult> {
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
      log.warn({ error: String(error) }, 'SMS delivery could not be set up for check-ins');
    }
  }
  return sms.sendSMS(message);
}

function defaultDeps(): CheckinDeps {
  return {
    env: process.env,
    resolveFlags: async (userId) => resolveCallerFlags(userId),
    store: firestoreCheckinStore,
    authPhone: async (uid) => (await getFirebaseUser(uid))?.phoneNumber ?? undefined,
    send: sendCheckinSms,
    now: () => new Date(),
  };
}
