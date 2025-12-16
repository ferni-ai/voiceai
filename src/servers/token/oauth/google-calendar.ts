/**
 * Google Calendar OAuth management
 */

import fs from 'fs';
import path from 'path';
import type { OAuthTokens } from '../../shared/types.js';
import { encryptData, decryptData } from '../../shared/encryption.js';

// Configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CALENDAR_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_CALENDAR_REDIRECT_URI ||
  `http://localhost:${process.env.TOKEN_SERVER_PORT || 3001}/auth/google/callback`;

/**
 * Google OAuth token response
 */
interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

// Required scopes for Google Calendar
export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

// Storage file
const GOOGLE_USERS_FILE = path.join(process.cwd(), '.google-calendar-users.json');

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
 * Load all Google Calendar user tokens from storage
 */
function loadGoogleUsers(): Record<string, OAuthTokens> {
  try {
    if (fs.existsSync(GOOGLE_USERS_FILE)) {
      const content = fs.readFileSync(GOOGLE_USERS_FILE, 'utf8');
      return decryptData<Record<string, OAuthTokens>>(content) || {};
    }
  } catch {
    console.error('Error loading Google Calendar users');
  }
  return {};
}

/**
 * Save all Google Calendar user tokens to storage
 */
function saveGoogleUsers(users: Record<string, OAuthTokens>): void {
  try {
    const encrypted = encryptData(users);
    fs.writeFileSync(GOOGLE_USERS_FILE, encrypted);
  } catch {
    console.error('Error saving Google Calendar users');
  }
}

/**
 * Get tokens for a specific user
 */
export function getTokens(userId: string): OAuthTokens | null {
  const users = loadGoogleUsers();
  return users[userId] || null;
}

/**
 * Save tokens for a specific user
 */
export function saveTokens(userId: string, tokens: OAuthTokens): void {
  const users = loadGoogleUsers();
  users[userId] = {
    ...tokens,
    updated_at: Date.now(),
  };
  saveGoogleUsers(users);
}

/**
 * Remove tokens for a specific user
 */
export function removeTokens(userId: string): void {
  const users = loadGoogleUsers();
  delete users[userId];
  saveGoogleUsers(users);
}

/**
 * Refresh access token using refresh token
 */
export async function refreshToken(userId: string): Promise<OAuthTokens | null> {
  const userTokens = getTokens(userId);
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
      console.error('Google Calendar token refresh failed');
      return null;
    }

    const data = (await response.json()) as GoogleTokenResponse;
    const newTokens: OAuthTokens = {
      access_token: data.access_token,
      refresh_token: userTokens.refresh_token, // Keep existing refresh token
      expires_at: Date.now() + data.expires_in * 1000,
      scope: data.scope || userTokens.scope,
    };

    saveTokens(userId, newTokens);
    return newTokens;
  } catch {
    console.error('Error refreshing Google Calendar token');
    return null;
  }
}

/**
 * Get valid access token for a user (refresh if needed)
 */
export async function getValidToken(userId: string): Promise<string | null> {
  const userTokens = getTokens(userId);
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
      console.error('Google Calendar token exchange failed');
      return null;
    }

    const data = (await response.json()) as GoogleTokenResponse;
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || '',
      expires_at: Date.now() + data.expires_in * 1000,
      scope: data.scope,
    };
  } catch {
    console.error('Error exchanging Google Calendar code');
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
