/**
 * Spotify OAuth management
 */

import fs from 'fs';
import path from 'path';
import type { OAuthTokens } from '../../shared/types.js';
import { encryptData, decryptData } from '../../shared/encryption.js';

// Configuration
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REDIRECT_URI =
  process.env.SPOTIFY_REDIRECT_URI ||
  `http://localhost:${process.env.TOKEN_SERVER_PORT || 3001}/spotify/callback`;

// Storage file
const SPOTIFY_USERS_FILE = path.join(process.cwd(), '.spotify-users.json');

/**
 * Spotify OAuth token response
 */
interface SpotifyTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
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
 * Load all Spotify user tokens from storage
 */
function loadSpotifyUsers(): Record<string, OAuthTokens> {
  try {
    if (fs.existsSync(SPOTIFY_USERS_FILE)) {
      const content = fs.readFileSync(SPOTIFY_USERS_FILE, 'utf8');
      return decryptData<Record<string, OAuthTokens>>(content) || {};
    }
  } catch {
    console.error('Error loading Spotify users');
  }
  return {};
}

/**
 * Save all Spotify user tokens to storage
 */
function saveSpotifyUsers(users: Record<string, OAuthTokens>): void {
  try {
    const encrypted = encryptData(users);
    fs.writeFileSync(SPOTIFY_USERS_FILE, encrypted);
  } catch {
    console.error('Error saving Spotify users');
  }
}

/**
 * Get tokens for a specific device
 */
export function getTokens(deviceId: string): OAuthTokens | null {
  const users = loadSpotifyUsers();
  return users[deviceId] || null;
}

/**
 * Save tokens for a specific device
 */
export function saveTokens(deviceId: string, tokens: OAuthTokens): void {
  const users = loadSpotifyUsers();
  users[deviceId] = {
    ...tokens,
    updated_at: Date.now(),
  };
  saveSpotifyUsers(users);
}

/**
 * Remove tokens for a specific device
 */
export function removeTokens(deviceId: string): void {
  const users = loadSpotifyUsers();
  delete users[deviceId];
  saveSpotifyUsers(users);
}

/**
 * Refresh access token using refresh token
 */
export async function refreshToken(deviceId: string): Promise<OAuthTokens | null> {
  const userTokens = getTokens(deviceId);
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
      console.error('Spotify token refresh failed');
      return null;
    }

    const data = (await response.json()) as SpotifyTokenResponse;
    const newTokens: OAuthTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || userTokens.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
      scope: data.scope || userTokens.scope,
    };

    saveTokens(deviceId, newTokens);
    return newTokens;
  } catch {
    console.error('Error refreshing Spotify token');
    return null;
  }
}

/**
 * Get valid access token for a user (refresh if needed)
 */
export async function getValidToken(deviceId: string): Promise<string | null> {
  const userTokens = getTokens(deviceId);
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
      console.error('Spotify token exchange failed');
      return null;
    }

    const data = (await response.json()) as SpotifyTokenResponse;
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || '',
      expires_at: Date.now() + data.expires_in * 1000,
      scope: data.scope,
    };
  } catch {
    console.error('Error exchanging Spotify code');
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
