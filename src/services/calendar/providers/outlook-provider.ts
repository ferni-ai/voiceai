/**
 * Outlook Calendar Provider
 *
 * Adapter for Microsoft Outlook/Office 365 Calendar via Microsoft Graph API.
 *
 * Implementation:
 * - Uses Microsoft Graph API (v1.0)
 * - OAuth 2.0 with Azure AD / Microsoft Entra ID
 * - Supports both personal Microsoft accounts and work/school accounts
 * - Rich feature set including Teams meetings
 *
 * Setup:
 * 1. Register app in Azure portal (portal.azure.com)
 * 2. Configure OAuth redirect URIs
 * 3. Grant Calendars.ReadWrite and User.Read permissions
 * 4. Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET env vars
 *
 * @module calendar/providers/outlook-provider
 */

import { getLogger } from '../../../utils/safe-logger.js';
import type {
  CalendarProviderAdapter,
  CalendarEvent,
  CalendarProvider,
  EventReminder,
} from '../types.js';

const log = getLogger();

// ============================================================================
// MICROSOFT GRAPH CONSTANTS
// ============================================================================

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';
const AUTH_BASE_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0';

const SCOPES = ['openid', 'profile', 'offline_access', 'User.Read', 'Calendars.ReadWrite'];

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

import type { Firestore as FirestoreType } from '@google-cloud/firestore';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

let db: FirestoreType | null = null;

async function getFirestore(): Promise<FirestoreType | null> {
  if (db) return db;

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    return db;
  } catch (error) {
    log.warn({ error }, 'Firestore not available for Outlook');
    return null;
  }
}

// ============================================================================
// TYPES
// ============================================================================

interface MicrosoftTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email?: string;
  displayName?: string;
}

interface GraphEvent {
  id?: string;
  subject?: string;
  body?: { contentType: string; content: string };
  bodyPreview?: string;
  start?: { dateTime: string; timeZone: string };
  end?: { dateTime: string; timeZone: string };
  location?: { displayName: string };
  attendees?: Array<{ emailAddress: { address: string; name?: string }; type: string }>;
  isAllDay?: boolean;
  isCancelled?: boolean;
  recurrence?: {
    pattern: { type: string; interval: number; daysOfWeek?: string[] };
    range: { type: string; startDate: string; endDate?: string };
  };
  isOnlineMeeting?: boolean;
  onlineMeetingUrl?: string;
  reminderMinutesBeforeStart?: number;
  showAs?: string;
  changeKey?: string;
}

interface GraphCalendar {
  id: string;
  name: string;
  isDefaultCalendar?: boolean;
  canEdit?: boolean;
  color?: string;
}

// ============================================================================
// MICROSOFT GRAPH CLIENT
// ============================================================================

class MicrosoftGraphClient {
  private tokens: MicrosoftTokens;
  private userId: string;
  private onTokenRefresh?: (tokens: MicrosoftTokens) => Promise<void>;

  constructor(
    tokens: MicrosoftTokens,
    userId: string,
    onTokenRefresh?: (tokens: MicrosoftTokens) => Promise<void>
  ) {
    this.tokens = tokens;
    this.userId = userId;
    this.onTokenRefresh = onTokenRefresh;
  }

  /**
   * Make an authenticated request to Microsoft Graph
   */
  private async request<T>(method: string, endpoint: string, body?: unknown): Promise<T | null> {
    // Refresh token if expired
    if (Date.now() >= this.tokens.expiresAt - 60000) {
      const refreshed = await this.refreshAccessToken();
      if (!refreshed) {
        log.error({ userId: this.userId }, 'Failed to refresh Microsoft token');
        return null;
      }
    }

    const url = endpoint.startsWith('http') ? endpoint : `${GRAPH_BASE_URL}${endpoint}`;

    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.tokens.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.error({ status: response.status, error: errorText }, 'Graph API error');
        return null;
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return {} as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      log.error({ error: String(error) }, 'Graph API request failed');
      return null;
    }
  }

  /**
   * Refresh the access token
   */
  private async refreshAccessToken(): Promise<boolean> {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      log.error('Microsoft OAuth not configured');
      return false;
    }

    try {
      const response = await fetch(`${AUTH_BASE_URL}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: this.tokens.refreshToken,
          grant_type: 'refresh_token',
          scope: SCOPES.join(' '),
        }),
      });

      if (!response.ok) {
        log.error({ status: response.status }, 'Token refresh failed');
        return false;
      }

      const data = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
      };

      this.tokens = {
        ...this.tokens,
        accessToken: data.access_token,
        refreshToken: data.refresh_token || this.tokens.refreshToken,
        expiresAt: Date.now() + data.expires_in * 1000,
      };

      // Notify about token refresh
      if (this.onTokenRefresh) {
        await this.onTokenRefresh(this.tokens);
      }

      log.debug({ userId: this.userId }, 'Microsoft token refreshed');
      return true;
    } catch (error) {
      log.error({ error: String(error) }, 'Error refreshing Microsoft token');
      return false;
    }
  }

  /**
   * Get user profile
   */
  async getProfile(): Promise<{ email: string; displayName: string } | null> {
    const profile = await this.request<{
      mail?: string;
      userPrincipalName: string;
      displayName: string;
    }>('GET', '/me');

    if (!profile) return null;

    return {
      email: profile.mail || profile.userPrincipalName,
      displayName: profile.displayName,
    };
  }

  /**
   * List user's calendars
   */
  async listCalendars(): Promise<GraphCalendar[]> {
    const result = await this.request<{ value: GraphCalendar[] }>('GET', '/me/calendars');
    return result?.value || [];
  }

  /**
   * Get events from calendar view (respects recurrence)
   */
  async getEvents(startDate: Date, endDate: Date, calendarId?: string): Promise<GraphEvent[]> {
    const startISO = startDate.toISOString();
    const endISO = endDate.toISOString();

    const endpoint = calendarId
      ? `/me/calendars/${calendarId}/calendarView?startDateTime=${startISO}&endDateTime=${endISO}&$top=100`
      : `/me/calendarView?startDateTime=${startISO}&endDateTime=${endISO}&$top=100`;

    const result = await this.request<{ value: GraphEvent[] }>('GET', endpoint);
    return result?.value || [];
  }

  /**
   * Create a new event
   */
  async createEvent(event: GraphEvent, calendarId?: string): Promise<GraphEvent | null> {
    const endpoint = calendarId ? `/me/calendars/${calendarId}/events` : '/me/events';

    return this.request<GraphEvent>('POST', endpoint, event);
  }

  /**
   * Update an event
   */
  async updateEvent(eventId: string, event: Partial<GraphEvent>): Promise<GraphEvent | null> {
    return this.request<GraphEvent>('PATCH', `/me/events/${eventId}`, event);
  }

  /**
   * Delete an event
   */
  async deleteEvent(eventId: string): Promise<boolean> {
    const result = await this.request('DELETE', `/me/events/${eventId}`);
    return result !== null;
  }

  /**
   * Get free/busy schedule
   */
  async getSchedule(
    emails: string[],
    startDate: Date,
    endDate: Date
  ): Promise<Array<{ email: string; busy: Array<{ start: Date; end: Date }> }>> {
    const result = await this.request<{
      value: Array<{
        scheduleId: string;
        scheduleItems: Array<{ start: { dateTime: string }; end: { dateTime: string } }>;
      }>;
    }>('POST', '/me/calendar/getSchedule', {
      schedules: emails,
      startTime: { dateTime: startDate.toISOString(), timeZone: 'UTC' },
      endTime: { dateTime: endDate.toISOString(), timeZone: 'UTC' },
    });

    return (result?.value || []).map((schedule) => ({
      email: schedule.scheduleId,
      busy: schedule.scheduleItems.map((item) => ({
        start: new Date(item.start.dateTime),
        end: new Date(item.end.dateTime),
      })),
    }));
  }
}

// ============================================================================
// OUTLOOK CALENDAR PROVIDER
// ============================================================================

/**
 * Outlook Calendar Provider Adapter (Microsoft Graph)
 */
export class OutlookCalendarProvider implements CalendarProviderAdapter {
  readonly provider: CalendarProvider = 'outlook';

  /**
   * Check if Microsoft OAuth is configured
   */
  isConfigured(): boolean {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    return !!(clientId && clientSecret);
  }

  /**
   * Check if user has connected their Microsoft account
   */
  async isConnected(userId: string): Promise<boolean> {
    const tokens = await this.getTokens(userId);
    return !!(tokens?.accessToken && tokens?.refreshToken);
  }

  /**
   * Get Microsoft OAuth authorization URL
   */
  getAuthUrl(userId: string, redirectUri: string): string {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    if (!clientId) {
      throw new Error('MICROSOFT_CLIENT_ID not configured');
    }

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: SCOPES.join(' '),
      state: userId,
      prompt: 'consent',
    });

    return `${AUTH_BASE_URL}/authorize?${params.toString()}`;
  }

  /**
   * Handle Microsoft OAuth callback
   */
  async handleAuthCallback(userId: string, code: string, redirectUri?: string): Promise<boolean> {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    const redirect = redirectUri || process.env.MICROSOFT_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirect) {
      log.error('Microsoft OAuth not configured');
      return false;
    }

    try {
      // Exchange code for tokens
      const response = await fetch(`${AUTH_BASE_URL}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirect,
          grant_type: 'authorization_code',
          scope: SCOPES.join(' '),
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        log.error({ status: response.status, error }, 'Microsoft token exchange failed');
        return false;
      }

      const data = (await response.json()) as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
      };

      const tokens: MicrosoftTokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + data.expires_in * 1000,
      };

      // Get user profile
      const client = new MicrosoftGraphClient(tokens, userId);
      const profile = await client.getProfile();

      if (profile) {
        tokens.email = profile.email;
        tokens.displayName = profile.displayName;
      }

      // Store tokens
      await this.storeTokens(userId, tokens);

      log.info({ userId, email: tokens.email }, 'Connected Microsoft account');
      return true;
    } catch (error) {
      log.error({ error: String(error), userId }, 'Error during Microsoft OAuth');
      return false;
    }
  }

  /**
   * Disconnect user's Microsoft account
   */
  async disconnect(userId: string): Promise<void> {
    await this.deleteTokens(userId);
    log.info({ userId }, 'Disconnected Microsoft account');
  }

  /**
   * Fetch events from Outlook Calendar
   */
  async fetchEvents(
    userId: string,
    startDate: Date,
    endDate: Date,
    calendarId?: string
  ): Promise<CalendarEvent[]> {
    const tokens = await this.getTokens(userId);
    if (!tokens) {
      log.warn({ userId }, 'No Microsoft tokens found');
      return [];
    }

    const client = new MicrosoftGraphClient(tokens, userId, (newTokens) =>
      this.storeTokens(userId, newTokens)
    );

    try {
      const graphEvents = await client.getEvents(startDate, endDate, calendarId);

      const events = graphEvents.map((ge) => this.graphToCalendarEvent(ge, userId));
      log.debug({ userId, eventCount: events.length }, 'Fetched Outlook events');

      return events;
    } catch (error) {
      log.error({ error: String(error), userId }, 'Error fetching Outlook events');
      return [];
    }
  }

  /**
   * Create event in Outlook Calendar
   */
  async createEvent(userId: string, event: CalendarEvent): Promise<string | null> {
    const tokens = await this.getTokens(userId);
    if (!tokens) {
      log.warn({ userId }, 'No Microsoft tokens found');
      return null;
    }

    const client = new MicrosoftGraphClient(tokens, userId, (newTokens) =>
      this.storeTokens(userId, newTokens)
    );

    const graphEvent = this.calendarEventToGraph(event);
    const created = await client.createEvent(graphEvent, event.externalCalendarId);

    if (created?.id) {
      log.info({ userId, eventId: created.id }, 'Created Outlook event');
      return created.id;
    }

    return null;
  }

  /**
   * Update event in Outlook Calendar
   */
  async updateEvent(userId: string, event: CalendarEvent): Promise<boolean> {
    if (!event.externalId) {
      log.warn({ userId, eventId: event.id }, 'Missing external ID for Outlook update');
      return false;
    }

    const tokens = await this.getTokens(userId);
    if (!tokens) {
      return false;
    }

    const client = new MicrosoftGraphClient(tokens, userId, (newTokens) =>
      this.storeTokens(userId, newTokens)
    );

    const graphEvent = this.calendarEventToGraph(event);
    const updated = await client.updateEvent(event.externalId, graphEvent);

    if (updated) {
      log.info({ userId, externalId: event.externalId }, 'Updated Outlook event');
      return true;
    }

    return false;
  }

  /**
   * Delete event from Outlook Calendar
   */
  async deleteEvent(userId: string, eventId: string, _calendarId?: string): Promise<boolean> {
    const tokens = await this.getTokens(userId);
    if (!tokens) {
      return false;
    }

    const client = new MicrosoftGraphClient(tokens, userId, (newTokens) =>
      this.storeTokens(userId, newTokens)
    );

    const success = await client.deleteEvent(eventId);

    if (success) {
      log.info({ userId, eventId }, 'Deleted Outlook event');
    }

    return success;
  }

  /**
   * Get user's Outlook calendars
   */
  async getCalendars(
    userId: string
  ): Promise<Array<{ id: string; name: string; primary: boolean }>> {
    const tokens = await this.getTokens(userId);
    if (!tokens) {
      return [];
    }

    const client = new MicrosoftGraphClient(tokens, userId, (newTokens) =>
      this.storeTokens(userId, newTokens)
    );

    try {
      const calendars = await client.listCalendars();

      return calendars.map((c) => ({
        id: c.id,
        name: c.name,
        primary: c.isDefaultCalendar || false,
      }));
    } catch (error) {
      log.error({ error: String(error), userId }, 'Error listing Outlook calendars');
      return [];
    }
  }

  // ============================================================================
  // OUTLOOK-SPECIFIC METHODS
  // ============================================================================

  /**
   * Create a Teams meeting link for an event
   */
  async createTeamsMeeting(userId: string, eventId: string): Promise<string | null> {
    const tokens = await this.getTokens(userId);
    if (!tokens) return null;

    const client = new MicrosoftGraphClient(tokens, userId, (newTokens) =>
      this.storeTokens(userId, newTokens)
    );

    const updated = await client.updateEvent(eventId, { isOnlineMeeting: true });
    return updated?.onlineMeetingUrl || null;
  }

  /**
   * Get free/busy information
   */
  async getFreeBusy(
    userId: string,
    attendees: string[],
    startDate: Date,
    endDate: Date
  ): Promise<Array<{ email: string; busy: Array<{ start: Date; end: Date }> }>> {
    const tokens = await this.getTokens(userId);
    if (!tokens) return [];

    const client = new MicrosoftGraphClient(tokens, userId, (newTokens) =>
      this.storeTokens(userId, newTokens)
    );

    return client.getSchedule(attendees, startDate, endDate);
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private async getTokens(userId: string): Promise<MicrosoftTokens | null> {
    const firestore = await getFirestore();
    if (!firestore) return null;

    try {
      const doc = await firestore
        .collection(`users/${userId}/calendar_providers`)
        .doc('outlook')
        .get();

      if (!doc.exists) return null;

      const data = doc.data();
      return data?.tokens || null;
    } catch {
      return null;
    }
  }

  private async storeTokens(userId: string, tokens: MicrosoftTokens): Promise<void> {
    const firestore = await getFirestore();
    if (!firestore) return;

    try {
      await firestore.collection(`users/${userId}/calendar_providers`).doc('outlook').set(
        cleanForFirestore({
          provider: 'outlook',
          connected: true,
          email: tokens.email,
          displayName: tokens.displayName,
          syncEnabled: true,
          syncDirection: 'two-way',
          tokens,
          lastSyncedAt: null,
        }),
        { merge: true }
      );
    } catch (error) {
      log.error({ error: String(error) }, 'Error storing Microsoft tokens');
    }
  }

  private async deleteTokens(userId: string): Promise<void> {
    const firestore = await getFirestore();
    if (!firestore) return;

    try {
      await firestore.collection(`users/${userId}/calendar_providers`).doc('outlook').delete();
    } catch (error) {
      log.error({ error: String(error) }, 'Error deleting Microsoft tokens');
    }
  }

  private graphToCalendarEvent(ge: GraphEvent, userId: string): CalendarEvent {
    const startTime = ge.start?.dateTime
      ? new Date(ge.start.dateTime + (ge.start.timeZone === 'UTC' ? 'Z' : ''))
      : new Date();
    const endTime = ge.end?.dateTime
      ? new Date(ge.end.dateTime + (ge.end.timeZone === 'UTC' ? 'Z' : ''))
      : new Date(startTime.getTime() + 60 * 60 * 1000);

    const reminders: EventReminder[] = ge.reminderMinutesBeforeStart
      ? [{ method: 'popup', minutesBefore: ge.reminderMinutesBeforeStart }]
      : [];

    let status: 'confirmed' | 'tentative' | 'cancelled' = 'confirmed';
    if (ge.isCancelled) status = 'cancelled';
    else if (ge.showAs === 'tentative') status = 'tentative';

    return {
      id: `outlook_${ge.id}`,
      userId,
      title: ge.subject || '(No title)',
      description: ge.bodyPreview || ge.body?.content,
      location: ge.location?.displayName,
      startTime,
      endTime,
      isAllDay: ge.isAllDay || false,
      attendees: (ge.attendees || []).map((a) => a.emailAddress.address),
      status,
      source: 'outlook',
      externalId: ge.id,
      syncStatus: 'synced',
      reminders,
      createdAt: new Date(),
      updatedAt: new Date(),
      etag: ge.changeKey,
    };
  }

  private calendarEventToGraph(event: CalendarEvent): GraphEvent {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const graphEvent: GraphEvent = {
      subject: event.title,
      body: event.description ? { contentType: 'text', content: event.description } : undefined,
      start: {
        dateTime: event.startTime.toISOString().replace('Z', ''),
        timeZone,
      },
      end: {
        dateTime: event.endTime.toISOString().replace('Z', ''),
        timeZone,
      },
      isAllDay: event.isAllDay,
    };

    if (event.location) {
      graphEvent.location = { displayName: event.location };
    }

    if (event.attendees.length > 0) {
      graphEvent.attendees = event.attendees.map((email) => ({
        emailAddress: { address: email },
        type: 'required',
      }));
    }

    if (event.reminders.length > 0) {
      graphEvent.reminderMinutesBeforeStart = event.reminders[0].minutesBefore;
    }

    return graphEvent;
  }
}

export const outlookCalendarProvider = new OutlookCalendarProvider();
export default OutlookCalendarProvider;
