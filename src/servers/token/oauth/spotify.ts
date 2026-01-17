/**
 * Spotify OAuth management
 *
 * STORAGE: Uses Firestore for persistence (Cloud Run compatible).
 * Tokens are encrypted before storage for security.
 */

import type { OAuthTokens } from '../../shared/types.js';
import { encryptData, decryptData } from '../../shared/encryption.js';
import { createPersistenceStore } from '../../../services/persistence/index.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

const log = createLogger({ module: 'SpotifyOAuth' });

// Configuration
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REDIRECT_URI =
  process.env.SPOTIFY_REDIRECT_URI ||
  `http://localhost:${process.env.TOKEN_SERVER_PORT || 3001}/spotify/callback`;

/**
 * Spotify OAuth token response
 */
interface SpotifyTokenResponse {
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

// Required scopes for Spotify integration
export const SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
];

// Firestore-backed persistence store for encrypted tokens
// Uses per-user storage under bogle_users/{userId}/spotify_oauth_tokens/data
const tokenStore = createPersistenceStore<EncryptedTokenData>({
  collection: 'spotify_oauth_tokens',
  documentId: 'data',
  useRootCollection: false, // Per-user storage
  syncIntervalMs: 2000,
});

// In-memory cache for decrypted tokens (fast access)
const tokenCache = new Map<string, OAuthTokens>();

/**
 * Check if Spotify is configured
 */
export function isConfigured(): boolean {
  return !!(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET);
}

/**
 * Get Spotify configuration
 */
export function getConfig(): {
  clientId: string | undefined;
  redirectUri: string;
  scopes: string[];
} {
  return {
    clientId: SPOTIFY_CLIENT_ID,
    redirectUri: SPOTIFY_REDIRECT_URI,
    scopes: SPOTIFY_SCOPES,
  };
}

/**
 * Get tokens for a specific device (from cache or Firestore)
 */
export async function getTokens(deviceId: string): Promise<OAuthTokens | null> {
  // Check cache first
  const cached = tokenCache.get(deviceId);
  if (cached) {
    return cached;
  }

  try {
    const data = await tokenStore.get(deviceId);
    if (data?.encrypted) {
      const decrypted = decryptData<OAuthTokens>(data.encrypted);
      if (decrypted) {
        tokenCache.set(deviceId, decrypted);
        return decrypted;
      }
    }
  } catch (err) {
    log.error(
      { error: (err as Error).message, deviceId: deviceId.substring(0, 8) },
      'Error loading Spotify tokens'
    );
  }
  return null;
}

/**
 * Save tokens for a specific device (encrypted)
 */
export async function saveTokens(deviceId: string, tokens: OAuthTokens): Promise<void> {
  const tokensWithTimestamp = {
    ...tokens,
    updated_at: Date.now(),
  };

  // Update cache
  tokenCache.set(deviceId, tokensWithTimestamp);

  // Encrypt and persist
  try {
    const encrypted = encryptData(tokensWithTimestamp);
    await tokenStore.setImmediate(deviceId, {
      encrypted,
      updated_at: Date.now(),
    });
    log.info({ deviceId: deviceId.substring(0, 8) }, 'Saved Spotify OAuth tokens');
  } catch (err) {
    log.error(
      { error: (err as Error).message, deviceId: deviceId.substring(0, 8) },
      'Error saving Spotify tokens'
    );
  }
}

/**
 * Remove tokens for a specific device
 */
export async function removeTokens(deviceId: string): Promise<void> {
  tokenCache.delete(deviceId);

  try {
    await tokenStore.delete(deviceId);
    log.info({ deviceId: deviceId.substring(0, 8) }, 'Removed Spotify OAuth tokens');
  } catch (err) {
    log.error(
      { error: (err as Error).message, deviceId: deviceId.substring(0, 8) },
      'Error removing Spotify tokens'
    );
  }
}

/**
 * Refresh access token using refresh token
 */
export async function refreshToken(deviceId: string): Promise<OAuthTokens | null> {
  const userTokens = await getTokens(deviceId);
  if (!userTokens?.refresh_token) {
    return null;
  }

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' +
          Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: userTokens.refresh_token,
      }),
    });

    if (!response.ok) {
      log.error(
        { status: response.status, deviceId: deviceId.substring(0, 8) },
        'Spotify token refresh failed'
      );
      return null;
    }

    const data = (await response.json()) as SpotifyTokenResponse;
    const newTokens: OAuthTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || userTokens.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
      scope: data.scope || userTokens.scope,
    };

    await saveTokens(deviceId, newTokens);
    log.info({ deviceId: deviceId.substring(0, 8) }, 'Spotify token refreshed');
    return newTokens;
  } catch (err) {
    log.error(
      { error: (err as Error).message, deviceId: deviceId.substring(0, 8) },
      'Error refreshing Spotify token'
    );
    return null;
  }
}

/**
 * Get valid access token for a user (refresh if needed)
 */
export async function getValidToken(deviceId: string): Promise<string | null> {
  const userTokens = await getTokens(deviceId);
  if (!userTokens) {
    return null;
  }

  // Check if token is expired (with 5 min buffer)
  const bufferMs = 5 * 60 * 1000;
  if (Date.now() >= userTokens.expires_at - bufferMs) {
    const refreshed = await refreshToken(deviceId);
    return refreshed?.access_token || null;
  }

  return userTokens.access_token;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCode(code: string): Promise<OAuthTokens | null> {
  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' +
          Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: SPOTIFY_REDIRECT_URI,
      }),
    });

    if (!response.ok) {
      log.error({ status: response.status }, 'Spotify token exchange failed');
      return null;
    }

    const data = (await response.json()) as SpotifyTokenResponse;
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || '',
      expires_at: Date.now() + data.expires_in * 1000,
      scope: data.scope,
    };
  } catch (err) {
    log.error({ error: (err as Error).message }, 'Error exchanging Spotify code');
    return null;
  }
}

/**
 * Build Spotify authorization URL
 */
export function buildAuthUrl(state: string): string {
  const url = new URL('https://accounts.spotify.com/authorize');
  url.searchParams.set('client_id', SPOTIFY_CLIENT_ID!);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', SPOTIFY_REDIRECT_URI);
  url.searchParams.set('scope', SPOTIFY_SCOPES.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('show_dialog', 'true');
  return url.toString();
}

/**
 * Shutdown Spotify OAuth service
 */
export async function shutdown(): Promise<void> {
  await tokenStore.shutdown();
  tokenCache.clear();
  log.info('Spotify OAuth service shutdown complete');
}
