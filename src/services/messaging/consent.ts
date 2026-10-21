/**
 * One consent record per phone, for texts and calls alike: consent/{phoneHash}.
 * Step M3 of the messaging design (voiceai-evidence/texting-map-2026-10-18/DESIGN.md).
 *
 * Today one STOP lands in up to four stores, each keyed its own way
 * (feature_checkin_optouts by phoneHash, outreach_profiles.allowedChannels and
 * outreachPreferences by user, call_opt_outs by number), and most senders read
 * none of them. This record is the one every sender and caller reads, keyed by
 * the same HMAC phoneHash the check-in replies use; the number itself is never
 * stored here.
 *
 * Each channel (sms, call) is opted-in, opted-out or unknown, with the source
 * and time of the last change. Unknown means yes for the owner's own verified
 * number and no for anyone else, who must opt in themselves (consentBlocks).
 *
 * During the migration the old phone-keyed stores still count: an opt-out in
 * feature_checkin_optouts (sms) or call_opt_outs (call) blocks, and inbound
 * STOP/START also updates them, so turning MESSAGING_PIPELINE off loses no
 * opt-out. M8 deletes the fallback once the old stores are retired.
 *
 * An inbound STOP or START is written to consent/{phoneHash} and to
 * feature_checkin_optouts with or without MESSAGING_PIPELINE, and the guarded
 * sender reads both (outreach/text-consent.ts): honouring a revocation is the
 * law, not a feature. consentBlocks (third-party consent, do-not-call) and the
 * call_opt_outs mirror stay behind MESSAGING_PIPELINE (off by default).
 *
 * @module services/messaging/consent
 */
import { flagOn } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import {
  firestoreReplyStore,
  last4,
  phoneHash,
  phoneHashKeyVersion,
  toE164,
  type Env,
} from '../outreach/checkin-replies.js';
import { inboundKeyword } from './sms-keywords.js';

const log = createLogger({ module: 'messaging-consent' });

export const CONSENT = 'consent';
const CALL_OPT_OUTS = 'call_opt_outs';
const HISTORY_MAX = 20;

export type ConsentChannel = 'sms' | 'call';
export type ConsentState = 'opted-in' | 'opted-out' | 'unknown';
/** Where a change came from; short codes only, never message text. */
export type ConsentSource = 'inbound-sms' | 'voice-call' | 'legacy-store';

export interface ChannelConsent {
  state: ConsentState;
  source?: string;
  /** ISO time of the change. */
  at?: string;
}
export type Consent = Record<ConsentChannel, ChannelConsent>;

export interface ConsentStore {
  read: (hash: string) => Promise<Record<string, unknown> | undefined>;
  /** Read-modify-write of consent/{hash}, atomic where the store allows. */
  apply: (
    hash: string,
    change: (doc: Record<string, unknown> | undefined) => Record<string, unknown>
  ) => Promise<void>;
  legacySmsOptOut: (hash: string) => Promise<boolean>;
  setLegacySmsOptOut: (hash: string, optedOut: boolean, at: string) => Promise<void>;
  legacyCallOptOut: (e164: string) => Promise<boolean>;
  setLegacyCallOptOut: (e164: string, at: string) => Promise<void>;
}

export interface ConsentDeps {
  env: Env;
  store: ConsentStore;
  now: () => Date;
}

export const messagingPipelineOn = (env: Env = process.env): boolean =>
  flagOn('MESSAGING_PIPELINE', env);

const STATES: ReadonlySet<string> = new Set(['opted-in', 'opted-out']);

/** One channel of a consent/{phoneHash} doc; anything unrecognised is unknown. */
export function channelOf(raw: unknown): ChannelConsent {
  const c = (raw ?? {}) as { state?: unknown; source?: unknown; at?: unknown };
  if (typeof c.state !== 'string' || !STATES.has(c.state)) return { state: 'unknown' };
  return {
    state: c.state as ConsentState,
    ...(typeof c.source === 'string' && { source: c.source }),
    ...(typeof c.at === 'string' && { at: c.at }),
  };
}

/**
 * What this phone agreed to. An sms opt-out still on record in the old
 * feature_checkin_optouts store (same key) counts as opted-out. call_opt_outs is
 * keyed by number, not hash, so consentBlocks checks it. Throws when the store
 * can't be read: an unread opt-out must not pass for "unknown".
 */
export async function readConsent(
  hash: string,
  deps: ConsentDeps = defaultConsentDeps()
): Promise<Consent> {
  const [doc, legacySms] = await Promise.all([
    deps.store.read(hash),
    deps.store.legacySmsOptOut(hash),
  ]);
  const consent: Consent = { sms: channelOf(doc?.sms), call: channelOf(doc?.call) };
  if (legacySms && consent.sms.state !== 'opted-out') {
    consent.sms = { state: 'opted-out', source: 'legacy:feature_checkin_optouts' };
  }
  return consent;
}

/** Every channel in one transaction, so a STOP for texts and calls never lands half-written. */
async function writeConsent(
  hash: string,
  channels: readonly ConsentChannel[],
  state: Exclude<ConsentState, 'unknown'>,
  source: ConsentSource,
  deps: ConsentDeps
): Promise<void> {
  const at = deps.now().toISOString();
  const keyVersion = phoneHashKeyVersion(deps.env);
  await deps.store.apply(hash, (doc) => {
    const history = Array.isArray(doc?.history) ? (doc.history as unknown[]) : [];
    const changes = channels.map((c) => `${at} ${c} ${state} ${source}`);
    return {
      ...doc,
      ...Object.fromEntries(channels.map((c) => [c, { state, source, at }])),
      updatedAt: at,
      keyVersion,
      history: [...history, ...changes].slice(-HISTORY_MAX),
    };
  });
}

/** Record that this phone opted out of `channel`. New store only; throws when it can't be saved. */
export async function writeOptOut(
  hash: string,
  channel: ConsentChannel,
  source: ConsentSource,
  deps: ConsentDeps = defaultConsentDeps()
): Promise<void> {
  await writeConsent(hash, [channel], 'opted-out', source, deps);
}

/** Record that this phone opted (back) in to `channel`. New store only. */
export async function writeOptIn(
  hash: string,
  channel: ConsentChannel,
  source: ConsentSource,
  deps: ConsentDeps = defaultConsentDeps()
): Promise<void> {
  await writeConsent(hash, [channel], 'opted-in', source, deps);
}

export interface ConsentKeyword {
  state: 'opted-out' | 'opted-in';
  channels: ConsentChannel[];
}

/** Runs one write; a failure is logged at error level (last four digits only), never thrown. */
async function attempt(
  what: string,
  phoneLast4: string,
  write: () => Promise<void>
): Promise<boolean> {
  try {
    await write();
    return true;
  } catch (error) {
    log.error({ error: String(error), phoneLast4 }, `Opt-out not saved: ${what}`);
    return false;
  }
}

/** What an inbound text changes (sms-keywords.ts, the one list), or null for anything else. */
function consentChange(body: string): ConsentKeyword | null {
  const said = inboundKeyword(body);
  if (said?.keyword === 'stop') return { state: 'opted-out', channels: [...said.channels] };
  if (said?.keyword === 'start') return { state: 'opted-in', channels: [...said.channels] };
  return null;
}

/**
 * Every inbound text to Ferni's number passes through here (the Twilio
 * webhook route, after its signature check), so a STOP answers every kind of
 * text at once. It is the one writer of an inbound STOP or START, to both text
 * opt-out stores, flag or not: consent/{phoneHash} and feature_checkin_optouts,
 * which the guarded sender and verification codes read (TCPA: a revocation
 * stops every text). A STOP must never be lost, so each store is written on its
 * own and one failure doesn't skip the rest: the do-not-call list first (it is
 * what call paths read today; only with MESSAGING_PIPELINE on), then consent,
 * then the old text opt-out. Returns the change when consent was saved, else
 * null. Never throws.
 */
export async function recordInboundSmsConsent(
  from: unknown,
  body: unknown,
  deps: ConsentDeps = defaultConsentDeps()
): Promise<ConsentKeyword | null> {
  if (typeof from !== 'string' || typeof body !== 'string') return null;
  const keyword = consentChange(body);
  const e164 = keyword ? toE164(from) : null;
  if (!keyword || !e164) return null;
  const phoneLast4 = last4(e164);
  const at = deps.now().toISOString();
  // Keyed by number, so it needs no hash secret: written even when the rest can't be.
  if (messagingPipelineOn(deps.env) && keyword.channels.includes('call')) {
    await attempt('call_opt_outs', phoneLast4, async () =>
      deps.store.setLegacyCallOptOut(e164, at)
    );
  }
  const hash = phoneHash(e164, deps.env);
  if (!hash) {
    log.error({ phoneLast4, ...keyword }, 'Opt-out recognised but not saved: no LOG_HASH_SECRET');
    return null;
  }
  const saved = await attempt('consent', phoneLast4, async () =>
    writeConsent(hash, keyword.channels, keyword.state, 'inbound-sms', deps)
  );
  const optedOut = keyword.state === 'opted-out';
  await attempt('feature_checkin_optouts', phoneLast4, async () =>
    deps.store.setLegacySmsOptOut(hash, optedOut, at)
  );
  if (saved) log.info({ phoneLast4, ...keyword }, 'Consent updated by text');
  return saved ? keyword : null;
}

/** Why a text or call was refused: a recorded opt-out, no opt-in from a third party (needs-consent, as in M1 decide()), or no way to check. */
export type ConsentBlock = 'opted-out' | 'needs-consent' | 'unverifiable';

/**
 * Null when `channel` to `phone` is allowed, else why not. With the flag off,
 * always null (each sender keeps its own checks). Fails closed: a number that
 * can't be hashed, or a store that can't be read, refuses. `isOwner` is asked
 * only when the phone's consent is unknown: the owner's own verified number
 * may be reached, anyone else must have opted in.
 */
export async function consentBlocks(
  phone: string,
  channel: ConsentChannel,
  isOwner: () => Promise<boolean>,
  deps: ConsentDeps = defaultConsentDeps()
): Promise<ConsentBlock | null> {
  if (!messagingPipelineOn(deps.env)) return null;
  const e164 = toE164(phone);
  const hash = e164 ? phoneHash(e164, deps.env) : null;
  if (!e164 || !hash) return 'unverifiable';
  try {
    const { state } = (await readConsent(hash, deps))[channel];
    if (state === 'opted-out') return 'opted-out';
    if (channel === 'call' && (await deps.store.legacyCallOptOut(e164))) return 'opted-out';
    if (state === 'opted-in' || (await isOwner())) return null;
    return 'needs-consent';
  } catch (error) {
    log.warn({ error: String(error), channel }, 'Consent not readable; not sending');
    return 'unverifiable';
  }
}

function consentDb(): NonNullable<ReturnType<typeof getFirestoreDb>> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore unavailable');
  return db;
}

export const firestoreConsentStore: ConsentStore = {
  async read(hash) {
    const doc = await consentDb().collection(CONSENT).doc(hash).get();
    return doc.exists ? (doc.data() as Record<string, unknown>) : undefined;
  },
  async apply(hash, change) {
    const db = consentDb();
    const ref = db.collection(CONSENT).doc(hash);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      tx.set(ref, change(snap.exists ? (snap.data() as Record<string, unknown>) : undefined));
    });
  },
  legacySmsOptOut: async (hash) => firestoreReplyStore.isOptedOut(hash),
  async setLegacySmsOptOut(hash, optedOut, at) {
    if (optedOut) await firestoreReplyStore.addOptOut(hash, { at, via: 'reply' });
    else await firestoreReplyStore.removeOptOut(hash);
  },
  async legacyCallOptOut(e164) {
    return (await consentDb().collection(CALL_OPT_OUTS).doc(e164).get()).exists;
  },
  async setLegacyCallOptOut(e164, at) {
    // The old store's own shape (call-retry.ts recordCallOptOut), keyed by number as before.
    await consentDb()
      .collection(CALL_OPT_OUTS)
      .doc(e164)
      .set({ phone: e164, optedOutAt: at, callId: 'inbound-sms', requesterUserId: 'inbound-sms' });
  },
};

export function defaultConsentDeps(): ConsentDeps {
  return { env: process.env, store: firestoreConsentStore, now: () => new Date() };
}
