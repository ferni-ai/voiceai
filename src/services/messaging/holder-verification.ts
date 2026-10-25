/**
 * The holder of a sponsored identity proves the number is theirs with a
 * texted code. A sponsor typed that number; until the holder verifies it,
 * MESSAGING_PIPELINE treats it as nobody's own (user-reach sponsoredPhoneOf),
 * so no outbound reaches it as "theirs".
 *
 * 1. The sponsor asks (POST /api/sponsored-identities/:id/verify-phone):
 *    Ferni texts a 6-digit code to the number, once per 10 minutes, unless
 *    it opted out. Only an HMAC of the code is stored, for 15 minutes.
 * 2. The holder replies with the code from that phone. A match sets
 *    phoneVerifiedAt on the identity; five wrong tries end the code.
 *
 * Behind MESSAGING_PIPELINE, like the rule it unlocks.
 *
 * @module services/messaging/holder-verification
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { last4, phoneHashKey, toE164, type Env } from '../outreach/checkin-replies.js';
import {
  consentBlocks,
  defaultConsentDeps,
  messagingPipelineOn,
  type ConsentDeps,
} from './consent.js';

const log = createLogger({ module: 'holder-verification' });

const CODE_TTL_MS = 15 * 60 * 1000;
const RESEND_GAP_MS = 10 * 60 * 1000;
const MAX_TRIES = 5;
const SIX_DIGITS = /^\d{6}$/;

interface Pending {
  codeHash: string;
  sentAt: string;
  expiresAt: string;
  tries: number;
}

export interface HolderIdentity {
  id: string;
  sponsorUserId: string;
  phoneNumber: string;
  sponsorName?: string;
  phoneVerifiedAt?: string;
  holderVerification?: Pending;
}

export interface HolderVerificationDeps {
  env: Env;
  now: () => Date;
  byId: (id: string) => Promise<HolderIdentity | undefined>;
  byPhone: (e164: string) => Promise<HolderIdentity | undefined>;
  save: (id: string, patch: Record<string, unknown>) => Promise<void>;
  send: (to: string, body: string) => Promise<boolean>;
  code: () => string;
  consent: ConsentDeps;
}

export type StartOutcome =
  | { started: true; phoneLast4: string }
  | {
      started: false;
      reason:
        'pipeline-off' | 'not-found' | 'already-verified' | 'too-soon' | 'opted-out' | 'not-sent';
    };

const hashCode = (code: string, env: Env): string | null => {
  const key = phoneHashKey(env);
  return key ? createHmac('sha256', key).update(`holder-code:${code}`).digest('hex') : null;
};

/** The sponsor asks Ferni to text the holder a code. Only the identity's own sponsor may. */
export async function startHolderVerification(
  identityId: string,
  sponsorUid: string,
  deps: HolderVerificationDeps = defaultHolderDeps()
): Promise<StartOutcome> {
  if (!messagingPipelineOn(deps.env)) return { started: false, reason: 'pipeline-off' };
  const identity = await deps.byId(identityId);
  const e164 = identity ? toE164(identity.phoneNumber) : null;
  if (!identity || identity.sponsorUserId !== sponsorUid || !e164) {
    return { started: false, reason: 'not-found' };
  }
  if (identity.phoneVerifiedAt) return { started: false, reason: 'already-verified' };
  const now = deps.now();
  const last = identity.holderVerification?.sentAt;
  if (last && now.getTime() - Date.parse(last) < RESEND_GAP_MS) {
    return { started: false, reason: 'too-soon' };
  }
  if (await consentBlocks(e164, 'sms', true, deps.consent)) {
    return { started: false, reason: 'opted-out' };
  }
  const code = deps.code();
  const codeHash = hashCode(code, deps.env);
  if (!codeHash) return { started: false, reason: 'not-sent' };
  const pending: Pending = {
    codeHash,
    sentAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
    tries: 0,
  };
  await deps.save(identity.id, { holderVerification: pending });
  const who = identity.sponsorName ? `${identity.sponsorName} set up Ferni for you. ` : '';
  const body = `Ferni here. ${who}Reply with ${code} to confirm this is your phone, or STOP.`;
  if (!(await deps.send(e164, body))) {
    await deps.save(identity.id, { holderVerification: null });
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
    const identity = await deps.byPhone(e164);
    const pending = identity?.holderVerification;
    const now = deps.now();
    if (!identity || !pending || now.getTime() > Date.parse(pending.expiresAt)) return false;
    const got = hashCode(code, deps.env);
    const ok =
      got !== null &&
      got.length === pending.codeHash.length &&
      timingSafeEqual(Buffer.from(got), Buffer.from(pending.codeHash));
    if (!ok) {
      const tries = pending.tries + 1;
      await deps.save(identity.id, {
        holderVerification: tries >= MAX_TRIES ? null : { ...pending, tries },
      });
      return false;
    }
    await deps.save(identity.id, { phoneVerifiedAt: now.toISOString(), holderVerification: null });
    log.info({ identityId: identity.id, phoneLast4: last4(e164) }, 'Holder verified their phone');
    return true;
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
  const [codeHash, sentAt, expiresAt] = [text(p.codeHash), text(p.sentAt), text(p.expiresAt)];
  if (!codeHash || !sentAt || !expiresAt || typeof p.tries !== 'number') return undefined;
  return { codeHash, sentAt, expiresAt, tries: p.tries };
}

/** Read field by field: a doc missing its sponsor or phone matches no one (fails closed). */
function holderOf(id: string, data: Record<string, unknown>): HolderIdentity {
  return {
    id,
    sponsorUserId: text(data.sponsorUserId) ?? '',
    phoneNumber: text(data.phoneNumber) ?? '',
    sponsorName: text(data.sponsorName),
    phoneVerifiedAt: text(data.phoneVerifiedAt),
    holderVerification: pendingOf(data.holderVerification),
  };
}

export function defaultHolderDeps(): HolderVerificationDeps {
  const db = () => {
    const d = getFirestoreDb();
    if (!d) throw new Error('Firestore unavailable');
    return d.collection('sponsored_identities');
  };
  return {
    env: process.env,
    now: () => new Date(),
    async byId(id) {
      const doc = await db().doc(id).get();
      return doc.exists ? holderOf(doc.id, doc.data() as Record<string, unknown>) : undefined;
    },
    async byPhone(e164) {
      const { lookupByPhone } = await import('../identity/sponsored-identity.js');
      const found = await lookupByPhone(e164);
      return found.identity ? this.byId(found.identity.id) : undefined;
    },
    async save(id, patch) {
      await db().doc(id).set(patch, { merge: true });
    },
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
