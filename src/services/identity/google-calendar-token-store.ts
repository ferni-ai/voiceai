/**
 * The one store for Google Calendar OAuth tokens.
 *
 * Tokens are encrypted (utils/token-encryption) and kept per user at
 * bogle_users/{uid}/google_calendar_tokens/data, with an in-memory cache.
 *
 * There used to be two stores. The connect flow (/auth/google/* in
 * servers/api/routes/google-calendar.ts) wrote here, while every reader
 * (calendar service and providers, webhooks, reminders, busy detection,
 * Gmail, the v1 integrations status) read a second, plaintext root
 * collection `google_calendar_tokens/{uid}` that only the old v1 integrations
 * callback wrote. So a user who connected Google Calendar was invisible to
 * every calendar feature. The root collection is no longer read or written;
 * services/identity/google-calendar-oauth.ts and servers/token/oauth/
 * google-calendar.ts both go through this module.
 *
 * @module services/identity/google-calendar-token-store
 */

import { encryptData, decryptData } from '../../utils/token-encryption.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { createPersistenceStore } from '../persistence/index.js';

const log = createLogger({ module: 'GoogleCalendarTokenStore' });

const COLLECTION = 'google_calendar_tokens';

/** Google Calendar OAuth tokens as stored. */
export interface StoredGoogleCalendarTokens {
  access_token: string;
  refresh_token: string;
  /** Epoch ms when access_token expires. */
  expires_at: number;
  scope?: string;
  updated_at?: number;
}

interface EncryptedTokenData {
  encrypted: string;
  updated_at: number;
}

const tokenStore = createPersistenceStore<EncryptedTokenData>({
  collection: COLLECTION,
  documentId: 'data',
  useRootCollection: false, // bogle_users/{uid}/google_calendar_tokens/data
  syncIntervalMs: 2000,
});

const tokenCache = new Map<string, StoredGoogleCalendarTokens>();

/**
 * Most users never connect Google Calendar, and one context build asks for
 * their tokens dozens of times (week overview, day overview, busy detection,
 * ...). Without remembering the miss, each ask was a Firestore read: 47 reads
 * for one Peter briefing. A miss is trusted for MISS_TTL_MS, so a calendar
 * connected from another process (the API server) shows up within a minute;
 * saveTokens/removeTokens in this process clear it at once.
 */
const MISS_TTL_MS = 60_000;
const MAX_MISS_ENTRIES = 10_000;
const missUntil = new Map<string, number>();
const pendingLoads = new Map<string, Promise<StoredGoogleCalendarTokens | null>>();

function rememberMiss(userId: string): void {
  if (missUntil.size >= MAX_MISS_ENTRIES) {
    const now = Date.now();
    for (const [id, until] of missUntil) if (until <= now) missUntil.delete(id);
    if (missUntil.size >= MAX_MISS_ENTRIES) missUntil.clear();
  }
  missUntil.set(userId, Date.now() + MISS_TTL_MS);
}

function isKnownMiss(userId: string): boolean {
  const until = missUntil.get(userId);
  if (until === undefined) return false;
  if (until > Date.now()) return true;
  missUntil.delete(userId);
  return false;
}

/** Cached tokens only (no I/O). Null until getTokens has loaded them. */
export function peekTokens(userId: string): StoredGoogleCalendarTokens | null {
  return tokenCache.get(userId) ?? null;
}

/**
 * Tokens for a user, from cache or Firestore. Null when not connected.
 * Concurrent first callers share one read; a miss is remembered (see MISS_TTL_MS).
 */
export async function getTokens(userId: string): Promise<StoredGoogleCalendarTokens | null> {
  const cached = tokenCache.get(userId);
  if (cached) return cached;
  if (isKnownMiss(userId)) return null;

  const pending = pendingLoads.get(userId);
  if (pending) return pending;

  const load = loadTokens(userId).finally(() => pendingLoads.delete(userId));
  pendingLoads.set(userId, load);
  return load;
}

async function loadTokens(userId: string): Promise<StoredGoogleCalendarTokens | null> {
  try {
    const data = await tokenStore.get(userId);
    if (data?.encrypted) {
      const decrypted = decryptData<StoredGoogleCalendarTokens>(data.encrypted);
      if (decrypted) {
        tokenCache.set(userId, decrypted);
        return decrypted;
      }
    }
  } catch (err) {
    log.error(
      { error: (err as Error).message, userId: userId.substring(0, 8) },
      'Error loading Google Calendar tokens'
    );
  }
  // A save that landed while this read was in flight wins over the miss.
  const savedMeanwhile = tokenCache.get(userId);
  if (savedMeanwhile) return savedMeanwhile;
  rememberMiss(userId);
  return null;
}

/** Save (encrypted) tokens for a user. */
export async function saveTokens(
  userId: string,
  tokens: StoredGoogleCalendarTokens
): Promise<void> {
  const withTimestamp = { ...tokens, updated_at: Date.now() };
  tokenCache.set(userId, withTimestamp);
  missUntil.delete(userId);

  try {
    await tokenStore.setImmediate(userId, {
      encrypted: encryptData(withTimestamp),
      updated_at: Date.now(),
    });
    log.info({ userId: userId.substring(0, 8) }, 'Saved Google Calendar tokens');
  } catch (err) {
    log.error(
      { error: (err as Error).message, userId: userId.substring(0, 8) },
      'Error saving Google Calendar tokens'
    );
  }
}

/** Remove a user's tokens (disconnect). */
export async function removeTokens(userId: string): Promise<void> {
  tokenCache.delete(userId);
  missUntil.delete(userId);
  try {
    await tokenStore.delete(userId);
    log.info({ userId: userId.substring(0, 8) }, 'Removed Google Calendar tokens');
  } catch (err) {
    log.error(
      { error: (err as Error).message, userId: userId.substring(0, 8) },
      'Error removing Google Calendar tokens'
    );
  }
}

/**
 * Every user with stored tokens: cached users plus a collection-group read of
 * bogle_users/{uid}/google_calendar_tokens (the old root collection of the
 * same name is skipped).
 */
export async function listTokenUsers(): Promise<string[]> {
  const users = new Set(tokenCache.keys());
  const db = getFirestoreDb();
  if (db) {
    try {
      const snapshot = await db.collectionGroup(COLLECTION).get();
      for (const doc of snapshot.docs) {
        const owner = doc.ref.parent.parent;
        if (owner?.parent.id === 'bogle_users') users.add(owner.id);
      }
    } catch (err) {
      log.warn({ error: String(err) }, 'Could not list Google Calendar users');
    }
  }
  return [...users];
}

/** Flush pending writes and clear the cache. */
export async function shutdownTokenStore(): Promise<void> {
  await tokenStore.shutdown();
  tokenCache.clear();
  missUntil.clear();
}
