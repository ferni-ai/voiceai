/**
 * Google Calendar REST operations (list/create/update/delete events,
 * free/busy) and service-account token exchange.
 * Extracted from google-calendar-oauth.ts.
 */

import crypto from 'node:crypto';
import { getLogger } from '../../utils/safe-logger.js';
import { getRateLimiter } from '../../tools/rate-limiter.js';
import { CALENDAR_SCOPES, googleCalendarCircuitBreaker } from './google-calendar-config.js';
import type { CalendarEvent, CalendarListEntry } from './google-calendar-types.js';

// ============================================================================
// CALENDAR OPERATIONS
// ============================================================================

/**
 * List user's calendars (with rate limiting and circuit breaker protection)
 */
export async function listCalendars(accessToken: string): Promise<CalendarListEntry[]> {
  const rateLimiter = getRateLimiter('google-calendar');
  if (!rateLimiter.tryAcquire()) {
    getLogger().warn('Google Calendar API rate limited');
    return [];
  }

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
 * Create a calendar event (with rate limiting and circuit breaker protection)
 */
export async function createEvent(
  accessToken: string,
  calendarId: string,
  event: CalendarEvent
): Promise<CalendarEvent> {
  const rateLimiter = getRateLimiter('google-calendar');
  if (!rateLimiter.tryAcquire()) {
    getLogger().warn('Google Calendar API rate limited');
    throw new Error('Rate limited - try again shortly');
  }

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
    getLogger().info({ eventId: created.id, summary: event.summary }, 'Calendar event created');
    return created;
  });
}

/**
 * Update a calendar event (with rate limiting)
 */
export async function updateEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: Partial<CalendarEvent>
): Promise<CalendarEvent> {
  const rateLimiter = getRateLimiter('google-calendar');
  if (!rateLimiter.tryAcquire()) {
    getLogger().warn('Google Calendar API rate limited');
    throw new Error('Rate limited - try again shortly');
  }

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
 * Delete a calendar event (with rate limiting)
 */
export async function deleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  const rateLimiter = getRateLimiter('google-calendar');
  if (!rateLimiter.tryAcquire()) {
    getLogger().warn('Google Calendar API rate limited');
    throw new Error('Rate limited - try again shortly');
  }

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

  getLogger().info({ eventId }, 'Calendar event deleted');
}

/**
 * Get events in a time range (with rate limiting)
 */
export async function getEvents(
  accessToken: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
  maxResults = 50
): Promise<CalendarEvent[]> {
  const rateLimiter = getRateLimiter('google-calendar');
  if (!rateLimiter.tryAcquire()) {
    getLogger().warn('Google Calendar API rate limited');
    return [];
  }

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
