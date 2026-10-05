/**
 * Which Ferni account an OAuth "connect" flow links into, decided by the server.
 *
 * The connect flows (Google/Outlook/Apple calendar, wearables, v1 integrations)
 * used to take the Ferni user from ?user_id= on the login navigation, or from an
 * unsigned base64 state, and save the provider's tokens under it. So anyone could
 * link their own Google account into someone else's Ferni account (name the
 * victim's id), or send a victim a login link that names the attacker's id.
 *
 * Now a flow starts with an authenticated request (Bearer token, see
 * routes/oauth-start.ts) that creates a record here:
 * - bound to the verified uid and one provider, single use, expiring in 10 minutes;
 * - keyed by an opaque random state (only its SHA-256 is stored);
 * - bound to the starting browser by a random value in the __session cookie
 *   (the only cookie Firebase Hosting forwards to Cloud Run), so a state minted
 *   by one person can't be completed in someone else's browser.
 * Callbacks take the uid only from the record they consume.
 *
 * On Cloud Run (K_SERVICE set) records live in Firestore, because the start,
 * the login redirect and the callback can each reach a different instance.
 * Elsewhere (local dev, tests) they live in memory.
 *
 * @module servers/token/oauth-link-state
 */
import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'OAuthLinkState' });

export const OAUTH_LINK_TTL_MS = 10 * 60 * 1000;
/** Firebase Hosting strips every cookie except this one before Cloud Run. */
export const OAUTH_BINDING_COOKIE = '__session';
const BINDING_COOKIE_MAX_AGE_S = 60 * 60;
const BINDING_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_MEMORY_RECORDS = 1000;
const FIRESTORE_COLLECTION = 'oauth_link_states';

export interface OAuthLinkRecord {
  uid: string;
  provider: string;
  returnUrl: string;
  bindingHash: string;
  expiresAt: number;
}

export interface OAuthLinkStore {
  put(key: string, record: OAuthLinkRecord): Promise<boolean>;
  get(key: string): Promise<OAuthLinkRecord | null>;
  /** Read and delete in one step, so a record is used at most once. */
  take(key: string): Promise<OAuthLinkRecord | null>;
  /** Delete every record started by `uid` (account deletion). Throws when it can't. */
  deleteForUser(uid: string): Promise<number>;
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function createMemoryStore(): OAuthLinkStore {
  const records = new Map<string, OAuthLinkRecord>();
  return {
    async put(key, record) {
      const now = Date.now();
      for (const [k, r] of records) if (r.expiresAt < now) records.delete(k);
      if (records.size >= MAX_MEMORY_RECORDS) return false;
      records.set(key, record);
      return true;
    },
    async get(key) {
      return records.get(key) ?? null;
    },
    async take(key) {
      const record = records.get(key) ?? null;
      records.delete(key);
      return record;
    },
    async deleteForUser(uid) {
      const keys = [...records].filter(([, r]) => r.uid === uid).map(([k]) => k);
      for (const k of keys) records.delete(k);
      return keys.length;
    },
  };
}

function createFirestoreStore(): OAuthLinkStore {
  const collection = () => getFirestoreDb()?.collection(FIRESTORE_COLLECTION) ?? null;
  return {
    async put(key, record) {
      const col = collection();
      if (!col) return false;
      // ttlAt is a Timestamp (a Date in the SDK) so a Firestore TTL policy on it can
      // delete abandoned flows; TTL ignores numeric fields like expiresAt.
      await col.doc(key).set({ ...record, ttlAt: new Date(record.expiresAt) });
      return true;
    },
    async get(key) {
      const snap = await collection()?.doc(key).get();
      return snap?.exists ? (snap.data() as OAuthLinkRecord) : null;
    },
    async take(key) {
      const db = getFirestoreDb();
      if (!db) return null;
      const ref = db.collection(FIRESTORE_COLLECTION).doc(key);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return null;
        tx.delete(ref);
        return snap.data() as OAuthLinkRecord;
      });
    },
    async deleteForUser(uid) {
      const db = getFirestoreDb();
      if (!db) throw new Error('Firestore unavailable');
      const snap = await db.collection(FIRESTORE_COLLECTION).where('uid', '==', uid).get();
      // A batch holds at most 500 writes; abandoned flows can pile up until a TTL sweep.
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = db.batch();
        for (const doc of snap.docs.slice(i, i + 400)) batch.delete(doc.ref);
        await batch.commit();
      }
      return snap.docs.length;
    },
  };
}

let store: OAuthLinkStore | null = null;

function getStore(): OAuthLinkStore {
  store ??=
    process.env.K_SERVICE || process.env.OAUTH_STATE_STORE === 'firestore'
      ? createFirestoreStore()
      : createMemoryStore();
  return store;
}

/** Tests swap in a fresh store; null resets to the default. */
export function setOAuthLinkStore(next: OAuthLinkStore | null): void {
  store = next;
}

/** Forget every link flow `uid` started (account deletion). Throws when it can't. */
export async function deleteOAuthLinkStatesFor(uid: string): Promise<number> {
  return getStore().deleteForUser(uid);
}

function readCookie(req: IncomingMessage, name: string): string | null {
  const header = req.headers.cookie;
  if (typeof header !== 'string') return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

function isSecureRequest(req: IncomingMessage): boolean {
  const proto = req.headers['x-forwarded-proto'];
  return proto === 'https' || process.env.NODE_ENV === 'production';
}

/**
 * The browser-binding value for this request: the existing cookie if it is
 * ours, else a new one set on the response (reused across concurrent flows).
 */
function ensureBinding(req: IncomingMessage, res: ServerResponse): string {
  const existing = readCookie(req, OAUTH_BINDING_COOKIE);
  if (existing && BINDING_PATTERN.test(existing)) return existing;
  const binding = crypto.randomBytes(32).toString('base64url');
  // Apple returns with a cross-site form POST, which only carries SameSite=None.
  const sameSite = isSecureRequest(req) ? 'SameSite=None; Secure' : 'SameSite=Lax';
  res.setHeader(
    'Set-Cookie',
    `${OAUTH_BINDING_COOKIE}=${binding}; Path=/; HttpOnly; Max-Age=${BINDING_COOKIE_MAX_AGE_S}; ${sameSite}`
  );
  return binding;
}

/**
 * Start a link flow for a verified uid. Returns the opaque state to put in the
 * provider URL, or null when no record could be stored.
 */
export async function createOAuthLinkState(
  req: IncomingMessage,
  res: ServerResponse,
  params: { uid: string; provider: string; returnUrl: string }
): Promise<string | null> {
  const state = crypto.randomBytes(32).toString('base64url');
  const record: OAuthLinkRecord = {
    uid: params.uid,
    provider: params.provider,
    returnUrl: params.returnUrl,
    bindingHash: sha256(ensureBinding(req, res)),
    expiresAt: Date.now() + OAUTH_LINK_TTL_MS,
  };
  try {
    return (await getStore().put(sha256(state), record)) ? state : null;
  } catch (error) {
    log.error({ error: String(error), provider: params.provider }, 'Could not store OAuth state');
    return null;
  }
}

function isUsable(record: OAuthLinkRecord | null, provider: string): record is OAuthLinkRecord {
  return !!record && record.provider === provider && record.expiresAt > Date.now();
}

/**
 * For login routes: the live record this state names for this provider, left
 * in place for the callback to consume. Null for anything else.
 */
export async function peekOAuthLinkState(
  state: string | null,
  provider: string
): Promise<OAuthLinkRecord | null> {
  if (!state) return null;
  try {
    const record = await getStore().get(sha256(state));
    return isUsable(record, provider) ? record : null;
  } catch (error) {
    log.error({ error: String(error), provider }, 'Could not read OAuth state');
    return null;
  }
}

/**
 * For callbacks: consume the record (single use, even when rejected) and return
 * it only if it is for this provider, unexpired, and started in this browser.
 */
export async function consumeOAuthLinkState(
  req: IncomingMessage,
  state: string | null,
  provider: string
): Promise<OAuthLinkRecord | null> {
  if (!state) return null;
  let record: OAuthLinkRecord | null;
  try {
    record = await getStore().take(sha256(state));
  } catch (error) {
    log.error({ error: String(error), provider }, 'Could not consume OAuth state');
    return null;
  }
  if (!isUsable(record, provider)) {
    log.warn({ provider, found: !!record }, 'OAuth callback with unknown, expired or wrong state');
    return null;
  }
  const binding = readCookie(req, OAUTH_BINDING_COOKIE);
  if (!binding || sha256(binding) !== record.bindingHash) {
    log.warn({ provider }, 'OAuth callback from a browser that did not start the flow');
    return null;
  }
  return record;
}
