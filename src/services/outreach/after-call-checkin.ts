/**
 * After a call by a friends-and-family cohort member, Ferni texts them one
 * question, so their reactions to a call become data instead of anecdotes.
 *
 * Runs as an after-call task (registered in after-call-checkin-register.ts)
 * only when the agent has COHORT_FLAGS=on and the caller's own cohort flags
 * (read from Firestore) have POST_CALL_CHECKIN=on. Each check-in is written to
 * feature_checkins/{id}. Replies and opt-outs are handled in checkin-replies.ts;
 * no check-in goes to a phone that opted out.
 *
 * Firestore, the caller's flags, the Firebase Auth lookup and SMS sending are
 * injected so the logic is testable without a network.
 *
 * @module services/outreach/after-call-checkin
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getFirebaseUser } from '../identity/firebase-auth.js';
import { cohortFlagsEnabled, resolveCallerFlags } from '../platform/cohort-flags.js';
import type { AfterCallContext } from '../session/after-call-tasks.js';
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
} from './checkin-replies.js';
import type { SMSDeliveryResult, SMSMessage } from './delivery/sms-delivery.js';
import { verifiedPhoneOf } from './user-reach.js';

const log = createLogger({ module: 'after-call-checkin' });

export const CHECKIN_QUESTION =
  "It's Ferni. Did that call feel like talking with someone who knows you? Anything feel off? Just reply here, I read every one.";
export const MIN_USER_TURNS = 4;
export const RATE_LIMIT_MS = 20 * 60 * 60 * 1000;

export type SkipReason =
  | 'not-member-call'
  | 'short-call'
  | 'recently-sent'
  | 'no-verified-phone'
  | 'sms-off'
  | 'opted-out';
export type CheckinDecision = { send: true; phone: string } | { send: false; reason: SkipReason };

export interface CheckinStore extends Pick<ReplyStore, 'forPhoneHash' | 'isOptedOut'> {
  forUser: (userId: string) => Promise<StoredCheckin[]>;
  add: (record: CheckinRecord) => Promise<string>;
  sponsoredPhone: (userId: string) => Promise<string | undefined>;
  userDoc: (userId: string) => Promise<Record<string, unknown> | undefined>;
  /** outreach_profiles/{userId}.state.allowedChannels, where the webhook's global STOP lands. */
  legacySmsChannels: (userId: string) => Promise<unknown>;
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

/** The most recent check-in actually sent, if any. */
export function lastSentAt(records: readonly CheckinRecord[]): Date | null {
  let latest: number | null = null;
  for (const r of records) {
    const t = Date.parse(r.sentAt);
    if (r.status === 'sent' && !Number.isNaN(t) && (latest === null || t > latest)) latest = t;
  }
  return latest === null ? null : new Date(latest);
}

/**
 * A number known to be the member's, as E.164 (toE164, the same normalizer the reply side
 * hashes with): the one their sponsor confirmed, the verified phone on the account
 * (user-reach), else Firebase Auth's. Never profile.contactInfo.phone, which can be
 * overwritten without verification.
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
  if (!storedId) return { sent: false, reason: 'no-verified-phone' };

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
  if (!hash) return skip('no-verified-phone');
  const [optedOut, toPhone] = await Promise.all([
    deps.store.isOptedOut(hash),
    deps.store.forPhoneHash(hash),
  ]);
  if (optedOut) return skip('opted-out');
  // Per phone too: two accounts can share a number.
  if (sentRecently(lastSentAt(toPhone), now)) return skip('recently-sent');
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

export const firestoreCheckinStore: CheckinStore = {
  ...firestoreReplyStore,
  async forUser(userId) {
    // userId equality only; the 20 h window is filtered in memory to avoid a composite index.
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
