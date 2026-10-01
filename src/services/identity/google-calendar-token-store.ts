/**
 * Google Calendar token storage: in-memory cache, encrypted per-user store
 * (google-calendar-linked-tokens) and the legacy plaintext Firestore
 * collection, plus failed-token tracking. Extracted from google-calendar-oauth.ts.
 */

import type { Firestore as FirestoreType } from '@google-cloud/firestore';
import { getLogger } from '../../utils/safe-logger.js';
import type { OAuthTokens } from '../../utils/token-encryption.js';
import * as linkedTokens from './google-calendar-linked-tokens.js';
import type { GoogleTokens } from './google-calendar-types.js';

let db: FirestoreType | null = null;
// FIX: Promise-based singleton to prevent race condition
let dbInitPromise: Promise<FirestoreType | null> | null = null;
// Legacy plaintext store: google_calendar_tokens/{userId} (root collection).
// The authoritative store is the encrypted per-user one the web OAuth flow
// writes (bogle_users/{userId}/google_calendar_tokens/data, see
// google-calendar-linked-tokens.ts). Legacy docs are read as a fallback and
// migrate to the encrypted store on their next refresh.
const OAUTH_TOKENS_COLLECTION = 'google_calendar_tokens';

async function getFirestore(): Promise<FirestoreType | null> {
  if (db) return db;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = initializeFirestore();
  return dbInitPromise;
}

async function initializeFirestore(): Promise<FirestoreType | null> {
  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    getLogger().info('Google Calendar OAuth Firestore initialized');
    return db;
  } catch (error) {
    getLogger().warn({ error }, 'Firestore not available for OAuth tokens, using in-memory only');
    dbInitPromise = null; // Allow retry
    return null;
  }
}

// ============================================================================
// TOKEN STORAGE (In-memory cache with Firestore persistence)
// ============================================================================

const userTokens = new Map<string, GoogleTokens>();
const loadedTokenUsers = new Set<string>();

// ============================================================================
// FAILED TOKEN TRACKING - Prevents spam when tokens are permanently invalid
// ============================================================================

/**
 * Cache of tokens that failed with permanent errors (like invalid_grant).
 * Maps userId -> timestamp when they failed. We won't retry for 1 hour.
 */
const failedTokenCache = new Map<string, number>();
const FAILED_TOKEN_RETRY_MS = 60 * 60 * 1000; // 1 hour before retry

/**
 * Check if a user's token recently failed with a permanent error
 */
export function isTokenPermanentlyFailed(userId: string): boolean {
  const failedAt = failedTokenCache.get(userId);
  if (!failedAt) return false;

  // Allow retry after FAILED_TOKEN_RETRY_MS
  if (Date.now() - failedAt > FAILED_TOKEN_RETRY_MS) {
    failedTokenCache.delete(userId);
    return false;
  }

  return true;
}

/**
 * Mark a token as permanently failed (e.g., invalid_grant)
 */
export function markTokenAsFailed(userId: string): void {
  failedTokenCache.set(userId, Date.now());
  getLogger().warn({ userId }, 'Marked OAuth token as failed - will not retry for 1 hour');
}

/**
 * Clear the failed token status for a user (e.g., after successful re-auth)
 */
export function clearFailedTokenStatus(userId: string): void {
  failedTokenCache.delete(userId);
}

function fromLinkedTokens(tokens: OAuthTokens): GoogleTokens {
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || undefined,
    expires_in: Math.max(0, Math.round((tokens.expires_at - Date.now()) / 1000)),
    token_type: 'Bearer',
    scope: tokens.scope,
    expiry_date: tokens.expires_at,
  };
}

function toLinkedTokens(tokens: GoogleTokens): OAuthTokens {
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? '',
    expires_at: tokens.expiry_date ?? Date.now() + tokens.expires_in * 1000,
    scope: tokens.scope,
  };
}

/**
 * Store tokens for a user (in the encrypted per-user store)
 */
export async function storeUserTokens(userId: string, tokens: GoogleTokens): Promise<void> {
  // Calculate expiry date if not present
  if (!tokens.expiry_date && tokens.expires_in) {
    tokens.expiry_date = Date.now() + tokens.expires_in * 1000;
  }
  userTokens.set(userId, tokens);

  await linkedTokens.saveTokens(userId, toLinkedTokens(tokens));
  getLogger().info(
    { userId, hasRefreshToken: !!tokens.refresh_token },
    'Stored Google tokens (encrypted per-user store)'
  );
}

/**
 * Read a legacy plaintext token doc (root google_calendar_tokens/{userId})
 */
export async function getLegacyUserTokens(userId: string): Promise<GoogleTokens | undefined> {
  if (!loadedTokenUsers.has(userId)) {
    const firestore = await getFirestore();
    if (firestore) {
      try {
        const doc = await firestore.collection(OAUTH_TOKENS_COLLECTION).doc(userId).get();
        if (doc.exists) {
          const data = doc.data() as GoogleTokens;
          userTokens.set(userId, data);
          loadedTokenUsers.add(userId);
          getLogger().info({ userId }, 'Using legacy Google Calendar tokens (root collection)');
          return data;
        }
      } catch (err) {
        getLogger().warn({ err, userId }, 'Failed to load Google tokens from Firestore');
      }
    }
    loadedTokenUsers.add(userId);
  }

  return userTokens.get(userId);
}

/**
 * Get tokens for a user: the encrypted per-user store written by the web
 * OAuth flow, else the legacy plaintext root collection.
 */
export async function getUserTokens(userId: string): Promise<GoogleTokens | undefined> {
  const linked = await linkedTokens.getTokens(userId);
  if (linked) {
    return fromLinkedTokens(linked);
  }

  return getLegacyUserTokens(userId);
}

/**
 * Get tokens synchronously (returns cached value only)
 * Use getUserTokens for guaranteed data
 */
export function getUserTokensSync(userId: string): GoogleTokens | undefined {
  // Trigger async load in background
  void getUserTokens(userId);
  return userTokens.get(userId);
}

/**
 * Check if tokens are expired
 */
export function areTokensExpired(tokens: GoogleTokens): boolean {
  if (!tokens.expiry_date) return false;
  // Consider expired 5 minutes before actual expiry
  return Date.now() >= tokens.expiry_date - 5 * 60 * 1000;
}

/**
 * Check if calendar is configured for a user
 */
export async function isCalendarConfigured(userId: string): Promise<boolean> {
  const tokens = await getUserTokens(userId);
  return !!tokens;
}

/**
 * Check if calendar is configured (sync version, may return false until loaded)
 */
export function isCalendarConfiguredSync(userId: string): boolean {
  return !!getUserTokensSync(userId);
}

/**
 * Delete user tokens (for disconnect)
 */
export async function deleteUserTokens(userId: string): Promise<void> {
  // Remove from cache
  userTokens.delete(userId);
  loadedTokenUsers.delete(userId);

  await linkedTokens.removeTokens(userId);

  // Remove the legacy plaintext doc too
  const firestore = await getFirestore();
  if (firestore) {
    try {
      const docRef = firestore.collection(OAUTH_TOKENS_COLLECTION).doc(userId);
      await docRef.delete();
      getLogger().info({ userId }, 'Calendar tokens deleted');
    } catch (error) {
      getLogger().warn({ error, userId }, 'Failed to delete calendar tokens from Firestore');
    }
  }
}

/**
 * Get all users with connected Google Calendar
 *
 * Used by maintenance scheduler to sync calendar events for outreach timing.
 */
export async function getAllCalendarUsers(): Promise<string[]> {
  const userIds: string[] = [];

  // First add all cached users
  for (const userId of userTokens.keys()) {
    userIds.push(userId);
  }

  // Then check Firestore for any not in cache. The collection group covers
  // both the per-user store (bogle_users/{uid}/google_calendar_tokens/data)
  // and legacy root docs (google_calendar_tokens/{uid}).
  const firestore = await getFirestore();
  if (firestore) {
    try {
      const snapshot = await firestore.collectionGroup(OAUTH_TOKENS_COLLECTION).get();
      for (const doc of snapshot.docs) {
        const userId = doc.ref.parent.parent?.id ?? doc.id;
        if (!userIds.includes(userId)) {
          userIds.push(userId);
        }
      }
    } catch (error) {
      getLogger().warn({ error }, 'Failed to get calendar users from Firestore');
    }
  }

  return userIds;
}
