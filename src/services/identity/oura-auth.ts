/**
 * Oura Ring OAuth Service
 *
 * OAuth 2.0 flow for Oura Ring wearable integration.
 * Provides access to sleep, readiness, and activity data.
 *
 * OAuth Flow:
 * 1. Generate authorization URL with state
 * 2. User authorizes at cloud.ouraring.com
 * 3. Oura redirects with code
 * 4. Exchange code for tokens
 * 5. Store tokens in Firestore
 */

import crypto from 'node:crypto';
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../superhuman/firestore-utils.js';
import type { OuraTokens, OuraTokenResponse, OuraResult } from './oura-types.js';

const log = createLogger({ module: 'oura-auth' });

// ============================================================================
// CONFIGURATION
// ============================================================================

const OURA_CLIENT_ID = process.env.OURA_CLIENT_ID || '';
const OURA_CLIENT_SECRET = process.env.OURA_CLIENT_SECRET || '';
const OURA_REDIRECT_URI = process.env.OURA_REDIRECT_URI || '';

const OURA_AUTH_URL = 'https://cloud.ouraring.com/oauth/authorize';
const OURA_TOKEN_URL = 'https://api.ouraring.com/oauth/token';

const FIRESTORE_COLLECTION = 'oura_tokens';
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

// State storage (in production, use Redis)
const pendingStates = new Map<string, { userId: string; createdAt: number }>();

// Track failed tokens to avoid repeated refresh attempts
const failedTokens = new Map<string, number>();
const FAILED_TOKEN_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

// Token cache
const tokenCache = new Map<string, OuraTokens>();

// ============================================================================
// CONFIGURATION CHECK
// ============================================================================

export function isApiConfigured(): boolean {
  return Boolean(OURA_CLIENT_ID && OURA_CLIENT_SECRET && OURA_REDIRECT_URI);
}

export async function isOuraConfigured(userId: string): Promise<boolean> {
  if (!isApiConfigured()) return false;

  try {
    const tokens = await getTokens(userId);
    return tokens !== null;
  } catch {
    return false;
  }
}

// ============================================================================
// OAUTH FLOW
// ============================================================================

/**
 * Generate authorization URL for user to connect Oura
 */
export function getAuthorizationUrl(userId: string): OuraResult<{ url: string }> {
  if (!isApiConfigured()) {
    return { success: false, error: 'Oura integration not configured' };
  }

  // Generate state parameter for CSRF protection
  const state = crypto.randomBytes(32).toString('hex');
  pendingStates.set(state, { userId, createdAt: Date.now() });

  // Clean up old states
  const now = Date.now();
  for (const [key, value] of pendingStates.entries()) {
    if (now - value.createdAt > STATE_TTL_MS) {
      pendingStates.delete(key);
    }
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: OURA_CLIENT_ID,
    redirect_uri: OURA_REDIRECT_URI,
    scope: 'daily personal heartrate workout tag session spo2',
    state,
  });

  const url = `${OURA_AUTH_URL}?${params.toString()}`;

  log.info({ userId }, 'Generated Oura authorization URL');
  return { success: true, data: { url } };
}

/**
 * Validate OAuth state and return associated userId
 */
export function validateOAuthState(state: string): string | null {
  const pending = pendingStates.get(state);
  if (!pending) return null;

  const now = Date.now();
  if (now - pending.createdAt > STATE_TTL_MS) {
    pendingStates.delete(state);
    return null;
  }

  pendingStates.delete(state);
  return pending.userId;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  userId: string
): Promise<OuraResult<OuraTokens>> {
  if (!isApiConfigured()) {
    return { success: false, error: 'Oura integration not configured' };
  }

  try {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: OURA_REDIRECT_URI,
      client_id: OURA_CLIENT_ID,
      client_secret: OURA_CLIENT_SECRET,
    });

    const response = await fetch(OURA_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      log.error({ error, status: response.status }, 'Failed to exchange Oura code');
      return { success: false, error: 'Failed to exchange authorization code' };
    }

    const data = (await response.json()) as OuraTokenResponse;

    const tokens: OuraTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
      token_type: data.token_type,
    };

    // Store tokens
    await storeTokens(userId, tokens);

    // Clear any failed token tracking
    failedTokens.delete(userId);

    log.info({ userId }, 'Oura tokens exchanged and stored');
    return { success: true, data: tokens };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Error exchanging Oura code');
    return { success: false, error: 'Token exchange failed' };
  }
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(userId: string): Promise<OuraResult<OuraTokens>> {
  if (!isApiConfigured()) {
    return { success: false, error: 'Oura integration not configured' };
  }

  // Check if this token recently failed
  const failedAt = failedTokens.get(userId);
  if (failedAt && Date.now() - failedAt < FAILED_TOKEN_COOLDOWN_MS) {
    return { success: false, error: 'Token refresh recently failed, waiting for cooldown' };
  }

  try {
    const tokens = await getTokens(userId);
    if (!tokens || !tokens.refresh_token) {
      return { success: false, error: 'No refresh token available' };
    }

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: OURA_CLIENT_ID,
      client_secret: OURA_CLIENT_SECRET,
    });

    const response = await fetch(OURA_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      log.error({ error, status: response.status, userId }, 'Failed to refresh Oura token');

      // Track this failure
      failedTokens.set(userId, Date.now());

      // If refresh token is invalid, delete stored tokens
      if (response.status === 400 || response.status === 401) {
        await deleteUserTokens(userId);
      }

      return { success: false, error: 'Token refresh failed' };
    }

    const data = (await response.json()) as OuraTokenResponse;

    const newTokens: OuraTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || tokens.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
      token_type: data.token_type,
    };

    await storeTokens(userId, newTokens);

    // Clear failed tracking on success
    failedTokens.delete(userId);

    log.info({ userId }, 'Oura token refreshed');
    return { success: true, data: newTokens };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Error refreshing Oura token');
    failedTokens.set(userId, Date.now());
    return { success: false, error: 'Token refresh failed' };
  }
}

/**
 * Get valid access token, refreshing if necessary
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  try {
    let tokens = await getTokens(userId);
    if (!tokens) return null;

    // Check if token is expired or about to expire
    if (Date.now() >= tokens.expires_at - TOKEN_EXPIRY_BUFFER_MS) {
      const result = await refreshAccessToken(userId);
      if (!result.success || !result.data) return null;
      tokens = result.data;
    }

    return tokens.access_token;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Error getting valid Oura token');
    return null;
  }
}

// ============================================================================
// TOKEN STORAGE
// ============================================================================

async function storeTokens(userId: string, tokens: OuraTokens): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection(FIRESTORE_COLLECTION)
      .doc(userId)
      .set({
        ...tokens,
        updatedAt: new Date().toISOString(),
      });

    // Update cache
    tokenCache.set(userId, tokens);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to store Oura tokens');
  }
}

async function getTokens(userId: string): Promise<OuraTokens | null> {
  // Check cache first
  const cached = tokenCache.get(userId);
  if (cached) return cached;

  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db.collection(FIRESTORE_COLLECTION).doc(userId).get();
    if (!doc.exists) return null;

    const data = doc.data() as OuraTokens;
    tokenCache.set(userId, data);
    return data;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get Oura tokens');
    return null;
  }
}

export async function deleteUserTokens(userId: string): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db.collection(FIRESTORE_COLLECTION).doc(userId).delete();
    tokenCache.delete(userId);
    failedTokens.delete(userId);
    log.info({ userId }, 'Oura tokens deleted');
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to delete Oura tokens');
  }
}
