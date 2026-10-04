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

/** Cached tokens only (no I/O). Null until getTokens has loaded them. */
export function peekTokens(userId: string): StoredGoogleCalendarTokens | null {
  return tokenCache.get(userId) ?? null;
}

/** Tokens for a user, from cache or Firestore. Null when not connected. */
export async function getTokens(userId: string): Promise<StoredGoogleCalendarTokens | null> {
  const cached = tokenCache.get(userId);
  if (cached) return cached;

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
  return null;
}

/** Save (encrypted) tokens for a user. */
export async function saveTokens(
  userId: string,
  tokens: StoredGoogleCalendarTokens
): Promise<void> {
  const withTimestamp = { ...tokens, updated_at: Date.now() };
  tokenCache.set(userId, withTimestamp);

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
}
