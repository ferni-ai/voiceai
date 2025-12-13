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
import { getLogger } from '../utils/safe-logger.js';
import { getCircuitBreaker, CircuitOpenError } from '../utils/circuit-breaker.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_CALENDAR_CLIENT_ID || '';
const GOOGLE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '';
const GOOGLE_OAUTH_REDIRECT_URI =
  process.env.GOOGLE_CALENDAR_REDIRECT_URI || 'http://localhost:3003/auth/google/callback';

// Scopes needed for calendar operations
const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

// Circuit breaker for Google APIs - prevents hammering a failing service
const googleCalendarCircuitBreaker = getCircuitBreaker('google-calendar', {
  failureThreshold: 5, // Open circuit after 5 failures
  resetTimeout: 30_000, // Try again after 30s
  successThreshold: 2, // Need 2 successes to close
});

// ============================================================================
// TYPES
// ============================================================================

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  expiry_date?: number;
}

export interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  attendees?: Array<{ email: string; displayName?: string }>;
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{ method: 'email' | 'popup'; minutes: number }>;
  };
  colorId?: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
}

export interface CalendarListEntry {
  id: string;
  summary: string;
  primary?: boolean;
  accessRole: 'freeBusyReader' | 'reader' | 'writer' | 'owner';
}

/**
 * Error thrown when an OAuth token is permanently invalid (e.g., user revoked access).
 * These errors should NOT be retried - the user needs to re-authenticate.
 */
export class TokenPermanentlyInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenPermanentlyInvalidError';
  }
}

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

import type { Firestore as FirestoreType } from '@google-cloud/firestore';

let db: FirestoreType | null = null;
const OAUTH_TOKENS_COLLECTION = 'google_calendar_tokens';

async function getFirestore(): Promise<FirestoreType | null> {
  if (db) return db;

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    getLogger().info('Google Calendar OAuth Firestore initialized');
    return db;
  } catch (error) {
    getLogger().warn({ error }, 'Firestore not available for OAuth tokens, using in-memory only');
    return null;
  }
}

// ============================================================================
// TOKEN STORAGE (In-memory cache with Firestore persistence)
// ============================================================================

const userTokens = new Map<string, GoogleTokens>();
const loadedTokenUsers = new Set<string>();

// ============================================================================
// FAILED TOKEN TRACKING - Prevents spam when tokens are permanently invalid
// ============================================================================

/**
 * Cache of tokens that failed with permanent errors (like invalid_grant).
 * Maps userId -> timestamp when they failed. We won't retry for 1 hour.
 */
const failedTokenCache = new Map<string, number>();
const FAILED_TOKEN_RETRY_MS = 60 * 60 * 1000; // 1 hour before retry

/**
 * Check if a user's token recently failed with a permanent error
 */
export function isTokenPermanentlyFailed(userId: string): boolean {
  const failedAt = failedTokenCache.get(userId);
  if (!failedAt) return false;

  // Allow retry after FAILED_TOKEN_RETRY_MS
  if (Date.now() - failedAt > FAILED_TOKEN_RETRY_MS) {
    failedTokenCache.delete(userId);
    return false;
  }

  return true;
}

/**
 * Mark a token as permanently failed (e.g., invalid_grant)
 */
export function markTokenAsFailed(userId: string): void {
  failedTokenCache.set(userId, Date.now());
  getLogger().warn({ userId }, 'Marked OAuth token as failed - will not retry for 1 hour');
}

/**
 * Clear the failed token status for a user (e.g., after successful re-auth)
 */
export function clearFailedTokenStatus(userId: string): void {
  failedTokenCache.delete(userId);
}

/**
 * Store tokens for a user
 */
export async function storeUserTokens(userId: string, tokens: GoogleTokens): Promise<void> {
  // Calculate expiry date if not present
  if (!tokens.expiry_date && tokens.expires_in) {
    tokens.expiry_date = Date.now() + tokens.expires_in * 1000;
  }
  userTokens.set(userId, tokens);

  // Persist to Firestore
  const firestore = await getFirestore();
  if (firestore) {
    try {
      await firestore
        .collection(OAUTH_TOKENS_COLLECTION)
        .doc(userId)
        .set({
          ...tokens,
          updatedAt: new Date(),
        });
      getLogger().info(
        { userId, hasRefreshToken: !!tokens.refresh_token },
        'Stored Google tokens in Firestore'
      );
    } catch (err) {
      getLogger().warn({ err, userId }, 'Failed to persist Google tokens to Firestore');
    }
  } else {
    getLogger().info(
      { userId, hasRefreshToken: !!tokens.refresh_token },
      'Stored Google tokens (in-memory only)'
    );
  }
}

/**
 * Get tokens for a user
 */
export async function getUserTokens(userId: string): Promise<GoogleTokens | undefined> {
  // Check cache first
  if (userTokens.has(userId)) {
    return userTokens.get(userId);
  }

  // Try loading from Firestore
  if (!loadedTokenUsers.has(userId)) {
    const firestore = await getFirestore();
    if (firestore) {
      try {
        const doc = await firestore.collection(OAUTH_TOKENS_COLLECTION).doc(userId).get();
        if (doc.exists) {
          const data = doc.data() as GoogleTokens;
          userTokens.set(userId, data);
          loadedTokenUsers.add(userId);
          return data;
        }
      } catch (err) {
        getLogger().warn({ err, userId }, 'Failed to load Google tokens from Firestore');
      }
    }
    loadedTokenUsers.add(userId);
  }

  return userTokens.get(userId);
}

/**
 * Get tokens synchronously (returns cached value only)
 * Use getUserTokens for guaranteed data
 */
export function getUserTokensSync(userId: string): GoogleTokens | undefined {
  // Trigger async load in background
  void getUserTokens(userId);
  return userTokens.get(userId);
}

/**
 * Check if tokens are expired
 */
export function areTokensExpired(tokens: GoogleTokens): boolean {
  if (!tokens.expiry_date) return false;
  // Consider expired 5 minutes before actual expiry
  return Date.now() >= tokens.expiry_date - 5 * 60 * 1000;
}

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
    getLogger().error({ status: response.status, error }, 'Failed to refresh access token');

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

  let tokens = await getUserTokens(userId);
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
// CALENDAR OPERATIONS
// ============================================================================

/**
 * List user's calendars (with circuit breaker protection)
 */
export async function listCalendars(accessToken: string): Promise<CalendarListEntry[]> {
  return googleCalendarCircuitBreaker.execute(async () => {
    const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to list calendars: ${error}`);
    }

    const data = (await response.json()) as { items: CalendarListEntry[] };
    return data.items || [];
  });
}

/**
 * Create a calendar event (with circuit breaker protection)
 */
export async function createEvent(
  accessToken: string,
  calendarId: string,
  event: CalendarEvent
): Promise<CalendarEvent> {
  return googleCalendarCircuitBreaker.execute(async () => {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create event: ${error}`);
    }

    const created = (await response.json()) as CalendarEvent;
    getLogger().info({ eventId: created.id, summary: event.summary }, '📅 Calendar event created');
    return created;
  });
}

/**
 * Update a calendar event
 */
export async function updateEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: Partial<CalendarEvent>
): Promise<CalendarEvent> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update event: ${error}`);
  }

  return (await response.json()) as CalendarEvent;
}

/**
 * Delete a calendar event
 */
export async function deleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok && response.status !== 404) {
    const error = await response.text();
    throw new Error(`Failed to delete event: ${error}`);
  }

  getLogger().info({ eventId }, '📅 Calendar event deleted');
}

/**
 * Get events in a time range
 */
export async function getEvents(
  accessToken: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
  maxResults = 50
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    maxResults: maxResults.toString(),
    singleEvents: 'true',
    orderBy: 'startTime',
  });

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get events: ${error}`);
  }

  const data = (await response.json()) as { items: CalendarEvent[] };
  return data.items || [];
}

/**
 * Find free/busy times
 */
export async function getFreeBusy(
  accessToken: string,
  calendarIds: string[],
  timeMin: Date,
  timeMax: Date
): Promise<Record<string, Array<{ start: string; end: string }>>> {
  const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: calendarIds.map((id) => ({ id })),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get free/busy: ${error}`);
  }

  const data = (await response.json()) as {
    calendars: Record<string, { busy: Array<{ start: string; end: string }> }>;
  };

  const result: Record<string, Array<{ start: string; end: string }>> = {};
  for (const [calId, cal] of Object.entries(data.calendars)) {
    result[calId] = cal.busy || [];
  }
  return result;
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
 * Check if calendar is configured for a user
 */
export async function isCalendarConfigured(userId: string): Promise<boolean> {
  const tokens = await getUserTokens(userId);
  return !!tokens;
}

/**
 * Check if calendar is configured (sync version, may return false until loaded)
 */
export function isCalendarConfiguredSync(userId: string): boolean {
  return !!getUserTokensSync(userId);
}

/**
 * Check if OAuth is configured (for the application)
 */
export function isOAuthConfigured(): boolean {
  return !!(GOOGLE_OAUTH_CLIENT_ID && GOOGLE_OAUTH_CLIENT_SECRET);
}

/**
 * Delete user tokens (for disconnect)
 */
export async function deleteUserTokens(userId: string): Promise<void> {
  // Remove from cache
  userTokens.delete(userId);
  loadedTokenUsers.delete(userId);

  // Remove from Firestore
  const firestore = await getFirestore();
  if (firestore) {
    try {
      const docRef = firestore.collection('calendar_tokens').doc(userId);
      await docRef.delete();
      getLogger().info({ userId }, 'Calendar tokens deleted');
    } catch (error) {
      getLogger().warn({ error, userId }, 'Failed to delete calendar tokens from Firestore');
    }
  }
}

/**
 * Get all users with connected Google Calendar
 *
 * Used by maintenance scheduler to sync calendar events for outreach timing.
 */
export async function getAllCalendarUsers(): Promise<string[]> {
  const userIds: string[] = [];

  // First add all cached users
  for (const userId of userTokens.keys()) {
    userIds.push(userId);
  }

  // Then check Firestore for any not in cache
  const firestore = await getFirestore();
  if (firestore) {
    try {
      const snapshot = await firestore.collection(OAUTH_TOKENS_COLLECTION).get();
      for (const doc of snapshot.docs) {
        if (!userIds.includes(doc.id)) {
          userIds.push(doc.id);
        }
      }
    } catch (error) {
      getLogger().warn({ error }, 'Failed to get calendar users from Firestore');
    }
  }

  return userIds;
}

// ============================================================================
// SERVICE ACCOUNT SUPPORT
// ============================================================================

/**
 * Get access token using service account credentials
 */
export async function getServiceAccountToken(credentials: {
  client_email: string;
  private_key: string;
}): Promise<string | null> {
  try {
    const now = Math.floor(Date.now() / 1000);

    // Create JWT header
    const header = { alg: 'RS256', typ: 'JWT' };
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');

    // Create JWT payload
    const payload = {
      iss: credentials.client_email,
      scope: CALENDAR_SCOPES.join(' '),
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

    // Sign the JWT
    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signatureInput);
    const signature = sign.sign(credentials.private_key, 'base64url');

    const jwt = `${signatureInput}.${signature}`;

    // Exchange JWT for access token
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      getLogger().error({ error }, 'Service account token exchange failed');
      return null;
    }

    const tokens = (await response.json()) as { access_token: string };
    return tokens.access_token;
  } catch (error) {
    getLogger().error({ error }, 'Failed to get service account token');
    return null;
  }
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
