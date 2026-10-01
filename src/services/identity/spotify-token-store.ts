/**
 * Spotify Token Store
 *
 * File-backed persistence for the global Spotify OAuth tokens, shared
 * credentials/constants and the token-refresh circuit breaker.
 * Extracted from spotify-auth.ts.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from '../../utils/safe-logger.js';
import { getCircuitBreaker } from '../../utils/circuit-breaker.js';

// File to store tokens (gitignored)
export const TOKEN_FILE = path.join(process.cwd(), '.spotify-tokens.json');

// Spotify API endpoints
export const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

// Credentials from .env (these don't change)
export const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
export const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';

// Token state
export interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix timestamp
  token_type: string;
  scope: string;
}

// ============================================================================
// CIRCUIT BREAKER FOR REPEATED FAILURES
// ============================================================================

// Use the centralized circuit breaker utility
export const spotifyCircuitBreaker = getCircuitBreaker('spotify-token-refresh', {
  failureThreshold: 3,
  resetTimeout: 60 * 1000, // 1 minute
  successThreshold: 1,
});

/**
 * Load tokens from file
 */
export function loadTokens(): TokenData | null {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
      getLogger().debug('Loaded Spotify tokens from file');
      return data;
    }
  } catch (error) {
    getLogger().error({ error }, 'Failed to load Spotify tokens');
  }

  // Fall back to .env refresh token for initial setup
  const envRefreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
  if (envRefreshToken) {
    getLogger().debug('Using refresh token from .env (will migrate to file)');
    return {
      access_token: '',
      refresh_token: envRefreshToken,
      expires_at: 0,
      token_type: 'Bearer',
      scope: '',
    };
  }

  return null;
}

/**
 * Save tokens to file
 */
export function saveTokens(tokens: TokenData): void {
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
    getLogger().debug('Saved Spotify tokens to file');
  } catch (error) {
    getLogger().error({ error }, 'Failed to save Spotify tokens');
  }
}

/**
 * Check if token is expired (with 10 min buffer for proactive refresh)
 */
export function isTokenExpired(tokens: TokenData): boolean {
  const bufferMs = 10 * 60 * 1000; // 10 minutes - proactive refresh
  return Date.now() >= tokens.expires_at - bufferMs;
}
