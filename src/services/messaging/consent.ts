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
 * and time of the last change. For texts, unknown means yes for the owner's own
 * verified number and no for anyone else, who must opt in themselves (consentBlocks).
 *
 * During the migration the old phone-keyed stores still count: an opt-out in
 * feature_checkin_optouts (sms) or call_opt_outs (call) blocks, and inbound
 * STOP/START also updates them, so turning MESSAGING_PIPELINE off loses no
 * opt-out. M8 deletes the fallback once the old stores are retired.
 *
 * Everything here is behind MESSAGING_PIPELINE (off by default). With it off,
 * nothing is read or written and every sender behaves as before.
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
  toE164,
  type Env,
} from '../outreach/checkin-replies.js';

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

function channelOf(raw: unknown): ChannelConsent {
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

async function writeConsent(
  hash: string,
  channel: ConsentChannel,
  state: Exclude<ConsentState, 'unknown'>,
  source: ConsentSource,
  deps: ConsentDeps
): Promise<void> {
  const at = deps.now().toISOString();
  await deps.store.apply(hash, (doc) => {
    const history = Array.isArray(doc?.history) ? (doc.history as unknown[]) : [];
    return {
      ...doc,
      [channel]: { state, source, at },
      updatedAt: at,
      history: [...history, `${at} ${channel} ${state} ${source}`].slice(-HISTORY_MAX),
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
  await writeConsent(hash, channel, 'opted-out', source, deps);
}

/** Record that this phone opted (back) in to `channel`. New store only. */
export async function writeOptIn(
  hash: string,
  channel: ConsentChannel,
  source: ConsentSource,
  deps: ConsentDeps = defaultConsentDeps()
): Promise<void> {
  await writeConsent(hash, channel, 'opted-in', source, deps);
}

export interface ConsentKeyword {
  state: 'opted-out' | 'opted-in';
  channels: ConsentChannel[];
}

const OPT_OUT_WORDS: ReadonlySet<string> = new Set([
  'stop',
  'revoke',
  'cancel',
  'unsubscribe',
  'quit',
]);
const OPT_IN_WORDS: ReadonlySet<string> = new Set(['start', 'unstop']);
const STOP_CALLING = /^stop calling( me)?$/;

/**
 * The whole message, any case, is the keyword: STOP, REVOKE, CANCEL, UNSUBSCRIBE
 * or QUIT opts out of texts; "stop calling" out of texts and calls; START or
 * UNSTOP back in to texts (never calls: a do-not-call ask is undone only in
 * person). Anything else is not a consent change here.
 */
export function consentKeyword(body: string): ConsentKeyword | null {
  const said = body
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/, '')
    .replace(/\s+/g, ' ');
  if (OPT_OUT_WORDS.has(said)) return { state: 'opted-out', channels: ['sms'] };
  if (STOP_CALLING.test(said)) return { state: 'opted-out', channels: ['sms', 'call'] };
  if (OPT_IN_WORDS.has(said)) return { state: 'opted-in', channels: ['sms'] };
  return null;
}

/**
 * Every inbound text to Ferni's number passes through here (the Twilio
 * webhook route, after its signature check), so a STOP answers every kind of
 * text at once. Also updates the old phone-keyed stores, so turning the flag
 * off keeps the opt-out. Returns what changed, or null. Never throws.
 */
export async function recordInboundSmsConsent(
  from: unknown,
  body: unknown,
  deps: ConsentDeps = defaultConsentDeps()
): Promise<ConsentKeyword | null> {
  if (!messagingPipelineOn(deps.env)) return null;
  if (typeof from !== 'string' || typeof body !== 'string') return null;
  const keyword = consentKeyword(body);
  const e164 = toE164(from);
  const hash = e164 ? phoneHash(e164, deps.env) : null;
  if (!keyword || !e164 || !hash) return null;
  const at = deps.now().toISOString();
  try {
    for (const channel of keyword.channels) {
      // eslint-disable-next-line no-await-in-loop -- two writes at most, in order
      await writeConsent(hash, channel, keyword.state, 'inbound-sms', deps);
    }
    await deps.store.setLegacySmsOptOut(hash, keyword.state === 'opted-out', at);
    if (keyword.channels.includes('call')) await deps.store.setLegacyCallOptOut(e164, at);
    log.info({ phoneLast4: last4(e164), ...keyword }, 'Consent updated by text');
    return keyword;
  } catch (error) {
    log.error({ error: String(error), phoneLast4: last4(e164) }, 'Consent not saved');
    return null;
  }
}

/** Why a text or call was refused: a recorded opt-out, no opt-in from a third party, or no way to check. */
export type ConsentBlock = 'opted-out' | 'no-consent' | 'unverifiable';

/**
 * Null when `channel` to `phone` is allowed, else why not. With the flag off,
 * always null (each sender keeps its own checks). Fails closed: a number that
 * can't be hashed, or a store that can't be read, refuses. `allowUnknown` is
 * asked only when the phone's consent is unknown. For texts it is "is this the
 * owner's own verified number?" (a function, asked only then): a third party
 * must have opted in. Calls pass true: a call to someone else already needs the owner's confirmation
 * (OUTBOUND_CONFIRM), so only an opt-out stops it.
 */
export async function consentBlocks(
  phone: string,
  channel: ConsentChannel,
  allowUnknown: boolean | (() => Promise<boolean>),
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
    if (state === 'opted-in') return null;
    if (typeof allowUnknown === 'boolean' ? allowUnknown : await allowUnknown()) return null;
    return 'no-consent';
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
