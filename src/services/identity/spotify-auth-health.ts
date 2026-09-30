/**
 * Spotify Auth Health & Diagnostics
 *
 * Configuration checks, token status, and health/diagnostic reporting for
 * the Spotify integration. Extracted from spotify-auth.ts.
 */

import * as fs from 'fs';
import { getLogger } from '../../utils/safe-logger.js';
import { isSpotifyUserPossiblyLinked } from './spotify-linked-tokens.js';
import {
  CLIENT_ID,
  CLIENT_SECRET,
  TOKEN_FILE,
  loadTokens,
  spotifyCircuitBreaker,
} from './spotify-token-store.js';

/**
 * Check if Spotify is configured
 */
export function isSpotifyConfigured(): boolean {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return false;
  }

  // The calling user's linked account counts as configured
  if (isSpotifyUserPossiblyLinked()) {
    return true;
  }

  // Check for tokens in file or .env
  if (fs.existsSync(TOKEN_FILE)) {
    return true;
  }

  return !!process.env.SPOTIFY_REFRESH_TOKEN;
}

/**
 * Get token expiry info for monitoring
 */
export function getSpotifyTokenStatus(): {
  valid: boolean;
  minutesRemaining: number;
  expiresAt: Date | null;
} {
  const tokens = loadTokens();
  if (!tokens || !tokens.expires_at) {
    return { valid: false, minutesRemaining: 0, expiresAt: null };
  }

  const minutesRemaining = Math.round((tokens.expires_at - Date.now()) / 60000);
  return {
    valid: minutesRemaining > 0,
    minutesRemaining,
    expiresAt: new Date(tokens.expires_at),
  };
}

// ============================================================================
// HEALTH CHECK & DIAGNOSTICS
// ============================================================================

export interface SpotifyHealthStatus {
  configured: boolean;
  hasClientId: boolean;
  hasClientSecret: boolean;
  hasTokenFile: boolean;
  hasRefreshToken: boolean;
  tokenValid: boolean;
  tokenMinutesRemaining: number;
  circuitBreakerOpen: boolean;
  circuitBreakerFailures: number;
  lastError: string | null;
}

let lastError: string | null = null;

/**
 * Record the last error for diagnostics
 */
export function recordSpotifyError(error: string): void {
  lastError = error;
  getLogger().error({ error }, '🎵 Spotify error recorded');
}

/**
 * Get comprehensive health status for Spotify integration.
 * Use this to diagnose issues.
 */
export function getSpotifyHealthStatus(): SpotifyHealthStatus {
  const hasClientId = !!CLIENT_ID;
  const hasClientSecret = !!CLIENT_SECRET;
  const hasTokenFile = fs.existsSync(TOKEN_FILE);
  const hasRefreshToken =
    hasTokenFile || !!process.env.SPOTIFY_REFRESH_TOKEN || isSpotifyUserPossiblyLinked();

  const tokenStatus = getSpotifyTokenStatus();
  const circuitStats = spotifyCircuitBreaker.getStats();

  return {
    configured: isSpotifyConfigured(),
    hasClientId,
    hasClientSecret,
    hasTokenFile,
    hasRefreshToken,
    tokenValid: tokenStatus.valid,
    tokenMinutesRemaining: tokenStatus.minutesRemaining,
    circuitBreakerOpen: circuitStats.state === 'open',
    circuitBreakerFailures: circuitStats.failures,
    lastError,
  };
}

/**
 * Log detailed diagnostics for debugging Spotify issues
 */
export function logSpotifyDiagnostics(): void {
  const status = getSpotifyHealthStatus();

  getLogger().info(
    {
      configured: status.configured,
      hasClientId: status.hasClientId,
      hasClientSecret: status.hasClientSecret,
      hasTokenFile: status.hasTokenFile,
      hasRefreshToken: status.hasRefreshToken,
      tokenValid: status.tokenValid,
      tokenMinutesRemaining: status.tokenMinutesRemaining,
      circuitBreakerOpen: status.circuitBreakerOpen,
      lastError: status.lastError,
    },
    '🎵 SPOTIFY DIAGNOSTICS'
  );

  // Log actionable steps if there are issues
  if (!status.configured) {
    if (!status.hasClientId || !status.hasClientSecret) {
      getLogger().warn(
        '🎵 Missing Spotify credentials. Add to .env:\n' +
          '   SPOTIFY_CLIENT_ID=your_client_id\n' +
          '   SPOTIFY_CLIENT_SECRET=your_client_secret'
      );
    }
    if (!status.hasRefreshToken) {
      getLogger().warn('🎵 No refresh token. Run: node scripts/spotify-auth.js');
    }
  }

  if (status.circuitBreakerOpen) {
    const stats = spotifyCircuitBreaker.getStats();
    getLogger().warn(
      `🎵 Circuit breaker OPEN after ${stats.totalFailures} failures. Will retry in 1 minute.`
    );
  }
}

/**
 * Reset the circuit breaker manually (for testing/recovery)
 */
export function resetSpotifyCircuitBreaker(): void {
  spotifyCircuitBreaker.reset();
  lastError = null;
  getLogger().info('🎵 Spotify circuit breaker reset manually');
}
