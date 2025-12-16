/**
 * Spotify Token Management
 *
 * Manages Spotify Web Playback SDK tokens with auto-refresh.
 */

import fs from 'fs';
import path from 'path';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'Spotify' });

/**
 * Spotify token data
 */
interface SpotifyTokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
  scope: string;
}

// Configuration
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';
const SPOTIFY_TOKENS_FILE = path.join(process.cwd(), '.spotify-tokens.json');

// Runtime state
let spotifyWebDeviceId: string | null = null;
let spotifyAccessToken: string | null = null;
let spotifyTokenExpiry = 0;

/**
 * Check if Spotify is configured
 */
export function isConfigured(): boolean {
  return !!(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET);
}

/**
 * Get Spotify configuration
 */
export function getConfig(): { clientId: string; hasRefreshToken: boolean; hasWebDevice: boolean } {
  return {
    clientId: SPOTIFY_CLIENT_ID,
    hasRefreshToken: !!getRefreshToken(),
    hasWebDevice: !!spotifyWebDeviceId,
  };
}

/**
 * Get Spotify refresh token from file or .env
 */
export function getRefreshToken(): string | null {
  // Try file first (new system)
  try {
    if (fs.existsSync(SPOTIFY_TOKENS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SPOTIFY_TOKENS_FILE, 'utf8')) as SpotifyTokenData;
      if (data.refresh_token) {
        return data.refresh_token;
      }
    }
  } catch (err) {
    log.warn({ error: (err as Error).message }, 'Could not read Spotify tokens file');
  }

  // Fall back to .env (old system)
  const envToken = process.env.SPOTIFY_REFRESH_TOKEN;
  if (envToken) {
    log.info('Using refresh token from .env (consider running pnpm auth:spotify)');
    return envToken;
  }

  return null;
}

/**
 * Save updated tokens to file
 */
export function saveTokens(
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  scope = ''
): void {
  try {
    // Preserve existing scope if not provided
    let existingScope = scope;
    if (!scope && fs.existsSync(SPOTIFY_TOKENS_FILE)) {
      try {
        const existing = JSON.parse(
          fs.readFileSync(SPOTIFY_TOKENS_FILE, 'utf8')
        ) as SpotifyTokenData;
        existingScope = existing.scope || '';
      } catch {
        // Ignore parse errors
      }
    }

    const data: SpotifyTokenData = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: Date.now() + expiresIn * 1000,
      token_type: 'Bearer',
      scope: existingScope,
    };
    fs.writeFileSync(SPOTIFY_TOKENS_FILE, JSON.stringify(data, null, 2));
    log.info('Saved updated tokens to .spotify-tokens.json');
  } catch (err) {
    log.warn({ error: (err as Error).message }, 'Could not save Spotify tokens');
  }
}

/**
 * Get token expiry time from file
 */
export function getTokenExpiry(): number {
  try {
    if (fs.existsSync(SPOTIFY_TOKENS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SPOTIFY_TOKENS_FILE, 'utf8')) as SpotifyTokenData;
      return data.expires_at || 0;
    }
  } catch {
    return 0;
  }
  return 0;
}

/**
 * Refresh access token if needed
 */
export async function refreshTokenIfNeeded(): Promise<void> {
  const refreshToken = getRefreshToken();
  if (!refreshToken || !SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    return; // Not configured
  }

  const expiresAt = getTokenExpiry();
  const now = Date.now();
  const minutesUntilExpiry = Math.round((expiresAt - now) / 60000);

  // Refresh if less than 10 minutes remaining
  if (expiresAt > 0 && minutesUntilExpiry > 10) {
    log.debug({ minutesUntilExpiry }, 'Spotify token still valid');
    return;
  }

  log.info({ expiresAt, minutesUntilExpiry }, 'Refreshing Spotify token');

  try {
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' +
          Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!tokenResponse.ok) {
      log.error({ status: tokenResponse.status }, 'Auto-refresh failed');
      return;
    }

    const data = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    spotifyAccessToken = data.access_token;
    spotifyTokenExpiry = Date.now() + data.expires_in * 1000;

    // Save to file
    saveTokens(data.access_token, data.refresh_token || refreshToken, data.expires_in);

    const newMinutes = Math.round(data.expires_in / 60);
    log.info({ validForMinutes: newMinutes }, 'Spotify token auto-refreshed');
  } catch (err) {
    log.error({ error: (err as Error).message }, 'Auto-refresh error');
  }
}

/**
 * Get current access token (refreshing if needed)
 */
export async function getAccessToken(): Promise<string | null> {
  await refreshTokenIfNeeded();

  // Try to get from file
  try {
    if (fs.existsSync(SPOTIFY_TOKENS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SPOTIFY_TOKENS_FILE, 'utf8')) as SpotifyTokenData;
      if (data.access_token && data.expires_at > Date.now()) {
        return data.access_token;
      }
    }
  } catch {
    // Fall through to return cached token
  }

  return spotifyAccessToken;
}

/**
 * Set the web device ID
 */
export function setWebDeviceId(deviceId: string): void {
  spotifyWebDeviceId = deviceId;
  log.info({ deviceId }, 'Spotify Web Player device registered');
}

/**
 * Get the web device ID
 */
export function getWebDeviceId(): string | null {
  return spotifyWebDeviceId;
}

/**
 * Start background refresh checker (every 5 minutes)
 */
export function startAutoRefresh(): void {
  // Check immediately on startup
  refreshTokenIfNeeded();

  // Then check every 5 minutes
  setInterval(() => refreshTokenIfNeeded(), 5 * 60 * 1000);
  log.info('Spotify auto-refresh enabled (checks every 5 min)');
}
