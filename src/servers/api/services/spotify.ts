/**
 * Spotify Token Management
 *
 * Manages Spotify Web Playback SDK tokens with auto-refresh.
 *
 * STORAGE: Uses Firestore for persistence (Cloud Run compatible).
 * Falls back to in-memory storage if Firestore is unavailable.
 */

import { createPersistenceStore } from '../../../services/persistence/index.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { registerInterval, clearNamedInterval } from '../../../utils/interval-manager.js';

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

// Firestore-backed persistence store for Spotify tokens
// Uses root collection since tokens are global (not per-user)
const tokenStore = createPersistenceStore<SpotifyTokenData>({
  collection: 'spotify_tokens',
  documentId: 'main',
  useRootCollection: true,
  syncIntervalMs: 1000, // Quick sync for token updates
});

// In-memory cache for fast access during request handling
let cachedTokenData: SpotifyTokenData | null = null;
let spotifyWebDeviceId: string | null = null;

// Auto-refresh interval reference for cleanup
let autoRefreshInterval: NodeJS.Timeout | null = null;

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
 * Get Spotify refresh token (from cache or Firestore)
 */
export function getRefreshToken(): string | null {
  // Try cached data first
  if (cachedTokenData?.refresh_token) {
    return cachedTokenData.refresh_token;
  }

  // Fall back to env var (legacy support)
  const envToken = process.env.SPOTIFY_REFRESH_TOKEN;
  if (envToken) {
    log.info('Using refresh token from .env (consider migrating to Firestore)');
    return envToken;
  }

  return null;
}

/**
 * Load tokens from Firestore on startup
 */
export async function loadTokens(): Promise<void> {
  try {
    const data = await tokenStore.get('global');
    if (data) {
      cachedTokenData = data;
      log.info('Loaded Spotify tokens from Firestore');
    }
  } catch (err) {
    log.warn({ error: (err as Error).message }, 'Could not load Spotify tokens from Firestore');
  }
}

/**
 * Save updated tokens to Firestore
 */
export async function saveTokens(
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  scope = ''
): Promise<void> {
  // Preserve existing scope if not provided
  const existingScope = scope || cachedTokenData?.scope || '';

  const data: SpotifyTokenData = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: Date.now() + expiresIn * 1000,
    token_type: 'Bearer',
    scope: existingScope,
  };

  // Update cache immediately
  cachedTokenData = data;

  // Persist to Firestore (write-through)
  try {
    await tokenStore.setImmediate('global', data);
    log.info('Saved Spotify tokens to Firestore');
  } catch (err) {
    log.warn({ error: (err as Error).message }, 'Could not save Spotify tokens to Firestore');
  }
}

/**
 * Get token expiry time
 */
export function getTokenExpiry(): number {
  return cachedTokenData?.expires_at || 0;
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

    // Save to Firestore (async, don't block)
    await saveTokens(data.access_token, data.refresh_token || refreshToken, data.expires_in);

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

  // Return cached token if still valid
  if (cachedTokenData?.access_token && cachedTokenData.expires_at > Date.now()) {
    return cachedTokenData.access_token;
  }

  return null;
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
  // Load tokens from Firestore first
  loadTokens().catch((err) => {
    log.warn({ error: (err as Error).message }, 'Failed to load tokens on startup');
  });

  // Check immediately on startup
  refreshTokenIfNeeded().catch((err) => {
    log.warn({ error: (err as Error).message }, 'Initial token refresh failed');
  });

  // Then check every 5 minutes
  if (autoRefreshInterval) {
    clearNamedInterval('spotify-auto-refresh');
  }
  registerInterval(
    'spotify-auto-refresh',
    () => {
      refreshTokenIfNeeded().catch((err) => {
        log.warn({ error: (err as Error).message }, 'Periodic token refresh failed');
      });
    },
    5 * 60 * 1000
  );
  autoRefreshInterval = 1 as unknown as ReturnType<typeof setInterval>; // Marker

  log.info('Spotify auto-refresh enabled (checks every 5 min)');
}

/**
 * Stop auto-refresh (for graceful shutdown)
 */
export function stopAutoRefresh(): void {
  if (autoRefreshInterval) {
    clearNamedInterval('spotify-auto-refresh');
    autoRefreshInterval = null;
    log.info('Spotify auto-refresh stopped');
  }
}

/**
 * Shutdown Spotify service (flush tokens and cleanup)
 */
export async function shutdown(): Promise<void> {
  stopAutoRefresh();
  await tokenStore.shutdown();
  log.info('Spotify service shutdown complete');
}
