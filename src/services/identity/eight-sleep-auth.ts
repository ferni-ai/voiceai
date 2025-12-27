/**
 * Eight Sleep OAuth Service
 *
 * Handles standard OAuth 2.0 authentication for Eight Sleep smart mattresses:
 * 1. Generate authorization URL
 * 2. Handle callback with authorization code
 * 3. Exchange code for tokens
 * 4. Refresh tokens automatically
 *
 * Eight Sleep uses standard redirect-based OAuth (unlike Ecobee's PIN flow).
 */

import type { Firestore as FirestoreType } from '@google-cloud/firestore';
import { getCircuitBreaker } from '../../utils/circuit-breaker.js';
import { removeUndefined, cleanForFirestore } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import type {
  EightSleepTokens,
  EightSleepTokenResponse,
  EightSleepResult,
} from './eight-sleep-types.js';

const log = createLogger({ module: 'eight-sleep-auth' });

// ============================================================================
// CONFIGURATION
// ============================================================================

const EIGHT_SLEEP_CLIENT_ID = process.env.EIGHT_SLEEP_CLIENT_ID || '';
const EIGHT_SLEEP_CLIENT_SECRET = process.env.EIGHT_SLEEP_CLIENT_SECRET || '';
const EIGHT_SLEEP_REDIRECT_URI =
  process.env.EIGHT_SLEEP_REDIRECT_URI || 'https://app.ferni.ai/auth/eight-sleep/callback';
const EIGHT_SLEEP_API_BASE = 'https://client-api.8slp.net/v1';

// Circuit breaker for Eight Sleep API
const eightSleepCircuitBreaker = getCircuitBreaker('eight-sleep-auth', {
  failureThreshold: 5,
  resetTimeout: 30_000,
  successThreshold: 2,
});

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

let db: FirestoreType | null = null;
const EIGHT_SLEEP_TOKENS_COLLECTION = 'eight_sleep_tokens';

async function getFirestore(): Promise<FirestoreType | null> {
  if (db) return db;

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    log.info('Eight Sleep OAuth Firestore initialized');
    return db;
  } catch (error) {
    log.warn({ error }, 'Firestore not available for Eight Sleep tokens');
    return null;
  }
}

// ============================================================================
// TOKEN STORAGE (In-memory cache with Firestore persistence)
// ============================================================================

const userTokens = new Map<string, EightSleepTokens>();
const loadedTokenUsers = new Set<string>();

// OAuth state storage (for CSRF protection)
const oauthStates = new Map<string, { userId: string; expiresAt: number }>();

// Failed token tracking
const failedTokenCache = new Map<string, number>();
const FAILED_TOKEN_RETRY_MS = 60 * 60 * 1000; // 1 hour

/**
 * Check if a user's token recently failed with a permanent error
 */
export function isTokenPermanentlyFailed(userId: string): boolean {
  const failedAt = failedTokenCache.get(userId);
  if (!failedAt) return false;

  if (Date.now() - failedAt > FAILED_TOKEN_RETRY_MS) {
    failedTokenCache.delete(userId);
    return false;
  }

  return true;
}

/**
 * Mark a token as permanently failed
 */
export function markTokenAsFailed(userId: string): void {
  failedTokenCache.set(userId, Date.now());
  log.warn({ userId }, 'Marked Eight Sleep token as failed - will not retry for 1 hour');
}

/**
 * Clear failed token status (after successful re-auth)
 */
export function clearFailedTokenStatus(userId: string): void {
  failedTokenCache.delete(userId);
}

// ============================================================================
// TOKEN CRUD OPERATIONS
// ============================================================================

/**
 * Store tokens for a user
 */
export async function storeUserTokens(userId: string, tokens: EightSleepTokens): Promise<void> {
  userTokens.set(userId, tokens);

  const firestore = await getFirestore();
  if (firestore) {
    try {
      await firestore
        .collection(EIGHT_SLEEP_TOKENS_COLLECTION)
        .doc(userId)
        .set(
          removeUndefined({
            ...tokens,
            updatedAt: new Date(),
          })
        );
      log.info({ userId }, 'Stored Eight Sleep tokens in Firestore');
    } catch (err) {
      log.warn({ err, userId }, 'Failed to persist Eight Sleep tokens to Firestore');
    }
  }
}

/**
 * Get tokens for a user
 */
export async function getUserTokens(userId: string): Promise<EightSleepTokens | undefined> {
  // Check cache first
  if (userTokens.has(userId)) {
    return userTokens.get(userId);
  }

  // Try loading from Firestore
  if (!loadedTokenUsers.has(userId)) {
    const firestore = await getFirestore();
    if (firestore) {
      try {
        const doc = await firestore.collection(EIGHT_SLEEP_TOKENS_COLLECTION).doc(userId).get();
        if (doc.exists) {
          const data = doc.data() as EightSleepTokens;
          userTokens.set(userId, data);
          loadedTokenUsers.add(userId);
          return data;
        }
      } catch (err) {
        log.warn({ err, userId }, 'Failed to load Eight Sleep tokens from Firestore');
      }
    }
    loadedTokenUsers.add(userId);
  }

  return userTokens.get(userId);
}

/**
 * Delete user tokens (disconnect)
 */
export async function deleteUserTokens(userId: string): Promise<void> {
  userTokens.delete(userId);
  loadedTokenUsers.delete(userId);
  clearFailedTokenStatus(userId);

  const firestore = await getFirestore();
  if (firestore) {
    try {
      await firestore.collection(EIGHT_SLEEP_TOKENS_COLLECTION).doc(userId).delete();
      log.info({ userId }, 'Eight Sleep tokens deleted');
    } catch (error) {
      log.warn({ error, userId }, 'Failed to delete Eight Sleep tokens from Firestore');
    }
  }
}

/**
 * Check if tokens are expired
 */
export function areTokensExpired(tokens: EightSleepTokens): boolean {
  // Consider expired 5 minutes early
  return Date.now() >= tokens.expires_at - 5 * 60 * 1000;
}

// ============================================================================
// OAUTH FLOW
// ============================================================================

/**
 * Generate OAuth authorization URL
 */
export function getAuthorizationUrl(userId: string): EightSleepResult<{ url: string }> {
  if (!EIGHT_SLEEP_CLIENT_ID) {
    return { success: false, error: 'Eight Sleep client ID not configured' };
  }

  // Generate state for CSRF protection
  const state = crypto.randomUUID();
  oauthStates.set(cleanForFirestore(state), {
    userId,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
  });

  // Clean up old states
  for (const [key, value] of oauthStates.entries()) {
    if (Date.now() > value.expiresAt) {
      oauthStates.delete(key);
    }
  }

  const params = new URLSearchParams({
    client_id: EIGHT_SLEEP_CLIENT_ID,
    redirect_uri: EIGHT_SLEEP_REDIRECT_URI,
    response_type: 'code',
    state,
  });

  const url = `${EIGHT_SLEEP_API_BASE}/oauth/authorize?${params}`;

  log.info({ userId }, 'Generated Eight Sleep authorization URL');

  return { success: true, data: { url } };
}

/**
 * Validate OAuth state and get associated user
 */
export function validateOAuthState(state: string): string | null {
  const stateData = oauthStates.get(state);

  if (!stateData) {
    log.warn({ state }, 'Unknown OAuth state');
    return null;
  }

  if (Date.now() > stateData.expiresAt) {
    oauthStates.delete(state);
    log.warn({ state }, 'OAuth state expired');
    return null;
  }

  oauthStates.delete(state);
  return stateData.userId;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  userId: string
): Promise<EightSleepResult<EightSleepTokens>> {
  if (!EIGHT_SLEEP_CLIENT_ID || !EIGHT_SLEEP_CLIENT_SECRET) {
    return { success: false, error: 'Eight Sleep credentials not configured' };
  }

  try {
    const result = await eightSleepCircuitBreaker.execute(async () => {
      const response = await fetch(`${EIGHT_SLEEP_API_BASE}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: EIGHT_SLEEP_CLIENT_ID,
          client_secret: EIGHT_SLEEP_CLIENT_SECRET,
          redirect_uri: EIGHT_SLEEP_REDIRECT_URI,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        log.error({ status: response.status, error }, 'Failed to exchange Eight Sleep code');
        throw new Error(`Token exchange failed: ${error}`);
      }

      const tokenData = (await response.json()) as EightSleepTokenResponse;

      return {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: Date.now() + tokenData.expires_in * 1000,
        user_id: tokenData.userId,
      };
    });

    await storeUserTokens(userId, result);
    clearFailedTokenStatus(userId);

    log.info({ userId }, 'Eight Sleep authorization successful');

    return { success: true, data: result };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Error exchanging Eight Sleep code');
    return { success: false, error: 'Failed to connect to Eight Sleep' };
  }
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<EightSleepTokens> {
  if (!EIGHT_SLEEP_CLIENT_ID || !EIGHT_SLEEP_CLIENT_SECRET) {
    throw new Error('Eight Sleep credentials not configured');
  }

  const response = await fetch(`${EIGHT_SLEEP_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: EIGHT_SLEEP_CLIENT_ID,
      client_secret: EIGHT_SLEEP_CLIENT_SECRET,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    log.warn({ status: response.status, error }, 'Failed to refresh Eight Sleep token');
    throw new Error(`Token refresh failed: ${error}`);
  }

  const tokenData = (await response.json()) as EightSleepTokenResponse;

  return {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: Date.now() + tokenData.expires_in * 1000,
    user_id: tokenData.userId,
  };
}

/**
 * Get valid access token for a user (refreshes if needed)
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  // Check if token is known to be permanently failed
  if (isTokenPermanentlyFailed(userId)) {
    log.debug({ userId }, 'Skipping Eight Sleep token - marked as permanently failed');
    return null;
  }

  let tokens = await getUserTokens(userId);
  if (!tokens) {
    log.debug({ userId }, 'No Eight Sleep tokens found for user');
    return null;
  }

  if (areTokensExpired(tokens)) {
    if (!tokens.refresh_token) {
      log.warn({ userId }, 'Eight Sleep tokens expired and no refresh token available');
      return null;
    }

    try {
      tokens = await refreshAccessToken(tokens.refresh_token);
      await storeUserTokens(userId, tokens);
      log.info({ userId }, 'Eight Sleep token refreshed successfully');
    } catch (error) {
      markTokenAsFailed(userId);
      log.warn(
        { userId, error: String(error) },
        'Failed to refresh Eight Sleep token - user needs to re-authenticate'
      );
      return null;
    }
  }

  return tokens.access_token;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Check if Eight Sleep is configured for a user
 */
export async function isEightSleepConfigured(userId: string): Promise<boolean> {
  const tokens = await getUserTokens(userId);
  return !!tokens;
}

/**
 * Check if Eight Sleep API is configured (application-level)
 */
export function isApiConfigured(): boolean {
  return !!EIGHT_SLEEP_CLIENT_ID && !!EIGHT_SLEEP_CLIENT_SECRET;
}

/**
 * Get all users with connected Eight Sleep
 */
export async function getAllEightSleepUsers(): Promise<string[]> {
  const userIds: string[] = [];

  // Add cached users
  for (const userId of userTokens.keys()) {
    userIds.push(userId);
  }

  // Check Firestore
  const firestore = await getFirestore();
  if (firestore) {
    try {
      const snapshot = await firestore.collection(EIGHT_SLEEP_TOKENS_COLLECTION).get();
      for (const doc of snapshot.docs) {
        if (!userIds.includes(doc.id)) {
          userIds.push(doc.id);
        }
      }
    } catch (error) {
      log.warn({ error }, 'Failed to get Eight Sleep users from Firestore');
    }
  }

  return userIds;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // OAuth flow
  getAuthorizationUrl,
  validateOAuthState,
  exchangeCodeForTokens,
  refreshAccessToken,
  getValidAccessToken,

  // Token management
  storeUserTokens,
  getUserTokens,
  deleteUserTokens,
  areTokensExpired,

  // Status checks
  isEightSleepConfigured,
  isApiConfigured,
  getAllEightSleepUsers,

  // Failed token tracking
  isTokenPermanentlyFailed,
  markTokenAsFailed,
  clearFailedTokenStatus,

  // Circuit breaker for external use
  eightSleepCircuitBreaker,
};
