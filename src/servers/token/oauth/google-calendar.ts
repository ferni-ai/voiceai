/**
 * Google Calendar OAuth management
 *
 * STORAGE: Uses Firestore for persistence (Cloud Run compatible).
 * Tokens are encrypted before storage for security.
 */

import type { OAuthTokens } from '../../shared/types.js';
import { encryptData, decryptData } from '../../shared/encryption.js';
import { createPersistenceStore } from '../../../services/persistence/index.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

const log = createLogger({ module: 'GoogleCalendarOAuth' });

// Configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CALENDAR_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_CALENDAR_REDIRECT_URI ||
  `http://localhost:${process.env.PORT || 3002}/auth/google/callback`;

/**
 * Google OAuth token response
 */
interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

/**
 * Encrypted token data stored in Firestore
 */
interface EncryptedTokenData {
  encrypted: string;
  updated_at: number;
}

// Required scopes for Google Calendar
export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

// Firestore-backed persistence store for encrypted tokens
// Uses per-user storage under bogle_users/{userId}/google_calendar_tokens/data
const tokenStore = createPersistenceStore<EncryptedTokenData>({
  collection: 'google_calendar_tokens',
  documentId: 'data',
  useRootCollection: false, // Per-user storage
  syncIntervalMs: 2000,
});

// In-memory cache for decrypted tokens (fast access)
const tokenCache = new Map<string, OAuthTokens>();

/**
 * Check if Google Calendar OAuth is configured
 */
export function isConfigured(): boolean {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

/**
 * Get Google Calendar configuration
 */
export function getConfig(): {
  clientId: string | undefined;
  redirectUri: string;
  scopes: string[];
} {
  return {
    clientId: GOOGLE_CLIENT_ID,
    redirectUri: GOOGLE_REDIRECT_URI,
    scopes: GOOGLE_CALENDAR_SCOPES,
  };
}

/**
 * Get tokens for a specific user (from cache or Firestore)
 */
export async function getTokens(userId: string): Promise<OAuthTokens | null> {
  // Check cache first
  const cached = tokenCache.get(userId);
  if (cached) {
    return cached;
  }

  try {
    const data = await tokenStore.get(userId);
    if (data?.encrypted) {
      const decrypted = decryptData<OAuthTokens>(data.encrypted);
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

/**
 * Save tokens for a specific user (encrypted)
 */
export async function saveTokens(userId: string, tokens: OAuthTokens): Promise<void> {
  const tokensWithTimestamp = {
    ...tokens,
    updated_at: Date.now(),
  };

  // Update cache
  tokenCache.set(userId, tokensWithTimestamp);

  // Encrypt and persist
  try {
    const encrypted = encryptData(tokensWithTimestamp);
    await tokenStore.setImmediate(userId, {
      encrypted,
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

/**
 * Remove tokens for a specific user
 */
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
 * Refresh access token using refresh token
 */
export async function refreshToken(userId: string): Promise<OAuthTokens | null> {
  const userTokens = await getTokens(userId);
  if (!userTokens?.refresh_token) {
    return null;
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: userTokens.refresh_token,
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      log.error(
        { status: response.status, userId: userId.substring(0, 8) },
        'Google Calendar token refresh failed'
      );
      return null;
    }

    const data = (await response.json()) as GoogleTokenResponse;
    const newTokens: OAuthTokens = {
      access_token: data.access_token,
      refresh_token: userTokens.refresh_token, // Keep existing refresh token
      expires_at: Date.now() + data.expires_in * 1000,
      scope: data.scope || userTokens.scope,
    };

    await saveTokens(userId, newTokens);
    log.info({ userId: userId.substring(0, 8) }, 'Google Calendar token refreshed');
    return newTokens;
  } catch (err) {
    log.error(
      { error: (err as Error).message, userId: userId.substring(0, 8) },
      'Error refreshing Google Calendar token'
    );
    return null;
  }
}

/**
 * Get valid access token for a user (refresh if needed)
 */
export async function getValidToken(userId: string): Promise<string | null> {
  const userTokens = await getTokens(userId);
  if (!userTokens) {
    return null;
  }

  // Check if token is expired (with 5 min buffer)
  const bufferMs = 5 * 60 * 1000;
  if (Date.now() >= userTokens.expires_at - bufferMs) {
    const refreshed = await refreshToken(userId);
    return refreshed?.access_token || null;
  }

  return userTokens.access_token;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCode(code: string): Promise<OAuthTokens | null> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      log.error({ status: response.status }, 'Google Calendar token exchange failed');
      return null;
    }

    const data = (await response.json()) as GoogleTokenResponse;
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || '',
      expires_at: Date.now() + data.expires_in * 1000,
      scope: data.scope,
    };
  } catch (err) {
    log.error({ error: (err as Error).message }, 'Error exchanging Google Calendar code');
    return null;
  }
}

/**
 * Build Google OAuth authorization URL
 */
export function buildAuthUrl(state: string): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', GOOGLE_CLIENT_ID!);
  url.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_CALENDAR_SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);
  return url.toString();
}

/**
 * Shutdown Google Calendar OAuth service
 */
export async function shutdown(): Promise<void> {
  await tokenStore.shutdown();
  tokenCache.clear();
  log.info('Google Calendar OAuth service shutdown complete');
}
