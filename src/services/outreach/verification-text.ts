/**
 * Texts a phone-verification code to the number being verified. That number
 * is not verified yet (that's the point), so the guarded sender's
 * verified-phone rule can't apply; the code goes straight to it over the same
 * transport. North American numbers only (call-retry's toE164), against SMS
 * pumping. Everything else is decided in ONE Firestore transaction, in order:
 *
 * 1. the requester's own limits, per user (1 a minute, 5 an hour) and per IP
 *    (10 an hour; IPv6 grouped by /64), refused with a specific answer;
 * 2. the global breaker: alert at 500 codes an hour, refuse at 2000;
 * 3. the attempt is recorded in the user and IP buckets, whatever comes next,
 *    so probing other numbers costs the prober's own budget;
 * 4. the number's side: it sent STOP (the global opt-out every inbound STOP
 *    writes), or it is over its hard limit across all users (1 a minute,
 *    10 an hour, against bombing; a pair's first request in the hour is exempt,
 *    so a stranger spamming a number can't lock its owner out), or over the
 *    (user, number) pair limit (3 an hour). Any of these is 'quiet': answered
 *    exactly like a send, and NO code is stored (a throwaway is generated for
 *    the timing), so nothing confirmable exists for a number we never texted;
 * 5. otherwise every bucket records the send; 20 a day to one number alerts.
 *
 * Confirming is capped per number too (reserveConfirmTry): 5 tries an hour
 * across all users, whether or not a text went out.
 *
 * The code and the full number are never logged: last four digits only.
 *
 * @module services/outreach/verification-text
 */
import { createHmac, randomInt } from 'node:crypto';
import { createLogger } from '../../utils/safe-logger.js';
import { toE164 } from './call-retry.js';
import { checkinDb, last4, OPTOUTS, phoneHash, phoneHashKey, type Env } from './checkin-replies.js';
import type { SMSDeliveryResult, SMSMessage } from './delivery/sms-delivery.js';
import { defaultTextDeps, redactNumbers } from './guarded-text.js';

const log = createLogger({ module: 'verification-text' });
const SENDS = 'verify_code_sends';
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Per bucket: the window it keeps, the least gap, the most in that window. */
export const LIMITS = {
  user: { windowMs: HOUR, gapMs: MIN, max: 5 },
  ip: { windowMs: HOUR, gapMs: 0, max: 10 },
  pair: { windowMs: HOUR, gapMs: MIN, max: 3 },
  phone: { windowMs: HOUR, gapMs: MIN, max: 10 },
  /** Alert only. */
  phoneDay: { windowMs: DAY, gapMs: 0, max: 20 },
  /** Refuses here; alerts from GLOBAL_ALERT. */
  global: { windowMs: HOUR, gapMs: 0, max: 2000 },
} as const;
export const GLOBAL_ALERT = 500;
type Bucket = keyof typeof LIMITS;

export const codeText = (code: string): string =>
  `Your Ferni code is ${code}. It expires in 10 minutes.`;

/** 'quiet': refused for a reason about the number; answer it like a send, send nothing. */
export type CodeRefusal = 'invalid-number' | 'unavailable' | 'too-soon' | 'too-many' | 'quiet';
export type CodeOutcome = { sent: true } | { sent: false; reason: CodeRefusal | 'send-failed' };

/** Reads the buckets and the number's opt-out, decides, and writes `write` back, atomically. */
export type Atomically = <T>(
  keys: string[],
  optOutHash: string,
  decide: (
    recent: Record<string, string[]>,
    optedOut: boolean
  ) => { result: T; write?: Record<string, string[]> }
) => Promise<T>;

export interface CodeTextDeps {
  env: Env;
  atomically: Atomically;
  send: (message: SMSMessage) => Promise<SMSDeliveryResult>;
  now: () => Date;
}

interface TxDoc {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}
interface TxDb {
  collection(name: string): { doc(id: string): unknown };
  runTransaction<T>(
    fn: (tx: {
      get(ref: unknown): Promise<TxDoc>;
      set(ref: unknown, data: Record<string, unknown>): void;
    }) => Promise<T>
  ): Promise<T>;
}

/** Atomically over Firestore: every read (opt-out too) through the transaction, writes in its commit. */
export const firestoreAtomically =
  (db: () => TxDb): Atomically =>
  (keys, optOutHash, decide) =>
    db().runTransaction(async (tx) => {
      const refs = keys.map((k) => db().collection(SENDS).doc(k));
      const [optOut, ...docs] = await Promise.all([
        tx.get(db().collection(OPTOUTS).doc(optOutHash)),
        ...refs.map((ref) => tx.get(ref)),
      ]);
      const recent: Record<string, string[]> = {};
      docs.forEach((d, i) => {
        const at: unknown = d.exists ? d.data()?.sentAt : undefined;
        recent[keys[i]] = Array.isArray(at)
          ? at.filter((t): t is string => typeof t === 'string')
          : [];
      });
      const { result, write } = decide(recent, optOut.exists);
      for (const [key, sentAt] of Object.entries(write ?? {})) {
        tx.set(refs[keys.indexOf(key)], { sentAt });
      }
      return result;
    });

export const defaultCodeTextDeps = (): CodeTextDeps => ({
  env: process.env,
  atomically: firestoreAtomically(() => checkinDb() as unknown as TxDb),
  send: defaultTextDeps().send, // the guarded sender's transport (Twilio via sms-delivery)
  now: () => new Date(),
});

/** The IP bucket: IPv4 as is (also when mapped into IPv6), IPv6 by its /64 (one host's usual share). */
export function ipBucket(ip: string): string {
  const v = ip
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .split('%')[0];
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return mapped[1];
  if (!v.includes(':')) return v;
  const [head, tail] = v.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const groups =
    tail === undefined ? h : [...h, ...Array<string>(8 - h.length - t.length).fill('0'), ...t];
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, '') || '0')
    .join(':')}::/64`;
}

const ipKey = (ip: string, env: Env): string | null => {
  const key = phoneHashKey(env);
  return key
    ? createHmac('sha256', key)
        .update(`verify-ip/v1:${ipBucket(ip)}`)
        .digest('hex')
    : null;
};

type Verdict =
  | { kind: 'send'; alerts: string[] }
  | { kind: 'quiet'; why: string }
  | { kind: 'refuse'; reason: 'too-soon' | 'too-many' | 'unavailable'; why: string };

/**
 * Texts the code `makeCode` stores for this number, if allowed (see the module
 * doc for the order). Sent only when the provider accepted it.
 */
export async function textVerificationCode(
  userId: string,
  rawPhone: string,
  makeCode: (e164: string) => Promise<string>,
  deps: CodeTextDeps = defaultCodeTextDeps(),
  ip?: string
): Promise<CodeOutcome> {
  const phoneLast4 = last4(rawPhone);
  const refuse = (reason: CodeRefusal | 'send-failed', why: string = reason): CodeOutcome => {
    log.info({ reason: why, phoneLast4 }, 'Verification code not sent');
    return { sent: false, reason };
  };
  const phone = toE164(rawPhone);
  if (!phone) return refuse('invalid-number');
  // No hash secret: STOP and the limits can't be checked, so nothing goes.
  const hash = phoneHash(phone, deps.env);
  if (!hash) return refuse('unavailable');
  const ipHash = ip ? ipKey(ip, deps.env) : null;

  const keyOf: Partial<Record<Bucket, string>> = {
    user: `user:${userId}`,
    ...(ipHash && { ip: `ip:${ipHash}` }),
    pair: `pair:${userId}:${hash}`,
    phone: `phone:${hash}`,
    phoneDay: `phone-day:${hash}`,
    global: 'global',
  };
  const buckets = Object.keys(keyOf) as Bucket[];
  const now = deps.now().getTime();
  const at = new Date(now).toISOString();

  const verdict = await deps.atomically<Verdict>(
    buckets.map((b) => keyOf[b] as string),
    hash,
    (recent, optedOut) => {
      const kept = {} as Record<Bucket, string[]>;
      for (const b of buckets) {
        const all = recent[keyOf[b] as string] ?? [];
        kept[b] = all.filter((t) => now - Date.parse(t) < LIMITS[b].windowMs);
      }
      const over = (b: Bucket) => kept[b] !== undefined && kept[b].length >= LIMITS[b].max;
      const soon = (b: Bucket) =>
        kept[b]?.some((t) => now - Date.parse(t) < LIMITS[b].gapMs) === true;
      const record = (bs: Bucket[]) =>
        Object.fromEntries(
          bs.filter((b) => kept[b]).map((b) => [keyOf[b] as string, [...kept[b], at]])
        );
      // 1-2. The requester's own limits and the breaker: nothing about the number yet.
      if (soon('user')) return { result: { kind: 'refuse', reason: 'too-soon', why: 'user-gap' } };
      if (over('user')) return { result: { kind: 'refuse', reason: 'too-many', why: 'user-hour' } };
      if (over('ip')) return { result: { kind: 'refuse', reason: 'too-many', why: 'ip-hour' } };
      if (over('global')) {
        return { result: { kind: 'refuse', reason: 'unavailable', why: 'global-ceiling' } };
      }
      // 3-4. Recorded against the requester first; then the number's side, answered quietly.
      // A pair's first request this hour skips the number's cross-user limit (no owner lockout).
      const firstForPair = kept.pair.length === 0;
      const quiet = optedOut
        ? 'opted-out'
        : !firstForPair && (soon('phone') || over('phone'))
          ? 'number-limit'
          : soon('pair') || over('pair')
            ? 'pair-limit'
            : null;
      if (quiet) return { result: { kind: 'quiet', why: quiet }, write: record(['user', 'ip']) };
      // 5. A send: every bucket records it.
      const alerts = [
        ...(kept.phoneDay.length + 1 >= LIMITS.phoneDay.max ? ['number-day'] : []),
        ...(kept.global.length + 1 >= GLOBAL_ALERT ? ['global'] : []),
      ];
      return { result: { kind: 'send', alerts }, write: record(buckets) };
    }
  );

  if (verdict.kind === 'refuse') {
    if (verdict.why === 'global-ceiling') {
      log.error({ ceiling: LIMITS.global.max }, 'Verification codes: global hourly ceiling hit');
    }
    return refuse(verdict.reason, verdict.why);
  }
  if (verdict.kind === 'quiet') {
    // Never store a code for a number we didn't text: it could be guessed at /confirm.
    // A throwaway keeps the work similar; the requester's own code is left as it is.
    void randomInt(100000, 1000000);
    log.warn({ reason: verdict.why, phoneLast4 }, 'Verification code refused quietly');
    return { sent: false, reason: 'quiet' };
  }
  const code = await makeCode(phone);
  if (verdict.alerts.includes('number-day')) {
    log.error(
      { phoneLast4, perDay: LIMITS.phoneDay.max },
      'Verification codes: one number asked for often'
    );
  }
  if (verdict.alerts.includes('global')) {
    log.error({ alertAt: GLOBAL_ALERT }, 'Verification codes: global hourly volume high');
  }
  const result = await deps.send({
    to: phone,
    body: codeText(code),
    personaId: 'ferni',
    userId,
    outreachId: `verify_${at}`,
  });
  if (!result.success) {
    log.warn({ phoneLast4, error: redactNumbers(result.error) }, 'Code send failed');
    return refuse('send-failed');
  }
  log.info({ phoneLast4 }, 'Verification code sent');
  return { sent: true };
}

/** Confirm tries per number, across users, sent or not. */
export const CONFIRM_TRIES = { windowMs: HOUR, max: 5 } as const;

/**
 * Reserves one confirm try for the number a pending code is for: 'locked' once
 * it has had CONFIRM_TRIES.max tries this hour (from anyone), so guessing a
 * code across accounts is capped. Atomic like the send limits.
 */
export async function reserveConfirmTry(
  rawPhone: string,
  deps: CodeTextDeps = defaultCodeTextDeps()
): Promise<'ok' | 'locked' | 'unavailable'> {
  const phone = toE164(rawPhone);
  const hash = phone ? phoneHash(phone, deps.env) : null;
  if (!hash) return 'unavailable';
  const key = `confirm:${hash}`;
  const now = deps.now().getTime();
  const verdict = await deps.atomically<'ok' | 'locked'>([key], hash, (recent) => {
    const kept = (recent[key] ?? []).filter((t) => now - Date.parse(t) < CONFIRM_TRIES.windowMs);
    if (kept.length >= CONFIRM_TRIES.max) return { result: 'locked' };
    return { result: 'ok', write: { [key]: [...kept, new Date(now).toISOString()] } };
  });
  if (verdict === 'locked')
    log.warn({ phoneLast4: last4(phone ?? '') }, 'Confirm tries capped for a number');
  return verdict;
}
