/**
 * Google Calendar Provider
 *
 * Adapter for Google Calendar API integration.
 * Wraps the existing google-calendar-oauth.ts service.
 *
 * @module calendar/providers/google-provider
 */

import { getLogger } from '../../../utils/safe-logger.js';
import type {
  CalendarProviderAdapter,
  CalendarEvent,
  CalendarProvider,
} from '../types.js';
import {
  isOAuthConfigured,
  getValidAccessToken,
  getEvents as getGoogleEvents,
  createEvent as createGoogleEvent,
  updateEvent as updateGoogleEvent,
  deleteEvent as deleteGoogleEvent,
  deleteUserTokens,
  type CalendarEvent as GoogleCalendarEvent,
} from '../../google-calendar-oauth.js';

const log = getLogger();

/**
 * Convert Google Calendar event to unified format
 */
function googleToUnified(event: GoogleCalendarEvent, userId: string): Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'> {
  const startDateTime = event.start?.dateTime || event.start?.date;
  const endDateTime = event.end?.dateTime || event.end?.date;

  return {
    userId,
    title: event.summary || '(No title)',
    description: event.description,
    location: event.location,
    startTime: new Date(startDateTime || Date.now()),
    endTime: new Date(endDateTime || Date.now()),
    isAllDay: !event.start?.dateTime,
    attendees: (event.attendees || []).map((a) => a.email),
    status: (event.status as 'confirmed' | 'tentative' | 'cancelled') || 'confirmed',
    source: 'google' as CalendarProvider,
    externalId: event.id,
    externalCalendarId: 'primary',
    syncStatus: 'synced',
    reminders: (event.reminders?.overrides || []).map((r) => ({
      method: r.method as 'email' | 'popup',
      minutesBefore: r.minutes,
    })),
  };
}

/**
 * Convert unified event to Google Calendar format
 */
function unifiedToGoogle(event: CalendarEvent): GoogleCalendarEvent {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return {
    id: event.externalId,
    summary: event.title,
    description: event.description,
    location: event.location,
    start: event.isAllDay
      ? { date: event.startTime.toISOString().split('T')[0] }
      : { dateTime: event.startTime.toISOString(), timeZone },
    end: event.isAllDay
      ? { date: event.endTime.toISOString().split('T')[0] }
      : { dateTime: event.endTime.toISOString(), timeZone },
    attendees: event.attendees.map((email) => ({ email })),
    status: event.status,
    reminders: {
      useDefault: event.reminders.length === 0,
      overrides: event.reminders.map((r) => ({
        method: r.method === 'push' ? 'popup' : r.method,
        minutes: r.minutesBefore,
      })),
    },
  };
}

/**
 * Google Calendar Provider Adapter
 */
export class GoogleCalendarProvider implements CalendarProviderAdapter {
  readonly provider: CalendarProvider = 'google';

  /**
   * Check if Google Calendar is configured (has OAuth credentials)
   */
  isConfigured(): boolean {
    // Use the service check which can be mocked in tests
    return isOAuthConfigured() || !!(process.env.GOOGLE_CALENDAR_CLIENT_ID && process.env.GOOGLE_CALENDAR_CLIENT_SECRET);
  }

  /**
   * Check if user has connected their Google account
   */
  async isConnected(userId: string): Promise<boolean> {
    if (!this.isConfigured()) return false;

    try {
      const token = await getValidAccessToken(userId);
      return !!token;
    } catch {
      return false;
    }
  }

  /**
   * Get Google OAuth authorization URL
   */
  getAuthUrl(userId: string, redirectUri: string): string {
    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
    if (!clientId) {
      throw new Error('GOOGLE_CALENDAR_CLIENT_ID not configured');
    }

    const scopes = [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
    ].join(' ');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      access_type: 'offline',
      prompt: 'consent',
      state: userId,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Handle OAuth callback (delegated to google-calendar-oauth.ts)
   */
  async handleAuthCallback(userId: string, code: string): Promise<boolean> {
    // This is handled by the existing OAuth flow in ui-server.js
    // The callback stores tokens via google-calendar-oauth.ts
    log.info({ userId }, 'Google OAuth callback - handled by oauth flow');
    return true;
  }

  /**
   * Disconnect user's Google Calendar
   */
  async disconnect(userId: string): Promise<void> {
    await deleteUserTokens(userId);
    log.info({ userId }, 'Disconnected Google Calendar');
  }

  /**
   * Fetch events from Google Calendar
   */
  async fetchEvents(
    userId: string,
    startDate: Date,
    endDate: Date,
    calendarId: string = 'primary'
  ): Promise<CalendarEvent[]> {
    const accessToken = await getValidAccessToken(userId);
    if (!accessToken) {
      log.warn({ userId }, 'No valid Google access token');
      return [];
    }

    try {
      const events = await getGoogleEvents(accessToken, calendarId, startDate, endDate);

      return events.map((e) => ({
        ...googleToUnified(e, userId),
        id: `google_${e.id}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      })) as CalendarEvent[];
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to fetch Google Calendar events');
      return [];
    }
  }

  /**
   * Create event in Google Calendar
   */
  async createEvent(userId: string, event: CalendarEvent): Promise<string | null> {
    const accessToken = await getValidAccessToken(userId);
    if (!accessToken) {
      log.warn({ userId }, 'No valid Google access token for create');
      return null;
    }

    try {
      const googleEvent = unifiedToGoogle(event);
      const created = await createGoogleEvent(
        accessToken,
        event.externalCalendarId || 'primary',
        googleEvent
      );

      return created?.id || null;
    } catch (error) {
      log.error({ error: String(error), userId, eventId: event.id }, 'Failed to create Google Calendar event');
      return null;
    }
  }

  /**
   * Update event in Google Calendar
   */
  async updateEvent(userId: string, event: CalendarEvent): Promise<boolean> {
    if (!event.externalId) {
      log.warn({ userId, eventId: event.id }, 'Cannot update - no external ID');
      return false;
    }

    const accessToken = await getValidAccessToken(userId);
    if (!accessToken) {
      log.warn({ userId }, 'No valid Google access token for update');
      return false;
    }

    try {
      const googleEvent = unifiedToGoogle(event);
      await updateGoogleEvent(
        accessToken,
        event.externalCalendarId || 'primary',
        event.externalId,
        googleEvent
      );

      return true;
    } catch (error) {
      log.error({ error: String(error), userId, eventId: event.id }, 'Failed to update Google Calendar event');
      return false;
    }
  }

  /**
   * Delete event from Google Calendar
   */
  async deleteEvent(userId: string, eventId: string, calendarId: string = 'primary'): Promise<boolean> {
    const accessToken = await getValidAccessToken(userId);
    if (!accessToken) {
      log.warn({ userId }, 'No valid Google access token for delete');
      return false;
    }

    try {
      await deleteGoogleEvent(accessToken, calendarId, eventId);
      return true;
    } catch (error) {
      log.error({ error: String(error), userId, eventId }, 'Failed to delete Google Calendar event');
      return false;
    }
  }

  /**
   * Get list of user's calendars
   */
  async getCalendars(userId: string): Promise<Array<{ id: string; name: string; primary: boolean }>> {
    const accessToken = await getValidAccessToken(userId);
    if (!accessToken) {
      return [];
    }

    try {
      const response = await fetch(
        'https://www.googleapis.com/calendar/v3/users/me/calendarList',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch calendars: ${response.status}`);
      }

      const data = (await response.json()) as { items?: Array<{ id: string; summary: string; primary?: boolean }> };
      return (data.items || []).map((cal) => ({
        id: cal.id,
        name: cal.summary,
        primary: !!cal.primary,
      }));
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to fetch calendar list');
      return [];
    }
  }
}

export const googleCalendarProvider = new GoogleCalendarProvider();
export default GoogleCalendarProvider;

