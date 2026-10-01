/**
 * Spotify Token Manager
 *
 * Automatically manages Spotify OAuth tokens:
 * - Stores tokens in a JSON file (not .env)
 * - Auto-refreshes when expired
 * - Persists across restarts
 * - Thread-safe with mutex for concurrent requests
 * - Circuit breaker for repeated failures
 *
 * This eliminates the need to manually update .env when tokens expire!
 */

import * as fs from 'fs';
import { getLogger } from '../../utils/safe-logger.js';
import { registerInterval, clearNamedInterval } from '../../utils/interval-manager.js';
import { getActiveUserAccessToken, getSpotifyUser } from './spotify-linked-tokens.js';
import {
  CLIENT_ID,
  CLIENT_SECRET,
  SPOTIFY_TOKEN_URL,
  TOKEN_FILE,
  type TokenData,
  isTokenExpired,
  loadTokens,
  saveTokens,
  spotifyCircuitBreaker,
} from './spotify-token-store.js';
import { getSpotifyTokenStatus } from './spotify-auth-health.js';

// Re-export health/diagnostics API (moved to spotify-auth-health.ts)
export {
  isSpotifyConfigured,
  getSpotifyTokenStatus,
  recordSpotifyError,
  getSpotifyHealthStatus,
  logSpotifyDiagnostics,
  resetSpotifyCircuitBreaker,
  type SpotifyHealthStatus,
} from './spotify-auth-health.js';

let cachedTokens: TokenData | null = null;

// Last user we logged a global-token fallback for (avoid log spam)
let fallbackLoggedFor: string | null = null;

// ============================================================================
// MUTEX FOR THREAD-SAFE TOKEN REFRESH
// ============================================================================

let refreshInProgress: Promise<TokenData | null> | null = null;

/**
 * Refresh the access token
 */
async function refreshAccessToken(refreshToken: string): Promise<TokenData | null> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    getLogger().error('Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env');
    return null;
  }

  getLogger().debug('Refreshing Spotify access token...');

  try {
    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as { error: string; error_description?: string };
      getLogger().error(
        { error: errorData.error, description: errorData.error_description },
        'Spotify token refresh failed'
      );
      return null;
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      token_type: string;
      scope?: string;
    };

    const tokens: TokenData = {
      access_token: data.access_token,
      // Spotify may return a new refresh token, or we keep the old one
      refresh_token: data.refresh_token || refreshToken,
      expires_at: Date.now() + data.expires_in * 1000,
      token_type: data.token_type,
      scope: data.scope || '',
    };

    // Save to file for persistence
    saveTokens(tokens);
    cachedTokens = tokens;

    getLogger().info('Spotify token refreshed successfully');

    return tokens;
  } catch (error) {
    getLogger().error({ error }, 'Spotify token refresh error');
    return null;
  }
}

/**
 * Get a valid access token (auto-refreshes if needed)
 *
 * This is the main function to call - it handles everything automatically!
 * Thread-safe: Uses mutex to prevent multiple simultaneous refresh attempts.
 *
 * @param forceRefresh - Force a token refresh even if current token appears valid
 */
export async function getSpotifyAccessToken(forceRefresh = false): Promise<string | null> {
  // Prefer the calling user's own linked account (see setSpotifyUser)
  const userId = getSpotifyUser();
  if (userId) {
    const userToken = await getActiveUserAccessToken(forceRefresh);
    if (userToken) return userToken;
    if (fallbackLoggedFor !== userId) {
      fallbackLoggedFor = userId;
      getLogger().warn(
        { userId: userId.substring(0, 8) },
        '🎵 User has no linked Spotify account - falling back to the global Spotify token'
      );
    }
  }

  // Check circuit breaker first
  if (!spotifyCircuitBreaker.canRequest()) {
    getLogger().warn('🎵 Spotify circuit breaker is OPEN - skipping request');
    return null;
  }

  // Load from cache or file
  if (!cachedTokens) {
    cachedTokens = loadTokens();
  }

  if (!cachedTokens) {
    getLogger().warn(
      '🎵 No Spotify tokens available.\n' +
        '   To set up Spotify:\n' +
        '   1. Run: node scripts/spotify-auth.js\n' +
        '   2. Follow the prompts to authenticate\n' +
        '   3. Restart the agent'
    );
    return null;
  }

  // Check if we need to refresh (or forced)
  if (forceRefresh || !cachedTokens.access_token || isTokenExpired(cachedTokens)) {
    // Use mutex to prevent multiple simultaneous refreshes
    if (refreshInProgress) {
      getLogger().debug('🎵 Token refresh already in progress, waiting...');
      const result = await refreshInProgress;
      return result?.access_token || null;
    }

    if (forceRefresh) {
      getLogger().info('🎵 Force refreshing Spotify token...');
    }

    // Start refresh with mutex
    refreshInProgress = refreshAccessToken(cachedTokens.refresh_token);

    try {
      // Execute through circuit breaker - it handles success/failure tracking
      const newTokens = await spotifyCircuitBreaker.execute(async () => {
        const result = await refreshInProgress;
        if (!result) {
          throw new Error('Token refresh returned null');
        }
        return result;
      });
      cachedTokens = newTokens;
    } catch {
      // Circuit breaker already logged the failure
      return null;
    } finally {
      refreshInProgress = null;
    }
  }

  return cachedTokens.access_token;
}

/**
 * Validate token by making an actual API call
 * Returns true if token is valid and working
 */
export async function validateSpotifyToken(): Promise<boolean> {
  const token = await getSpotifyAccessToken();
  if (!token) {
    getLogger().warn('🎵 No Spotify token available for validation');
    return false;
  }

  try {
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      getLogger().info('🎵 Spotify token validated successfully');
      return true;
    }

    if (response.status === 401) {
      getLogger().warn('🎵 Spotify token validation failed (401) - will force refresh');
      // Force refresh and try again
      const newToken = await getSpotifyAccessToken(true);
      if (!newToken) return false;

      const retryResponse = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${newToken}` },
      });
      return retryResponse.ok;
    }

    getLogger().warn({ status: response.status }, '🎵 Spotify token validation failed');
    return false;
  } catch (error) {
    getLogger().error({ error }, '🎵 Spotify token validation error');
    return false;
  }
}

/**
 * Proactively refresh token if it will expire soon
 * Call this periodically (e.g., every 5 minutes) to ensure token is always fresh
 */
export async function ensureTokenFresh(): Promise<boolean> {
  const status = getSpotifyTokenStatus();

  if (status.minutesRemaining > 15) {
    // Token is still very fresh, no need to refresh
    return true;
  }

  if (status.minutesRemaining > 10) {
    // Token is moderately fresh, just validate it
    getLogger().debug({ minutesRemaining: status.minutesRemaining }, '🎵 Token moderately fresh');
    return true;
  }

  getLogger().info(
    { valid: status.valid, minutesRemaining: status.minutesRemaining },
    '🎵 Token expiring soon - proactively refreshing'
  );

  const token = await getSpotifyAccessToken(true); // Force refresh
  return !!token;
}

// Background refresh interval name
const SPOTIFY_AUTO_REFRESH_INTERVAL = 'spotify-auto-refresh';

/**
 * Start background token refresh (validates on startup, then checks every 5 minutes)
 */
export function startAutoRefresh(): void {
  // Validate immediately on startup
  void (async () => {
    const isValid = await validateSpotifyToken();
    if (!isValid) {
      getLogger().warn('🎵 Spotify token validation failed on startup - attempting refresh');
      await getSpotifyAccessToken(true); // Force refresh
    }
  })();

  // Then check every 5 minutes using managed interval
  registerInterval(
    SPOTIFY_AUTO_REFRESH_INTERVAL,
    () => {
      void ensureTokenFresh();
    },
    5 * 60 * 1000
  );

  getLogger().info('🎵 Spotify auto-refresh started (validates on startup, checks every 5 min)');
}

/**
 * Stop background refresh
 */
export function stopAutoRefresh(): void {
  clearNamedInterval(SPOTIFY_AUTO_REFRESH_INTERVAL);
  getLogger().info('Spotify auto-refresh stopped');
}

/**
 * Store new tokens (called after OAuth flow)
 */
export function storeSpotifyTokens(
  accessToken: string,
  refreshToken: string,
  expiresIn: number
): void {
  const tokens: TokenData = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: Date.now() + expiresIn * 1000,
    token_type: 'Bearer',
    scope: '',
  };

  saveTokens(tokens);
  cachedTokens = tokens;

  getLogger().info('New Spotify tokens stored');
}

/**
 * Clear stored tokens (for logout/reset)
 */
export function clearSpotifyTokens(): void {
  cachedTokens = null;

  try {
    if (fs.existsSync(TOKEN_FILE)) {
      fs.unlinkSync(TOKEN_FILE);
      getLogger().info('Cleared Spotify tokens');
    }
  } catch (error) {
    getLogger().error({ error }, 'Failed to clear Spotify tokens');
  }
}
