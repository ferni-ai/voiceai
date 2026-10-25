/**
 * The holder of a sponsored identity proves the number is theirs with a
 * texted code. A sponsor typed that number; until the holder verifies it,
 * MESSAGING_PIPELINE treats it as nobody's own (user-reach sponsoredPhoneOf),
 * so no outbound reaches it as "theirs".
 *
 * 1. The sponsor asks (POST /api/sponsored-identities/:id/verify-phone):
 *    Ferni texts a 6-digit code to the number unless it opted out, within the
 *    send limits in holder-send-ledger.ts. Only an HMAC of the code is stored,
 *    for 15 minutes. The text names the sponsor only by their own account's
 *    name, and only when it is plainly a name (never a field the sponsor wrote
 *    on the identity).
 * 2. The holder replies with the code from that phone. A match sets
 *    phoneVerifiedAt on the identity; five wrong tries end the code.
 *
 * The code is bound to the number it went to: the pending record carries that
 * number's keyed hash, and every write (the pending code, each try, the proof)
 * runs in one transaction over a fresh read of the identity that requires its
 * stored number to still be that number. A sponsor who swaps the number after
 * the code went out (or a stale phone-to-identity cache) can't land the proof
 * on the new number.
 *
 * Behind MESSAGING_PIPELINE, like the rule it unlocks.
 *
 * @module services/messaging/holder-verification
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { last4, phoneHash, phoneHashKey, toE164, type Env } from '../outreach/checkin-replies.js';
import {
  consentBlocks,
  defaultConsentDeps,
  messagingPipelineOn,
  type ConsentDeps,
} from './consent.js';
import { firestoreSendLedger, reserveHolderSend, type SendLedger } from './holder-send-ledger.js';

const log = createLogger({ module: 'holder-verification' });

const CODE_TTL_MS = 15 * 60 * 1000;
const NAME_MAX = 40;
const NAME_CHARS = /^[\p{L}\p{M}][\p{L}\p{M} '’.-]*$/u;
const MAX_TRIES = 5;
const SIX_DIGITS = /^\d{6}$/;

interface Pending {
  codeHash: string;
  /** phoneHash() of the number the code was texted to */
  phoneHash: string;
  sentAt: string;
  expiresAt: string;
  tries: number;
}

export interface HolderIdentity {
  id: string;
  sponsorUserId: string;
  phoneNumber: string;
  phoneVerifiedAt?: string;
  holderVerification?: Pending;
}

export interface HolderVerificationDeps {
  env: Env;
  now: () => Date;
  byId: (id: string) => Promise<HolderIdentity | undefined>;
  /** Which identity a number belongs to. May be stale (cached): transact re-checks the number. */
  byPhone: (e164: string) => Promise<HolderIdentity | undefined>;
  /**
   * One atomic read-decide-write on the identity: reads it fresh (no cache),
   * hands it to `decide`, merges the returned patch, if any, before anyone
   * else can change the doc, and resolves to `ok`.
   */
  transact: (
    id: string,
    decide: (current: HolderIdentity | undefined) => HolderStep
  ) => Promise<boolean>;
  /** The sponsor's name from their own account (bogle_users), not from the identity */
  sponsorName: (uid: string) => Promise<unknown>;
  ledger: SendLedger;
  send: (to: string, body: string) => Promise<boolean>;
  code: () => string;
  consent: ConsentDeps;
}

/** What one transaction decided: the patch to merge (none: no write), and its answer. */
export interface HolderStep {
  patch?: Record<string, unknown>;
  ok: boolean;
}

export type StartOutcome =
  | { started: true; phoneLast4: string }
  | {
      started: false;
      reason:
        | 'pipeline-off'
        | 'not-found'
        | 'already-verified'
        | 'too-soon'
        | 'daily-cap'
        | 'opted-out'
        | 'phone-changed'
        | 'not-sent';
    };

const hashCode = (code: string, env: Env): string | null => {
  const key = phoneHashKey(env);
  return key ? createHmac('sha256', key).update(`holder-code:${code}`).digest('hex') : null;
};

/** The stored number is still `e164` (compared as E.164; a missing number is never a match). */
const stillAt = (identity: HolderIdentity | undefined, e164: string): identity is HolderIdentity =>
  !!identity && toE164(identity.phoneNumber) === e164;

/** This sponsor's identity, still at `e164` and not yet verified: it may take a code. */
const awaitingCode = (cur: HolderIdentity | undefined, e164: string, sponsorUid: string): boolean =>
  stillAt(cur, e164) && cur.sponsorUserId === sponsorUid && !cur.phoneVerifiedAt;

/**
 * A name safe to put in a text from Ferni's number: letters, marks, spaces and
 * ' . - only, so no digits, URLs, control or bidi characters; no "word.word"
 * (a domain); at most 40 characters. Anything else is no name at all.
 */
export function cleanSponsorName(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const name = raw.normalize('NFC').replace(/ +/g, ' ').trim();
  const ok = name.length <= NAME_MAX && NAME_CHARS.test(name) && !/\.\p{L}/u.test(name);
  return ok ? name : undefined;
}

/** The sponsor asks Ferni to text the holder a code. Only the identity's own sponsor may. */
export async function startHolderVerification(
  identityId: string,
  sponsorUid: string,
  deps: HolderVerificationDeps = defaultHolderDeps()
): Promise<StartOutcome> {
  if (!messagingPipelineOn(deps.env)) return { started: false, reason: 'pipeline-off' };
  const identity = await deps.byId(identityId);
  const e164 = identity ? toE164(identity.phoneNumber) : null;
  if (!identity || !sponsorUid || identity.sponsorUserId !== sponsorUid || !e164) {
    return { started: false, reason: 'not-found' };
  }
  if (identity.phoneVerifiedAt) return { started: false, reason: 'already-verified' };
  if (await consentBlocks(e164, 'sms', true, deps.consent)) {
    return { started: false, reason: 'opted-out' };
  }
  const code = deps.code();
  const codeHash = hashCode(code, deps.env);
  const numberHash = phoneHash(e164, deps.env);
  if (!codeHash || !numberHash) return { started: false, reason: 'not-sent' };
  const now = deps.now();
  const reserved = await reserveHolderSend(deps.ledger, numberHash, sponsorUid, now);
  if (reserved !== 'ok') return { started: false, reason: reserved };
  const pending: Pending = {
    codeHash,
    phoneHash: numberHash,
    sentAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
    tries: 0,
  };
  // Stored only if the doc still holds this number for this sponsor, unverified.
  const stored = await deps.transact(identity.id, (cur) =>
    awaitingCode(cur, e164, sponsorUid)
      ? { patch: { holderVerification: pending }, ok: true }
      : { ok: false }
  );
  if (!stored) return { started: false, reason: 'phone-changed' };
  const name = cleanSponsorName(await deps.sponsorName(sponsorUid).catch(() => undefined));
  const who = name ? `${name} set up Ferni for you. ` : '';
  const body = `Ferni here. ${who}Reply with ${code} to confirm this is your phone, or STOP.`;
  if (!(await deps.send(e164, body))) {
    // Clear only this code, never one written since.
    await deps.transact(identity.id, (cur) =>
      cur?.holderVerification?.codeHash === codeHash
        ? { patch: { holderVerification: null }, ok: true }
        : { ok: false }
    );
    return { started: false, reason: 'not-sent' };
  }
  log.info({ identityId, phoneLast4: last4(e164) }, 'Holder verification code sent');
  return { started: true, phoneLast4: last4(e164) };
}

/**
 * Inbound hook: a 6-digit reply from a sponsored identity's number checks its
 * pending code. A match sets phoneVerifiedAt; a miss counts a try. Returns
 * true only when it verified the number. Never throws.
 */
export async function recordHolderCode(
  from: unknown,
  body: unknown,
  deps: HolderVerificationDeps = defaultHolderDeps()
): Promise<boolean> {
  if (!messagingPipelineOn(deps.env) || typeof from !== 'string' || typeof body !== 'string') {
    return false;
  }
  const code = body.replace(/\s+/g, '');
  const e164 = toE164(from);
  if (!SIX_DIGITS.test(code) || !e164) return false;
  try {
    // Only an id: the lookup may be cached and stale, so the transaction re-reads the doc.
    const found = await deps.byPhone(e164);
    if (!found?.holderVerification) return false;
    // A number that texted STOP isn't enrolled by its next message, even the code.
    if (await consentBlocks(e164, 'sms', true, deps.consent)) return false;
    const got = hashCode(code, deps.env);
    const numberHash = phoneHash(e164, deps.env);
    const now = deps.now();
    const verified = await deps.transact(found.id, (identity) => {
      // The doc must still hold the number that replied, and the code must have gone to it.
      if (!stillAt(identity, e164)) return { ok: false };
      const pending = identity.holderVerification;
      if (!pending || !numberHash || pending.phoneHash !== numberHash) return { ok: false };
      if (now.getTime() > Date.parse(pending.expiresAt)) return { ok: false };
      const match =
        got !== null &&
        got.length === pending.codeHash.length &&
        timingSafeEqual(Buffer.from(got), Buffer.from(pending.codeHash));
      if (match) {
        return {
          patch: { phoneVerifiedAt: now.toISOString(), holderVerification: null },
          ok: true,
        };
      }
      const tries = pending.tries + 1;
      return {
        patch: { holderVerification: tries >= MAX_TRIES ? null : { ...pending, tries } },
        ok: false,
      };
    });
    if (verified) {
      log.info({ identityId: found.id, phoneLast4: last4(e164) }, 'Holder verified their phone');
    }
    return verified;
  } catch (error) {
    log.error({ error: String(error), phoneLast4: last4(e164) }, 'Holder code not checked');
    return false;
  }
}

const ROUTE = /^\/([^/]+)\/verify-phone$/;
type Send = (res: ServerResponse, status: number, data: unknown) => void;

/** POST /api/sponsored-identities/:id/verify-phone, for the signed-in sponsor. True when handled. */
export async function handleHolderVerifyRoute(
  req: IncomingMessage,
  res: ServerResponse,
  route: string,
  sponsorUid: string,
  send: Send,
  deps: HolderVerificationDeps = defaultHolderDeps()
): Promise<boolean> {
  const match = route.match(ROUTE);
  if (!match || req.method !== 'POST') return false;
  const out = await startHolderVerification(match[1], sponsorUid, deps);
  const status = out.started
    ? 200
    : out.reason === 'pipeline-off' || out.reason === 'not-found'
      ? 404
      : 409;
  send(res, status, out);
  return true;
}

const text = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

function pendingOf(v: unknown): Pending | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const p = v as Record<string, unknown>;
  const [codeHash, numberHash, sentAt, expiresAt] = [
    text(p.codeHash),
    text(p.phoneHash),
    text(p.sentAt),
    text(p.expiresAt),
  ];
  // A code without the number it went to (written before the binding) is no code.
  if (!codeHash || !numberHash || !sentAt || !expiresAt || typeof p.tries !== 'number') {
    return undefined;
  }
  return { codeHash, phoneHash: numberHash, sentAt, expiresAt, tries: p.tries };
}

/** Read field by field: a doc missing its sponsor or phone matches no one (fails closed). */
function holderOf(id: string, data: Record<string, unknown>): HolderIdentity {
  return {
    id,
    sponsorUserId: text(data.sponsorUserId) ?? '',
    phoneNumber: text(data.phoneNumber) ?? '',
    phoneVerifiedAt: text(data.phoneVerifiedAt),
    holderVerification: pendingOf(data.holderVerification),
  };
}

export function defaultHolderDeps(): HolderVerificationDeps {
  const firestore = () => {
    const d = getFirestoreDb();
    if (!d) throw new Error('Firestore unavailable');
    return d;
  };
  const db = () => firestore().collection('sponsored_identities');
  return {
    env: process.env,
    now: () => new Date(),
    async byId(id) {
      const doc = await db().doc(id).get();
      return doc.exists ? holderOf(id, doc.data() as Record<string, unknown>) : undefined;
    },
    async byPhone(e164) {
      const { lookupByPhone } = await import('../identity/sponsored-identity.js');
      const found = await lookupByPhone(e164);
      return found.identity ? this.byId(found.identity.id) : undefined;
    },
    async transact(id, decide) {
      const ref = db().doc(id);
      return firestore().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const step = decide(
          snap.exists ? holderOf(id, snap.data() as Record<string, unknown>) : undefined
        );
        if (step.patch) tx.set(ref, step.patch, { merge: true });
        return step.ok;
      });
    },
    async sponsorName(uid) {
      const doc = await getFirestoreDb()?.collection('bogle_users').doc(uid).get();
      const data: Record<string, unknown> | undefined = doc?.exists ? doc.data() : undefined;
      return data?.displayName ?? data?.name;
    },
    ledger: firestoreSendLedger,
    async send(to, body) {
      const { sendSms } = await import('../outreach/guarded-text-store.js');
      const out = await sendSms({
        to,
        body,
        personaId: 'ferni',
        userId: 'holder-verification',
        outreachId: 'holder-verification',
      });
      return out.success;
    },
    code: () => String(randomInt(0, 1_000_000)).padStart(6, '0'),
    consent: defaultConsentDeps(),
  };
}
