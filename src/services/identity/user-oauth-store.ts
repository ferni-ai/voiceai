/**
 * One per-user OAuth token store, and the one refresh handler that records a
 * revoked link.
 *
 * Extracted from the Google Calendar store (google-calendar-token-store.ts is
 * now a thin binding of it); other providers move onto it in later lanes.
 * Tokens are encrypted (utils/token-encryption, unchanged) and kept per user at
 * bogle_users/{uid}/{collection}/data, with an in-memory cache.
 *
 * When a refresh comes back `invalid_grant` (or revoked), the link is dead and
 * only the person can fix it. The store then records `needs_reauth` on the same
 * doc: when it happened and the provider's error class, never token material.
 * Nothing about the tokens changes (they are still returned), so a valid link
 * behaves exactly as before; `linkStatus` is how a status route or the UI
 * learns to say "reconnect". Saving a fresh grant (a reconnect) clears it.
 * The doc sits under bogle_users/{uid}, so account erasure removes it with the
 * rest of the record (user-stores.ts, ERASED_STORES).
 *
 * @module services/identity/user-oauth-store
 */

import { encryptData, decryptData } from '../../utils/token-encryption.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { noteLinkedTokenUse } from '../../utils/linked-token-use.js';
import { createLogger } from '../../utils/safe-logger.js';
import { resealStale } from '../../utils/token-at-rest.js';
import { createPersistenceStore } from '../persistence/index.js';
import {
  createExpiringSet,
  createReauthState,
  type DocStore,
  type LinkDoc,
  type LinkStatus,
  type ReauthOutcome,
} from './oauth-link-state.js';

const log = createLogger({ module: 'UserOAuthStore' });

export interface UserOAuthStore<T extends { refresh_token?: string }> {
  /** Cached tokens only (no I/O). Null until get has loaded them. */
  peek: (userId: string) => T | null;
  /** Tokens from cache or Firestore. Null when not connected; a miss is remembered for 60 s. */
  get: (userId: string) => Promise<T | null>;
  /** Straight from Firestore, past cache and remembered miss. Throws when it can't be read. */
  readFresh: (userId: string) => Promise<T | null>;
  /** Save (encrypted) tokens. A new grant clears needs_reauth and any refresh block. */
  save: (userId: string, tokens: T) => Promise<void>;
  /** Remove a user's tokens (disconnect). */
  remove: (userId: string) => Promise<void>;
  /** Is a link doc stored (raw, decryptable or not)? Fresh, strict: throws when it can't be read. */
  existsFresh: (userId: string) => Promise<boolean>;
  /** Every user with stored tokens: cached users plus a collection-group read. */
  listUsers: () => Promise<string[]>;
  /** Flush pending writes and clear the caches. */
  shutdown: () => Promise<void>;
  /** connected / needs_reauth / not_connected, read fresh (another process may have recorded it). `fromDoc`: the doc only, never this process's memory. */
  linkStatus: (userId: string, opts?: { fromDoc?: boolean }) => Promise<LinkStatus>;
  /** Record needs_reauth on the link doc; false when there is no link or it is already recorded. */
  markNeedsReauth: (
    userId: string,
    errorClass: string,
    failedRefreshToken: string
  ) => Promise<ReauthOutcome>;
  /** Forget the cached tokens so the next get reads Firestore. */
  evict: (userId: string) => void;
  /** A permanently failed refresh is not retried for REFRESH_BLOCK_MS. */
  isRefreshBlocked: (userId: string) => boolean;
  blockRefresh: (userId: string) => void;
  readonly provider: string;
}

/**
 * Most users never connect a given provider, and one context build asks for
 * their tokens dozens of times (Google: 47 reads for one Peter briefing). A
 * miss is trusted for MISS_TTL_MS, so a link made from another process shows
 * up within a minute; save/remove in this process clear it at once.
 */
const MISS_TTL_MS = 60_000;
const REFRESH_BLOCK_MS = 60 * 60 * 1000;

const idTag = (userId: string): string => userId.substring(0, 8);

/** With TOKEN_SEALING_KEY set, move an envelope sealed under an older key to it (best effort). */
function resealToSealingKey(
  docStore: DocStore,
  collection: string,
  userId: string,
  data: LinkDoc,
  value: object
): Promise<unknown> {
  return resealStale({
    store: collection,
    stored: data.encrypted,
    value,
    swap: (encrypted) =>
      docStore.updateIfUnchanged(userId, (cur) => cur.encrypted === data.encrypted, { encrypted }),
  });
}

export function createUserOAuthStore<T extends { refresh_token?: string }>(config: {
  provider: string;
  /** Firestore subcollection under bogle_users/{uid} */
  collection: string;
}): UserOAuthStore<T> {
  const { provider, collection } = config;

  const docStore = createPersistenceStore<LinkDoc>({
    collection,
    holdWrites: () => false, // MINOR_CARE opt-out: credentials, not the caller's words
    documentId: 'data',
    useRootCollection: false,
    syncIntervalMs: 2000,
  });

  const tokenCache = new Map<string, T>();
  const misses = createExpiringSet(MISS_TTL_MS);
  const pendingLoads = new Map<string, Promise<T | null>>();
  const reauth = createReauthState<T>(docStore);
  const blocked = createExpiringSet(REFRESH_BLOCK_MS);

  async function loadTokens(userId: string): Promise<T | null> {
    try {
      const data = await docStore.get(userId);
      if (data?.encrypted) {
        const decrypted = decryptData<T>(data.encrypted);
        if (decrypted) {
          tokenCache.set(userId, decrypted);
          void resealToSealingKey(docStore, collection, userId, data, decrypted);
          return decrypted;
        }
      }
    } catch (err) {
      log.error(
        { provider, error: (err as Error).message, userId: idTag(userId) },
        'Error loading OAuth tokens'
      );
    }
    // A save that landed while this read was in flight wins over the miss.
    const savedMeanwhile = tokenCache.get(userId);
    if (savedMeanwhile) return savedMeanwhile;
    misses.add(userId);
    return null;
  }

  async function readTokens(userId: string): Promise<T | null> {
    const cached = tokenCache.get(userId);
    if (cached) return cached;
    if (misses.has(userId)) return null;
    const pending = pendingLoads.get(userId);
    if (pending) return pending;
    const load = loadTokens(userId).finally(() => pendingLoads.delete(userId));
    pendingLoads.set(userId, load);
    return load;
  }

  return {
    provider,
    peek: (userId) => tokenCache.get(userId) ?? null,

    async get(userId) {
      const tokens = await readTokens(userId);
      noteLinkedTokenUse(provider, userId, tokens ? 'connected' : 'not_connected');
      return tokens;
    },

    async readFresh(userId) {
      const data = await docStore.load(userId, { fresh: true, strict: true });
      return data?.encrypted ? decryptData<T>(data.encrypted) : null;
    },

    async save(userId, tokens) {
      const withTimestamp = { ...tokens, updated_at: Date.now() };
      tokenCache.set(userId, withTimestamp);
      misses.delete(userId);
      reauth.forget(userId);
      blocked.delete(userId);
      try {
        const grant: LinkDoc = {
          encrypted: encryptData(withTimestamp),
          updated_at: Date.now(),
          needs_reauth: null,
        };
        await docStore.setImmediate(userId, grant, { safeWithoutRead: true }); // a new grant saves
        log.info({ provider, userId: idTag(userId) }, 'Saved OAuth tokens');
      } catch (err) {
        log.error(
          { provider, error: (err as Error).message, userId: idTag(userId) },
          'Error saving OAuth tokens'
        );
      }
    },

    async remove(userId) {
      tokenCache.delete(userId);
      misses.delete(userId);
      reauth.forget(userId);
      blocked.delete(userId);
      try {
        await docStore.delete(userId);
        log.info({ provider, userId: idTag(userId) }, 'Removed OAuth tokens');
      } catch (err) {
        log.error(
          { provider, error: (err as Error).message, userId: idTag(userId) },
          'Error removing OAuth tokens'
        );
      }
    },

    existsFresh: async (userId) =>
      (await docStore.load(userId, { fresh: true, strict: true })) !== null,

    async listUsers() {
      const users = new Set(tokenCache.keys());
      const db = getFirestoreDb();
      if (db) {
        try {
          const snapshot = await db.collectionGroup(collection).get();
          for (const doc of snapshot.docs) {
            const owner = doc.ref.parent.parent;
            if (owner?.parent.id === 'bogle_users') users.add(owner.id);
          }
        } catch (err) {
          log.warn({ provider, error: String(err) }, 'Could not list OAuth users');
        }
      }
      return [...users];
    },

    async shutdown() {
      await docStore.shutdown();
      tokenCache.clear();
      misses.clear();
      reauth.forgetAll();
      blocked.clear();
    },

    linkStatus: reauth.linkStatus,
    markNeedsReauth: reauth.markNeedsReauth,

    evict: (userId) => {
      tokenCache.delete(userId);
      misses.delete(userId);
    },

    isRefreshBlocked: (userId) => {
      const isBlocked = blocked.has(userId);
      if (isBlocked) noteLinkedTokenUse(provider, userId, 'needs_reauth');
      return isBlocked;
    },
    blockRefresh: (userId) => blocked.add(userId),
  };
}

/**
 * remove, then confirm no doc is left (raw, so an undecryptable one counts): ok false when
 * the delete failed or can't be confirmed, no database included. remove() itself only logs
 * a failed delete; its other callers keep that.
 */
export async function removeStrict<T extends { refresh_token?: string }>(
  store: UserOAuthStore<T>,
  userId: string
): Promise<{ ok: boolean }> {
  await store.remove(userId);
  try {
    return { ok: !(await store.existsFresh(userId)) };
  } catch {
    return { ok: false };
  }
}
