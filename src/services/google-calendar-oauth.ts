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

import { getLogger } from '../utils/safe-logger.js';
import crypto from 'node:crypto';

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

// ============================================================================
// TOKEN STORAGE
// ============================================================================

// In-memory token storage (production should use persistent storage)
const userTokens = new Map<string, GoogleTokens>();

/**
 * Store tokens for a user
 */
export function storeUserTokens(userId: string, tokens: GoogleTokens): void {
  // Calculate expiry date if not present
  if (!tokens.expiry_date && tokens.expires_in) {
    tokens.expiry_date = Date.now() + tokens.expires_in * 1000;
  }
  userTokens.set(userId, tokens);
  getLogger().info({ userId, hasRefreshToken: !!tokens.refresh_token }, 'Stored Google tokens');
}

/**
 * Get tokens for a user
 */
export function getUserTokens(userId: string): GoogleTokens | undefined {
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
  let tokens = getUserTokens(userId);
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
      storeUserTokens(userId, tokens);
    } catch (error) {
      getLogger().error({ userId, error }, 'Failed to refresh tokens');
      return null;
    }
  }

  return tokens.access_token;
}

// ============================================================================
// CALENDAR OPERATIONS
// ============================================================================

/**
 * List user's calendars
 */
export async function listCalendars(accessToken: string): Promise<CalendarListEntry[]> {
  const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list calendars: ${error}`);
  }

  const data = (await response.json()) as { items: CalendarListEntry[] };
  return data.items || [];
}

/**
 * Create a calendar event
 */
export async function createEvent(
  accessToken: string,
  calendarId: string,
  event: CalendarEvent
): Promise<CalendarEvent> {
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
export function isCalendarConfigured(userId: string): boolean {
  return !!getUserTokens(userId);
}

/**
 * Check if OAuth is configured (for the application)
 */
export function isOAuthConfigured(): boolean {
  return !!(GOOGLE_OAUTH_CLIENT_ID && GOOGLE_OAUTH_CLIENT_SECRET);
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
};
