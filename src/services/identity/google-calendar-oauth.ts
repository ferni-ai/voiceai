/**
 * Google Calendar OAuth Service
 *
 * Handles OAuth 2.0 authentication flow for Google Calendar:
 * - Generate authorization URL
 * - Exchange code for tokens
 * - Refresh access tokens
 * - Calendar CRUD operations
 *
 * Supports both:
 * - User OAuth flow (for personal calendars)
 * - Service Account (for shared/team calendars)
 */

import crypto from 'node:crypto';
import { getLogger } from '../../utils/safe-logger.js';
import * as linkedTokens from './google-calendar-linked-tokens.js';
import {
  CALENDAR_SCOPES,
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  GOOGLE_OAUTH_REDIRECT_URI,
} from './google-calendar-config.js';
import {
  TokenPermanentlyInvalidError,
  type CalendarEvent,
  type GoogleTokens,
} from './google-calendar-types.js';
import {
  clearFailedTokenStatus,
  deleteUserTokens,
  getAllCalendarUsers,
  getLegacyUserTokens,
  getUserTokens,
  isCalendarConfigured,
  isTokenPermanentlyFailed,
  markTokenAsFailed,
  storeUserTokens,
  areTokensExpired,
} from './google-calendar-token-store.js';
import {
  createEvent,
  deleteEvent,
  getEvents,
  getFreeBusy,
  getServiceAccountToken,
  listCalendars,
  updateEvent,
} from './google-calendar-api.js';

// Re-exports: moved to sibling modules, kept here for backward-compatible imports
export type { GoogleTokens, CalendarEvent, CalendarListEntry } from './google-calendar-types.js';
export { TokenPermanentlyInvalidError } from './google-calendar-types.js';
export {
  isTokenPermanentlyFailed,
  markTokenAsFailed,
  clearFailedTokenStatus,
  storeUserTokens,
  getUserTokens,
  getUserTokensSync,
  areTokensExpired,
  isCalendarConfigured,
  isCalendarConfiguredSync,
  deleteUserTokens,
  getAllCalendarUsers,
} from './google-calendar-token-store.js';
export {
  listCalendars,
  createEvent,
  updateEvent,
  deleteEvent,
  getEvents,
  getFreeBusy,
  getServiceAccountToken,
} from './google-calendar-api.js';

// ============================================================================
// OAUTH FLOW
// ============================================================================

/**
 * Generate OAuth authorization URL
 */
export function generateAuthUrl(state?: string): string {
  if (!GOOGLE_OAUTH_CLIENT_ID) {
    throw new Error('GOOGLE_CALENDAR_CLIENT_ID not configured');
  }

  const params = new URLSearchParams({
    client_id: GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri: GOOGLE_OAUTH_REDIRECT_URI,
    response_type: 'code',
    scope: CALENDAR_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent', // Force to get refresh token
    state: state || crypto.randomUUID(),
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new Error('Google OAuth credentials not configured');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
      redirect_uri: GOOGLE_OAUTH_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    getLogger().error({ status: response.status, error }, 'Failed to exchange code for tokens');
    throw new Error(`Token exchange failed: ${error}`);
  }

  const tokens = (await response.json()) as GoogleTokens;
  tokens.expiry_date = Date.now() + tokens.expires_in * 1000;

  getLogger().info(
    { hasRefreshToken: !!tokens.refresh_token },
    'Successfully exchanged code for tokens'
  );
  return tokens;
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new Error('Google OAuth credentials not configured');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    // Use warn level instead of error - expired tokens are expected
    getLogger().warn({ status: response.status, error }, 'Failed to refresh access token');

    // Check for permanent failures that shouldn't be retried
    const isPermanentError =
      error.includes('invalid_grant') ||
      error.includes('Token has been expired or revoked') ||
      error.includes('unauthorized_client');

    if (isPermanentError) {
      throw new TokenPermanentlyInvalidError(`Token permanently invalid: ${error}`);
    }

    throw new Error(`Token refresh failed: ${error}`);
  }

  const tokens = (await response.json()) as GoogleTokens;
  tokens.expiry_date = Date.now() + tokens.expires_in * 1000;
  // Keep the refresh token (it's not returned on refresh)
  tokens.refresh_token = refreshToken;

  return tokens;
}

/**
 * Get valid access token for a user (refreshes if needed)
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  // Check if this user's token is known to be permanently failed
  if (isTokenPermanentlyFailed(userId)) {
    getLogger().debug({ userId }, 'Skipping token refresh - token is marked as permanently failed');
    return null;
  }

  // Linked in the web app: the encrypted store handles decrypt + refresh
  if (await linkedTokens.getTokens(userId)) {
    return linkedTokens.getValidToken(userId);
  }

  let tokens = await getLegacyUserTokens(userId);
  if (!tokens) {
    getLogger().debug({ userId }, 'No tokens found for user');
    return null;
  }

  if (areTokensExpired(tokens)) {
    if (!tokens.refresh_token) {
      getLogger().warn({ userId }, 'Tokens expired and no refresh token available');
      return null;
    }

    try {
      tokens = await refreshAccessToken(tokens.refresh_token);
      await storeUserTokens(userId, tokens);
    } catch (error) {
      // Check if this is a permanent failure (invalid_grant, etc.)
      if (error instanceof TokenPermanentlyInvalidError) {
        markTokenAsFailed(userId);
        getLogger().warn(
          { userId },
          'OAuth token permanently invalid - user needs to re-authenticate'
        );
      } else {
        getLogger().error({ userId, error }, 'Failed to refresh tokens');
      }
      return null;
    }
  }

  return tokens.access_token;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Create an appointment event with reminders
 */
export async function createAppointmentEvent(
  userId: string,
  options: {
    title: string;
    description?: string;
    location?: string;
    startTime: Date;
    durationMinutes?: number;
    calendarId?: string;
    reminders?: Array<{ method: 'email' | 'popup'; minutes: number }>;
  }
): Promise<CalendarEvent | null> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    getLogger().warn({ userId }, 'No valid access token for calendar');
    return null;
  }

  const {
    title,
    description,
    location,
    startTime,
    durationMinutes = 60,
    calendarId = 'primary',
    reminders = [
      { method: 'popup', minutes: 30 },
      { method: 'email', minutes: 60 },
    ],
  } = options;

  const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

  const event: CalendarEvent = {
    summary: title,
    description: description ? `${description}\n\n— Added by Ferni` : '— Added by Ferni',
    location,
    start: {
      dateTime: startTime.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    end: {
      dateTime: endTime.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    reminders: {
      useDefault: false,
      overrides: reminders,
    },
  };

  try {
    return await createEvent(accessToken, calendarId, event);
  } catch (error) {
    getLogger().error({ userId, error }, 'Failed to create appointment event');
    return null;
  }
}

/**
 * Check if OAuth is configured (for the application)
 */
export function isOAuthConfigured(): boolean {
  return !!(GOOGLE_OAUTH_CLIENT_ID && GOOGLE_OAUTH_CLIENT_SECRET);
}

export default {
  generateAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getValidAccessToken,
  storeUserTokens,
  getUserTokens,
  deleteUserTokens,
  getAllCalendarUsers,
  listCalendars,
  createEvent,
  updateEvent,
  deleteEvent,
  getEvents,
  getFreeBusy,
  createAppointmentEvent,
  isCalendarConfigured,
  isOAuthConfigured,
  getServiceAccountToken,
  // Failed token tracking
  isTokenPermanentlyFailed,
  markTokenAsFailed,
  clearFailedTokenStatus,
  TokenPermanentlyInvalidError,
};
