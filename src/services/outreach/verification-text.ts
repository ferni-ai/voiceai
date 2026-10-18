/**
 * Texts a phone-verification code to the number being verified. That number
 * is not verified yet (that's the point), so the guarded sender's
 * verified-phone rule can't apply; the code goes straight to it over the same
 * transport, after these checks:
 *
 * - North American numbers only (call-retry's toE164), against SMS pumping;
 * - never a number that sent STOP (the global opt-out every inbound STOP writes);
 * - limits, checked and recorded in ONE Firestore transaction before any send:
 *   per user 1 a minute and 5 an hour, per (user, number) pair 3 an hour, per IP 20 an
 *   hour, and 500 an hour across everyone (a circuit breaker, logged as an
 *   error). Someone else hammering a number never uses up its owner's budget;
 *   20 a day to one number only raises an alert.
 *
 * A refusal that depends on someone else's state (their STOP, the pair limit)
 * is 'quiet': the caller answers it like a send, so it can't be used to learn
 * whether a number opted out. The code and the full number are never logged:
 * last four digits only.
 *
 * @module services/outreach/verification-text
 */
import { createHmac } from 'node:crypto';
import { createLogger } from '../../utils/safe-logger.js';
import { toE164 } from './call-retry.js';
import {
  checkinDb,
  firestoreReplyStore,
  last4,
  phoneHash,
  phoneHashKey,
  type Env,
} from './checkin-replies.js';
import type { SMSDeliveryResult, SMSMessage } from './delivery/sms-delivery.js';
import { defaultTextDeps, redactNumbers } from './guarded-text.js';

const log = createLogger({ module: 'verification-text' });
const SENDS = 'verify_code_sends';
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Per key kind: the window it keeps, the least gap, the most in that window. */
export const LIMITS = {
  user: { windowMs: HOUR, gapMs: MIN, max: 5 },
  pair: { windowMs: HOUR, gapMs: MIN, max: 3 },
  ip: { windowMs: HOUR, gapMs: 0, max: 20 },
  global: { windowMs: HOUR, gapMs: 0, max: 500 },
  /** Alert only: never refuses, so nobody can lock a number out. */
  phone: { windowMs: DAY, gapMs: 0, max: 20 },
} as const;
type Kind = keyof typeof LIMITS;
type Refused = 'too-soon' | 'too-many' | 'pair-limit' | 'ip-limit' | 'global-limit';
interface Verdict {
  refusal: Refused | null;
  /** The number's own daily alert threshold is reached (never a refusal). */
  alert: boolean;
}

export const codeText = (code: string): string =>
  `Your Ferni code is ${code}. It expires in 10 minutes.`;

/** 'quiet': refused for a reason about someone else; answer it like a send, send nothing. */
export type CodeRefusal = 'invalid-number' | 'unavailable' | 'too-soon' | 'too-many' | 'quiet';
export type CodeOutcome = { sent: true } | { sent: false; reason: CodeRefusal | 'send-failed' };

/** Reads the keys' recent send times, decides, and writes `write` back, all atomically. */
export type Atomically = <T>(
  keys: string[],
  decide: (recent: Record<string, string[]>) => { result: T; write?: Record<string, string[]> }
) => Promise<T>;

export interface CodeTextDeps {
  env: Env;
  isOptedOut: (phoneHash: string) => Promise<boolean>;
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

/** Atomically over Firestore: every read through the transaction, every write in its commit. */
export const firestoreAtomically =
  (db: () => TxDb): Atomically =>
  (keys, decide) =>
    db().runTransaction(async (tx) => {
      const refs = keys.map((k) => db().collection(SENDS).doc(k));
      const docs = await Promise.all(refs.map((ref) => tx.get(ref)));
      const recent: Record<string, string[]> = {};
      docs.forEach((d, i) => {
        const at: unknown = d.exists ? d.data()?.sentAt : undefined;
        recent[keys[i]] = Array.isArray(at)
          ? at.filter((t): t is string => typeof t === 'string')
          : [];
      });
      const { result, write } = decide(recent);
      for (const [key, sentAt] of Object.entries(write ?? {})) {
        tx.set(refs[keys.indexOf(key)], { sentAt });
      }
      return result;
    });

export const defaultCodeTextDeps = (): CodeTextDeps => ({
  env: process.env,
  isOptedOut: (hash) => firestoreReplyStore.isOptedOut(hash),
  atomically: firestoreAtomically(() => checkinDb() as unknown as TxDb),
  send: defaultTextDeps().send, // the guarded sender's transport (Twilio via sms-delivery)
  now: () => new Date(),
});

const ipKey = (ip: string, env: Env): string | null => {
  const key = phoneHashKey(env);
  return key ? createHmac('sha256', key).update(`verify-ip/v1:${ip}`).digest('hex') : null;
};

/**
 * Texts the code `makeCode` stores for this number, if allowed. `makeCode`
 * runs only after every check passes and the send is reserved, so a refused
 * request leaves no code behind. Sent only when the provider accepted it.
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
  const ipHash = ip ? ipKey(ip, deps.env) : null;
  if (!hash) return refuse('unavailable');
  if (await deps.isOptedOut(hash)) return refuse('quiet', 'opted-out');

  const keyOf: Partial<Record<Kind, string>> = {
    user: `user:${userId}`,
    pair: `pair:${userId}:${hash}`,
    global: 'global',
    phone: `phone:${hash}`,
    ...(ipHash && { ip: `ip:${ipHash}` }),
  };
  const kinds = Object.keys(keyOf) as Kind[];
  const now = deps.now().getTime();
  const at = new Date(now).toISOString();
  const verdict = await deps.atomically<Verdict>(
    kinds.map((k) => keyOf[k] as string),
    (recent): { result: Verdict; write?: Record<string, string[]> } => {
      const kept = {} as Record<Kind, string[]>;
      for (const k of kinds) {
        const all = recent[keyOf[k] as string] ?? [];
        kept[k] = all.filter((t) => now - Date.parse(t) < LIMITS[k].windowMs);
      }
      const over = (k: Kind) => kept[k] !== undefined && kept[k].length >= LIMITS[k].max;
      const soon = (k: Kind) => kept[k]?.some((t) => now - Date.parse(t) < LIMITS[k].gapMs);
      const refusal: Refused | null = soon('user')
        ? 'too-soon'
        : over('user')
          ? 'too-many'
          : soon('pair') || over('pair')
            ? 'pair-limit'
            : over('ip')
              ? 'ip-limit'
              : over('global')
                ? 'global-limit'
                : null;
      if (refusal) return { result: { refusal, alert: false } };
      const write = Object.fromEntries(kinds.map((k) => [keyOf[k] as string, [...kept[k], at]]));
      return { result: { refusal: null, alert: over('phone') }, write };
    }
  );
  if (verdict.refusal === 'too-soon' || verdict.refusal === 'too-many')
    return refuse(verdict.refusal);
  if (verdict.refusal === 'pair-limit') return refuse('quiet', 'pair-limit');
  if (verdict.refusal === 'ip-limit') return refuse('too-many', 'ip-limit');
  if (verdict.refusal === 'global-limit') {
    log.error(
      { limit: LIMITS.global.max },
      'Verification codes: global hourly cap hit (circuit open)'
    );
    return refuse('unavailable', 'global-limit');
  }
  // Many codes to one number in a day: alert, never refuse (that would let anyone lock it out).
  if (verdict.alert)
    log.error(
      { phoneLast4, perDay: LIMITS.phone.max },
      'Verification codes: one number asked for often'
    );

  const code = await makeCode(phone);
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
