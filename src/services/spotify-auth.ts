/**
 * Spotify Token Manager
 * 
 * Automatically manages Spotify OAuth tokens:
 * - Stores tokens in a JSON file (not .env)
 * - Auto-refreshes when expired
 * - Persists across restarts
 * 
 * This eliminates the need to manually update .env when tokens expire!
 */

import * as fs from 'fs';
import * as path from 'path';
import { log } from '@livekit/agents';

const getLogger = () => log();

// File to store tokens (gitignored)
const TOKEN_FILE = path.join(process.cwd(), '.spotify-tokens.json');

// Spotify API endpoints
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

// Credentials from .env (these don't change)
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';

// Token state
interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix timestamp
  token_type: string;
  scope: string;
}

let cachedTokens: TokenData | null = null;

/**
 * Load tokens from file
 */
function loadTokens(): TokenData | null {
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
function saveTokens(tokens: TokenData): void {
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
    getLogger().debug('Saved Spotify tokens to file');
  } catch (error) {
    getLogger().error({ error }, 'Failed to save Spotify tokens');
  }
}

/**
 * Check if token is expired (with 5 min buffer)
 */
function isTokenExpired(tokens: TokenData): boolean {
  const bufferMs = 5 * 60 * 1000; // 5 minutes
  return Date.now() >= (tokens.expires_at - bufferMs);
}

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
        'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json() as { error: string; error_description?: string };
      getLogger().error({ error: errorData.error, description: errorData.error_description }, 'Spotify token refresh failed');
      return null;
    }
    
    const data = await response.json() as {
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
      expires_at: Date.now() + (data.expires_in * 1000),
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
 */
export async function getSpotifyAccessToken(): Promise<string | null> {
  // Load from cache or file
  if (!cachedTokens) {
    cachedTokens = loadTokens();
  }
  
  if (!cachedTokens) {
    getLogger().warn('No Spotify tokens available. Run: node scripts/spotify-auth.js');
    return null;
  }
  
  // Check if we need to refresh
  if (!cachedTokens.access_token || isTokenExpired(cachedTokens)) {
    const newTokens = await refreshAccessToken(cachedTokens.refresh_token);
    if (!newTokens) {
      return null;
    }
    cachedTokens = newTokens;
  }
  
  return cachedTokens.access_token;
}

/**
 * Check if Spotify is configured
 */
export function isSpotifyConfigured(): boolean {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return false;
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
export function getSpotifyTokenStatus(): { valid: boolean; minutesRemaining: number; expiresAt: Date | null } {
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

/**
 * Proactively refresh token if it will expire soon
 * Call this periodically (e.g., every 5 minutes) to ensure token is always fresh
 */
export async function ensureTokenFresh(): Promise<boolean> {
  const status = getSpotifyTokenStatus();
  
  if (status.minutesRemaining > 10) {
    // Token is still fresh, no need to refresh
    return true;
  }
  
  getLogger().info({ valid: status.valid, minutesRemaining: status.minutesRemaining }, 'Token expiring - proactively refreshing');
  
  const token = await getSpotifyAccessToken();
  return !!token;
}

// Background refresh interval
let refreshInterval: NodeJS.Timeout | null = null;

/**
 * Start background token refresh (checks every 5 minutes)
 */
export function startAutoRefresh(): void {
  if (refreshInterval) {
    return; // Already running
  }
  
  // Check immediately
  ensureTokenFresh();
  
  // Then check every 5 minutes
  refreshInterval = setInterval(async () => {
    await ensureTokenFresh();
  }, 5 * 60 * 1000);
  
  getLogger().info('Spotify auto-refresh started (checks every 5 min)');
}

/**
 * Stop background refresh
 */
export function stopAutoRefresh(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
    getLogger().info('Spotify auto-refresh stopped');
  }
}

/**
 * Store new tokens (called after OAuth flow)
 */
export function storeSpotifyTokens(accessToken: string, refreshToken: string, expiresIn: number): void {
  const tokens: TokenData = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: Date.now() + (expiresIn * 1000),
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

