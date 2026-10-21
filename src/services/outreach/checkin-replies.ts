/**
 * The reply side of Ferni's post-call check-in texts: every inbound SMS to
 * Ferni's number passes through recordCheckinReply.
 *
 * - A STOP-like message from any number writes feature_checkin_optouts/{phoneHash},
 *   and START removes it, whether or not a check-in was ever sent. So opt-outs
 *   are on record before the first check-in goes out.
 * - A reply within REPLY_WINDOW_MS of a check-in to that phone is kept at
 *   feature_checkins/{id}/replies/{MessageSid}.
 *
 * Phones are stored only as an HMAC of their E.164 form, keyed from
 * LOG_HASH_SECRET. Without the secret nothing is hashed, so nothing is
 * matched or recorded.
 *
 * @module services/outreach/checkin-replies
 */
import { createHmac } from 'node:crypto';
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'checkin-replies' });

export const REPLY_WINDOW_MS = 72 * 60 * 60 * 1000;
export const CHECKINS = 'feature_checkins';
export const OPTOUTS = 'feature_checkin_optouts';
const HASH_PURPOSE = 'after-call-checkin/phone/v1';
/** As in user-reach.ts. */
const E164 = /^\+[1-9]\d{7,14}$/;
// Missing a real opt-out keeps texting someone who asked us to stop, so this leans toward
// opting out. Unambiguous words count anywhere; stop/cancel/quit/end count in a short message
// ("please stop", "cancel please"); explicit asks count anywhere. A long reply that merely
// contains "end" ("in the end it felt real") stays a reply.
const OPT_OUT_ANYWHERE =
  /\b(unsubscribe|stopall)\b|\b(stop|quit) (texting|messaging)\b|\b(don'?t|do not) (text|message)\b|\bno more (texts|messages)\b/i;
const OPT_OUT_SHORT = /\b(stop|cancel|quit|end)\b/i;
const SHORT_WORDS = 4;
const MESSAGE_SID = /^[A-Za-z0-9]{10,64}$/;
export const ALREADY_EXISTS = 6; // Firestore/gRPC status for create() on an existing doc
const keyword = (body: string): string =>
  body
    .trim()
    .toLowerCase()
    .replace(/[.!\s]+$/, '');

export type Env = Record<string, string | undefined>;

/** What a text was: the after-call check-in, a follow-up (commitment, thread), a reminder the user set, a text the member got right away ("text me that"), or one sent for a member to someone else. */
export type TextKind =
  | 'checkin'
  | 'follow-up'
  | 'reminder'
  | 'message'
  | 'on-behalf'
  | 'morning-brief'
  | 'call-result'
  | 'opt-in';

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
  /** Absent on records from before follow-up texts: those are check-ins. */
  kind?: TextKind;
  /** What the text was about (a session id, a follow-up id). */
  refId?: string;
}

export interface StoredCheckin extends CheckinRecord {
  id: string;
}

export interface ReplyStore {
  forPhoneHash: (phoneHash: string) => Promise<StoredCheckin[]>;
  /** replyId (Twilio's MessageSid) makes a retried webhook a no-op; without it, an auto id. */
  addReply: (
    checkinId: string,
    replyId: string | undefined,
    reply: { body: string; receivedAt: string }
  ) => Promise<void>;
  isOptedOut: (phoneHash: string) => Promise<boolean>;
  addOptOut: (phoneHash: string, optOut: { at: string; via: 'reply' }) => Promise<void>;
  removeOptOut: (phoneHash: string) => Promise<void>;
}

export interface ReplyDeps {
  store: ReplyStore;
  now: () => Date;
  env: Env;
}

/**
 * The one normalizer for any phone that is hashed, compared or texted. A leading + is kept as
 * is, so a 10-digit international number is never read as American. Without a +, only a US
 * number (10 digits, or 11 starting with 1) is accepted. Anything else is null, including
 * letters, extensions and 00-prefixed numbers.
 */
export function toE164(raw: string): string | null {
  const compact = raw.trim().replace(/[\s().-]/g, '');
  let e164 = compact;
  if (!compact.startsWith('+')) {
    e164 = /^1?\d{10}$/.test(compact) ? `+${compact.length === 10 ? '1' : ''}${compact}` : '';
  }
  return E164.test(e164) ? e164 : null;
}

let warnedNoSecret = false;

/**
 * This purpose's own key, derived from LOG_HASH_SECRET. Null, with one warning, without it.
 *
 * Every phone-keyed opt-out (feature_checkin_optouts, consent/{phoneHash}) is
 * stored under this hash. Rotating LOG_HASH_SECRET changes every hash, so every
 * STOP on record stops matching and everyone who opted out is texted again.
 * Rotation needs a re-key migration first (re-hash each stored doc under the
 * new key; consent docs carry keyVersion to find stale ones).
 */
export function phoneHashKey(env: Env): Buffer | null {
  const secret = env.LOG_HASH_SECRET;
  if (secret) return createHmac('sha256', secret).update(HASH_PURPOSE).digest();
  if (!warnedNoSecret) log.warn('LOG_HASH_SECRET is not set, so check-in phones are not hashed');
  warnedNoSecret = true;
  return null;
}

/** Which key hashed a phone: the purpose plus a short fingerprint of the derived key (not reversible). */
export function phoneHashKeyVersion(env: Env = process.env): string | null {
  const key = phoneHashKey(env);
  return key
    ? `${HASH_PURPOSE}:${createHmac('sha256', key).update('key-version').digest('hex').slice(0, 8)}`
    : null;
}

/** HMAC of toE164(raw). Unkeyed, a ~10^10 number space is brute-forced in minutes. */
export function phoneHash(raw: string, env: Env = process.env): string | null {
  const e164 = toE164(raw);
  const key = e164 ? phoneHashKey(env) : null;
  return e164 && key ? createHmac('sha256', key).update(e164).digest('hex') : null;
}

/** Whole-word, case-insensitive, so "unstoppable" is not an opt-out. iOS sends curly quotes. */
export const isOptOut = (raw: string): boolean => {
  const body = raw.replace(/[\u2018\u2019]/g, "'");
  return (
    OPT_OUT_ANYWHERE.test(body) ||
    (keyword(body).split(/\s+/).length <= SHORT_WORDS && OPT_OUT_SHORT.test(body))
  );
};

/** START undoes an opt-out, as the webhook's own reply to STOP promises. */
export const isOptIn = (body: string): boolean => keyword(body) === 'start';

export const last4 = (phone: string): string => phone.replace(/\D/g, '').slice(-4);

/** The check-in a reply belongs to: the latest one sent to that phone within REPLY_WINDOW_MS. */
export function matchCheckin(records: readonly StoredCheckin[], now: Date): StoredCheckin | null {
  let best: StoredCheckin | null = null;
  for (const r of records) {
    const t = Date.parse(r.sentAt);
    // A reply to a text sent for a member comes from their contact: not feedback, not kept.
    if (r.kind === 'on-behalf' || r.status !== 'sent' || Number.isNaN(t)) continue;
    if (now.getTime() - t > REPLY_WINDOW_MS) continue;
    if (!best || t > Date.parse(best.sentAt)) best = r;
  }
  return best;
}

/**
 * Inbound SMS hook: records an opt-out or opt-in, then, if the sender got a
 * check-in in the last 72 hours, keeps their reply under it. Returns the
 * check-in id, or null. Never throws, so the caller's own handling of the
 * message is unaffected.
 */
export async function recordCheckinReply(
  from: unknown,
  body: unknown,
  messageSid: unknown,
  deps: ReplyDeps = { store: firestoreReplyStore, now: () => new Date(), env: process.env }
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
  store: ReplyStore,
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

/** Throws without Firestore: an unrecorded opt-out or check-in must not pass for a saved one. */
export function checkinDb(): NonNullable<ReturnType<typeof getFirestoreDb>> {
  const d = getFirestoreDb();
  if (!d) throw new Error('Firestore unavailable');
  return d;
}

export function toStoredCheckin(id: string, data: Record<string, unknown>): StoredCheckin {
  return { ...(data as unknown as CheckinRecord), id };
}

export const firestoreReplyStore: ReplyStore = {
  async forPhoneHash(hash) {
    const snap = await checkinDb().collection(CHECKINS).where('phoneHash', '==', hash).get();
    return snap.docs.map((d) => toStoredCheckin(d.id, d.data()));
  },
  async addReply(checkinId, replyId, reply) {
    const replies = checkinDb().collection(CHECKINS).doc(checkinId).collection('replies');
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
  async isOptedOut(hash) {
    return (await checkinDb().collection(OPTOUTS).doc(hash).get()).exists;
  },
  async addOptOut(hash, optOut) {
    await checkinDb().collection(OPTOUTS).doc(hash).set(optOut);
  },
  async removeOptOut(hash) {
    await checkinDb().collection(OPTOUTS).doc(hash).delete();
  },
};
