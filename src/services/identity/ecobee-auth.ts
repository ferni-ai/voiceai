/**
 * Ecobee OAuth Service
 *
 * Handles PIN-based OAuth 2.0 authentication for Ecobee thermostats:
 * 1. Request PIN from Ecobee
 * 2. User enters PIN at ecobee.com/consumerportal
 * 3. Poll Ecobee to exchange code for tokens
 * 4. Refresh tokens automatically
 *
 * PIN-based flow is simpler than redirect OAuth for voice-first devices.
 */

import type { Firestore as FirestoreType } from '@google-cloud/firestore';
import { getCircuitBreaker } from '../../utils/circuit-breaker.js';
import { removeUndefined } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import type {
  EcobeeTokens,
  EcobeeAuthorizeResponse,
  EcobeeTokenResponse,
  EcobeePendingAuth,
  EcobeeResult,
} from './ecobee-types.js';

const log = createLogger({ module: 'ecobee-auth' });

// ============================================================================
// CONFIGURATION
// ============================================================================

const ECOBEE_API_KEY = process.env.ECOBEE_API_KEY || '';
const ECOBEE_API_BASE = 'https://api.ecobee.com';
const ECOBEE_AUTH_BASE = 'https://api.ecobee.com';

// Token scopes
const ECOBEE_SCOPE = 'smartWrite'; // Read and write thermostat data

// Circuit breaker for Ecobee API
const ecobeeCircuitBreaker = getCircuitBreaker('ecobee', {
  failureThreshold: 5,
  resetTimeout: 30_000,
  successThreshold: 2,
});

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

let db: FirestoreType | null = null;
const ECOBEE_TOKENS_COLLECTION = 'ecobee_tokens';
const ECOBEE_PENDING_AUTH_COLLECTION = 'ecobee_pending_auth';

async function getFirestore(): Promise<FirestoreType | null> {
  if (db) return db;

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    log.info('Ecobee OAuth Firestore initialized');
    return db;
  } catch (error) {
    log.warn({ error }, 'Firestore not available for Ecobee tokens');
    return null;
  }
}

// ============================================================================
// TOKEN STORAGE (In-memory cache with Firestore persistence)
// ============================================================================

const userTokens = new Map<string, EcobeeTokens>();
const loadedTokenUsers = new Set<string>();

// Pending auth sessions (for PIN polling)
const pendingAuth = new Map<string, EcobeePendingAuth>();

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
  log.warn({ userId }, 'Marked Ecobee token as failed - will not retry for 1 hour');
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
export async function storeUserTokens(userId: string, tokens: EcobeeTokens): Promise<void> {
  userTokens.set(userId, tokens);

  const firestore = await getFirestore();
  if (firestore) {
    try {
      await firestore
        .collection(ECOBEE_TOKENS_COLLECTION)
        .doc(userId)
        .set(
          removeUndefined({
            ...tokens,
            updatedAt: new Date(),
          })
        );
      log.info({ userId }, 'Stored Ecobee tokens in Firestore');
    } catch (err) {
      log.warn({ err, userId }, 'Failed to persist Ecobee tokens to Firestore');
    }
  }
}

/**
 * Get tokens for a user
 */
export async function getUserTokens(userId: string): Promise<EcobeeTokens | undefined> {
  // Check cache first
  if (userTokens.has(userId)) {
    return userTokens.get(userId);
  }

  // Try loading from Firestore
  if (!loadedTokenUsers.has(userId)) {
    const firestore = await getFirestore();
    if (firestore) {
      try {
        const doc = await firestore.collection(ECOBEE_TOKENS_COLLECTION).doc(userId).get();
        if (doc.exists) {
          const data = doc.data() as EcobeeTokens;
          userTokens.set(userId, data);
          loadedTokenUsers.add(userId);
          return data;
        }
      } catch (err) {
        log.warn({ err, userId }, 'Failed to load Ecobee tokens from Firestore');
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
      await firestore.collection(ECOBEE_TOKENS_COLLECTION).doc(userId).delete();
      log.info({ userId }, 'Ecobee tokens deleted');
    } catch (error) {
      log.warn({ error, userId }, 'Failed to delete Ecobee tokens from Firestore');
    }
  }
}

/**
 * Check if tokens are expired
 */
export function areTokensExpired(tokens: EcobeeTokens): boolean {
  // Consider expired 5 minutes early
  return Date.now() >= tokens.expires_at - 5 * 60 * 1000;
}

// ============================================================================
// PIN-BASED OAUTH FLOW
// ============================================================================

/**
 * Step 1: Request a PIN for the user to enter at ecobee.com
 */
export async function requestPin(
  userId: string
): Promise<EcobeeResult<{ pin: string; expiresIn: number }>> {
  if (!ECOBEE_API_KEY) {
    return { success: false, error: 'Ecobee API key not configured' };
  }

  try {
    const params = new URLSearchParams({
      response_type: 'ecobeePin',
      client_id: ECOBEE_API_KEY,
      scope: ECOBEE_SCOPE,
    });

    const response = await fetch(`${ECOBEE_AUTH_BASE}/authorize?${params}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const error = await response.text();
      log.error({ status: response.status, error }, 'Failed to request Ecobee PIN');
      return { success: false, error: 'Failed to get authorization PIN' };
    }

    const data = (await response.json()) as EcobeeAuthorizeResponse;

    // Store pending auth for polling
    const pending: EcobeePendingAuth = {
      code: data.code,
      pin: data.ecobeePin,
      expiresAt: Date.now() + data.expires_in * 60 * 1000, // expires_in is in minutes
      interval: data.interval,
      userId,
    };

    pendingAuth.set(userId, pending);

    // Also persist to Firestore for resumption
    const firestore = await getFirestore();
    if (firestore) {
      await firestore.collection(ECOBEE_PENDING_AUTH_COLLECTION).doc(userId).set(pending);
    }

    log.info({ userId, pin: data.ecobeePin, expiresIn: data.expires_in }, 'Ecobee PIN generated');

    return {
      success: true,
      data: {
        pin: data.ecobeePin,
        expiresIn: data.expires_in, // Minutes
      },
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Error requesting Ecobee PIN');
    return { success: false, error: 'Failed to connect to Ecobee' };
  }
}

/**
 * Step 2: Poll to check if user has authorized (call after user enters PIN)
 */
export async function checkAuthorization(
  userId: string
): Promise<EcobeeResult<{ authorized: boolean }>> {
  if (!ECOBEE_API_KEY) {
    return { success: false, error: 'Ecobee API key not configured' };
  }

  // Get pending auth
  let pending = pendingAuth.get(userId);

  // Try loading from Firestore if not in memory
  if (!pending) {
    const firestore = await getFirestore();
    if (firestore) {
      try {
        const doc = await firestore.collection(ECOBEE_PENDING_AUTH_COLLECTION).doc(userId).get();
        if (doc.exists) {
          pending = doc.data() as EcobeePendingAuth;
          pendingAuth.set(userId, pending);
        }
      } catch (err) {
        log.warn({ err, userId }, 'Failed to load pending auth from Firestore');
      }
    }
  }

  if (!pending) {
    return { success: false, error: 'No pending authorization. Please request a new PIN.' };
  }

  // Check if expired
  if (Date.now() > pending.expiresAt) {
    pendingAuth.delete(userId);
    const firestore = await getFirestore();
    if (firestore) {
      await firestore.collection(ECOBEE_PENDING_AUTH_COLLECTION).doc(userId).delete();
    }
    return { success: false, error: 'PIN expired. Please request a new PIN.' };
  }

  try {
    // Try to exchange code for tokens
    const params = new URLSearchParams({
      grant_type: 'ecobeePin',
      code: pending.code,
      client_id: ECOBEE_API_KEY,
    });

    const response = await fetch(`${ECOBEE_AUTH_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: string };

      // authorization_pending means user hasn't entered PIN yet
      if (errorData.error === 'authorization_pending') {
        return { success: true, data: { authorized: false } };
      }

      // slow_down means we're polling too fast
      if (errorData.error === 'slow_down') {
        log.debug({ userId }, 'Ecobee: slow down polling');
        return { success: true, data: { authorized: false } };
      }

      // Other errors are failures
      log.error({ status: response.status, error: errorData }, 'Ecobee token exchange failed');
      return { success: false, error: 'Authorization failed. Please try again.' };
    }

    // Success! Store tokens
    const tokenData = (await response.json()) as EcobeeTokenResponse;

    const tokens: EcobeeTokens = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: Date.now() + tokenData.expires_in * 1000,
      token_type: tokenData.token_type,
      scope: tokenData.scope,
    };

    await storeUserTokens(userId, tokens);

    // Clean up pending auth
    pendingAuth.delete(userId);
    const firestore = await getFirestore();
    if (firestore) {
      await firestore.collection(ECOBEE_PENDING_AUTH_COLLECTION).doc(userId).delete();
    }

    clearFailedTokenStatus(userId);
    log.info({ userId }, 'Ecobee authorization successful');

    return { success: true, data: { authorized: true } };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Error checking Ecobee authorization');
    return { success: false, error: 'Failed to check authorization status' };
  }
}

/**
 * Get pending authorization status
 */
export async function getPendingAuth(userId: string): Promise<EcobeePendingAuth | null> {
  let pending = pendingAuth.get(userId);

  if (!pending) {
    const firestore = await getFirestore();
    if (firestore) {
      try {
        const doc = await firestore.collection(ECOBEE_PENDING_AUTH_COLLECTION).doc(userId).get();
        if (doc.exists) {
          pending = doc.data() as EcobeePendingAuth;
          // Check if expired
          if (Date.now() <= pending.expiresAt) {
            pendingAuth.set(userId, pending);
          } else {
            // Clean up expired
            await firestore.collection(ECOBEE_PENDING_AUTH_COLLECTION).doc(userId).delete();
            pending = undefined;
          }
        }
      } catch (err) {
        log.warn({ err, userId }, 'Failed to load pending auth');
      }
    }
  }

  if (pending && Date.now() > pending.expiresAt) {
    pendingAuth.delete(userId);
    return null;
  }

  return pending || null;
}

// ============================================================================
// TOKEN REFRESH
// ============================================================================

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<EcobeeTokens> {
  if (!ECOBEE_API_KEY) {
    throw new Error('Ecobee API key not configured');
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: ECOBEE_API_KEY,
  });

  const response = await fetch(`${ECOBEE_AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  if (!response.ok) {
    const error = await response.text();
    log.warn({ status: response.status, error }, 'Failed to refresh Ecobee token');
    throw new Error(`Token refresh failed: ${error}`);
  }

  const tokenData = (await response.json()) as EcobeeTokenResponse;

  return {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: Date.now() + tokenData.expires_in * 1000,
    token_type: tokenData.token_type,
    scope: tokenData.scope,
  };
}

/**
 * Get valid access token for a user (refreshes if needed)
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  // Check if token is known to be permanently failed
  if (isTokenPermanentlyFailed(userId)) {
    log.debug({ userId }, 'Skipping Ecobee token - marked as permanently failed');
    return null;
  }

  let tokens = await getUserTokens(userId);
  if (!tokens) {
    log.debug({ userId }, 'No Ecobee tokens found for user');
    return null;
  }

  if (areTokensExpired(tokens)) {
    if (!tokens.refresh_token) {
      log.warn({ userId }, 'Ecobee tokens expired and no refresh token available');
      return null;
    }

    try {
      tokens = await refreshAccessToken(tokens.refresh_token);
      await storeUserTokens(userId, tokens);
      log.info({ userId }, 'Ecobee token refreshed successfully');
    } catch (error) {
      markTokenAsFailed(userId);
      log.warn(
        { userId, error: String(error) },
        'Failed to refresh Ecobee token - user needs to re-authenticate'
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
 * Check if Ecobee is configured for a user
 */
export async function isEcobeeConfigured(userId: string): Promise<boolean> {
  const tokens = await getUserTokens(userId);
  return !!tokens;
}

/**
 * Check if Ecobee API is configured (application-level)
 */
export function isApiConfigured(): boolean {
  return !!ECOBEE_API_KEY;
}

/**
 * Get all users with connected Ecobee
 */
export async function getAllEcobeeUsers(): Promise<string[]> {
  const userIds: string[] = [];

  // Add cached users
  for (const userId of userTokens.keys()) {
    userIds.push(userId);
  }

  // Check Firestore
  const firestore = await getFirestore();
  if (firestore) {
    try {
      const snapshot = await firestore.collection(ECOBEE_TOKENS_COLLECTION).get();
      for (const doc of snapshot.docs) {
        if (!userIds.includes(doc.id)) {
          userIds.push(doc.id);
        }
      }
    } catch (error) {
      log.warn({ error }, 'Failed to get Ecobee users from Firestore');
    }
  }

  return userIds;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // OAuth flow
  requestPin,
  checkAuthorization,
  getPendingAuth,
  refreshAccessToken,
  getValidAccessToken,

  // Token management
  storeUserTokens,
  getUserTokens,
  deleteUserTokens,
  areTokensExpired,

  // Status checks
  isEcobeeConfigured,
  isApiConfigured,
  getAllEcobeeUsers,

  // Failed token tracking
  isTokenPermanentlyFailed,
  markTokenAsFailed,
  clearFailedTokenStatus,

  // Circuit breaker for external use
  ecobeeCircuitBreaker,
};
